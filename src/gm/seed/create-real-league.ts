/**
 * Map real PlayerSeason rows → Franchise Lab GmPlayer / league.
 * Impact prefers DARKO DPM, then RAPTOR, then a stats heuristic.
 */

import { ensureSimProfile } from "@/gm/engine/player-profile";
import type { PlayerSeason } from "@/data/types";
import type {
  GmCountingLine,
  GmLeagueState,
  GmPlayer,
  GmPosition,
  GmRatings,
  GmScheduleGame,
  GmTeam,
  ScoutedRatings,
} from "@/gm/types";
import { DEFAULT_SETTINGS } from "@/gm/types";
import { FRANCHISES, emptyStarters } from "@/gm/seed/franchises";
import { createRng, clamp, pick, randInt, uid } from "@/gm/engine/rng";
import { generateSchedule } from "@/gm/engine/schedule";
import { emptyStandings } from "@/gm/engine/standings";
import {
  assignLeaguePositions,
  POSITION_BOOK_VERSION,
  withListedPositions,
} from "@/gm/engine/lineup";
import { applyBalancedRotations } from "@/gm/engine/coaching";
import { coachForTeam, openCoachMarket, trainerForLevel } from "@/gm/seed/coaches";
import { resolveTeamBrand } from "@/lib/nba-brand";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
  startYearFromCanonicalSeason,
} from "@/data/providers/historical/season-range";
import { getCbaRules } from "@/gm/myleague/cba-registry";
import { resolvePlayerContract } from "@/gm/seed/contracts";
import { getBundledPlayerBio } from "@/data/runtime/player-bio-snapshot";
import { createDraftClass } from "@/gm/seed/prospect-identities";
import { sealProspect } from "@/gm/engine/scouting";
import { buildSheet, type SheetStatHint } from "@/gm/engine/attributes";
import {
  applyRookieRatings,
  estimateActivePotential,
} from "@/gm/engine/rookie-ratings";
import { applyRealBooks } from "@/gm/seed/real-books";
import { entryValueForNbaId } from "@/gm/lib/season-line";
import {
  defaultTeamDeveloper,
  generateDeveloperMarket,
} from "@/gm/seed/developers";
import {
  defaultTeamScout,
  effectiveScoutLevel,
  generateScoutMarket,
} from "@/gm/seed/scouts";
import {
  normalizePlayerName,
  salaryMapForSeason,
} from "@/data/providers/salaries/salary-store";
import { parsePlayerDraftInfo } from "@/lib/player-draft";
import type { CBARules } from "@/gm/myleague/types";

const POSITIONS: GmPosition[] = ["PG", "SG", "SF", "PF", "C"];

const HEIGHT_BY_POS: Record<GmPosition, number> = {
  PG: 74,
  SG: 77,
  SF: 79,
  PF: 81,
  C: 83,
};

function mapPosition(raw?: string): GmPosition {
  if (!raw) return "SF";
  const p = raw.toUpperCase();
  if (POSITIONS.includes(p as GmPosition)) return p as GmPosition;
  if (p.includes("G") && p.includes("F")) return "SF";
  if (p.startsWith("G")) return "PG";
  if (p.startsWith("F")) return "PF";
  if (p.startsWith("C")) return "C";
  return "SF";
}

function franchiseIdFromTeamKey(teamId: string, teamName: string): string | null {
  const brand = resolveTeamBrand(teamId);
  if (brand) return brand.id;
  const fromName = resolveTeamBrand(teamName);
  if (fromName) return fromName.id;
  // ESPN often uses numeric ids - resolveTeamBrand handles espnTeamId.
  return null;
}

/** Combined 2TM/3TM rows still name the stints. Use the last one, the team he finished with. */
function franchiseForSeasonRow(row: PlayerSeason): string | null {
  const direct = franchiseIdFromTeamKey(row.teamId, row.teamName);
  if (direct) return direct;
  const stints = row.stintTeamIds ?? [];
  for (let i = stints.length - 1; i >= 0; i--) {
    const id = franchiseIdFromTeamKey(stints[i] ?? "", "");
    if (id) return id;
  }
  if (row.teamAbbreviation) {
    return franchiseIdFromTeamKey(row.teamAbbreviation, row.teamAbbreviation);
  }
  return null;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * ESPN / thin feeds often fill missing advanced metrics with literal 0.
 * Optional overlays preserve legitimate zero values. Legacy required DPM/BPM
 * fields need a nonblank family before they can be used as an impact source.
 */
function usableMetric(value: unknown): value is number {
  return finite(value);
}

/**
 * Points per 100 above average. DARKO when we have it.
 * Otherwise BPM / RAPTOR / net. Thin samples without DARKO are shrunk toward
 * replacement so an 11-game fluke cannot mint an 86 overall.
 */
function estimateImpact(row: PlayerSeason): number {
  const minutes = Number.isFinite(row.minutes) ? row.minutes : 0;
  const gp = Number.isFinite(row.gamesPlayed) ? row.gamesPlayed : 0;
  const genericDarko = usableMetric(row.dpm) && (row.dpm !== 0 || row.oDpm !== 0 || row.dDpm !== 0);
  const hasDarko = usableMetric(row.darkoDpm) || genericDarko;

  let raw: number | null = null;
  if (usableMetric(row.darkoDpm)) raw = row.darkoDpm;
  else if (genericDarko) raw = row.dpm;
  else if (usableMetric(row.raptor)) raw = row.raptor;
  else if (usableMetric(row.bpm) && (row.bpm !== 0 || row.obpm !== 0 || row.dbpm !== 0)) raw = clamp(row.bpm, -8, 14);
  else {
    const net = row.netRating;
    if (finite(net) && gp > 0) {
      // Team net alone mints +7 role players on juggernauts. Blend with box
      // volume so stars climb and low-usage specialists stay grounded.
      const points = Math.abs(net) > 40 ? net - 110 : net;
      const mpg = minutes / gp;
      const ppg = row.points / gp;
      const apg = row.assists / gp;
      const rpg = row.rebounds / gp;
      const fromNet = points * 0.16;
      const fromBox =
        (ppg - 12) * 0.14 +
        (apg - 3) * 0.22 +
        (rpg - 5) * 0.05 +
        (mpg - 24) * 0.05;
      raw = clamp(fromNet + fromBox, -6, 10);
    }
  }

  if (raw == null) {
    if (!(minutes > 80) || gp < 1) return -1.2;
    const mpg = minutes / gp;
    const usg = (row.usagePct || 0.18) * 100;
    const ppg = gp > 0 ? row.points / gp : 0;
    const apg = gp > 0 ? row.assists / gp : 0;
    // When advanced stats are blank, lean on usage + volume so stars are not
    // stuck at replacement while role players float near zero.
    raw = clamp(
      (usg - 18) * 0.05 + (mpg - 22) * 0.04 + (ppg - 12) * 0.06 + (apg - 3) * 0.12,
      -3,
      6
    );
  }

  // DARKO is a season projection — trust it even when the counting line on
  // this row is thin (injury, early tip). Shrink only non-DARKO proxies.
  if (!hasDarko) {
    if (minutes < 200 || gp < 10) {
      const trust =
        Math.min(1, Math.max(0, minutes) / 450) *
        Math.min(1, Math.max(0, gp) / 18);
      raw = raw * trust + -0.6 * (1 - trust);
    } else if (minutes < 700) {
      const trust = 0.5 + 0.5 * ((minutes - 200) / 500);
      raw = raw * trust;
    }
  }

  return Math.round(clamp(raw, -8, 12) * 100) / 100;
}

function ratingsFromSeason(
  row: PlayerSeason,
  opts?: { age?: number; draftPick?: number | null }
): GmRatings {
  const impact = estimateImpact(row);
  const genericDarko = usableMetric(row.dpm) && (row.dpm !== 0 || row.oDpm !== 0 || row.dDpm !== 0);
  const pair = usableMetric(row.darkoDpm) ? [row.darkoOff, row.darkoDef]
    : genericDarko ? [row.oDpm, row.dDpm]
    : usableMetric(row.raptor) ? [row.oRaptor, row.dRaptor]
    : [row.obpm, row.dbpm];
  let offense = usableMetric(pair[0]) ? pair[0] : impact * 0.65;
  let defense = usableMetric(pair[1]) ? pair[1] : impact - offense;
  const total = offense + defense;
  if (Math.abs(total) > 0.000001) { const scale = impact / total; offense *= scale; defense *= scale; }
  else if (Math.abs(impact) > 0.000001) { offense = impact * 0.65; defense = impact * 0.35; }
  offense = Math.round(clamp(offense, Math.max(-8, impact - 10), Math.min(14, impact + 6)) * 100) / 100;
  defense = Math.round((impact - offense) * 100) / 100;
  const age =
    opts?.age && opts.age > 0
      ? opts.age
      : typeof row.age === "number" && row.age > 0
        ? Math.round(row.age)
        : 26;
  return {
    impact: Math.round(impact * 100) / 100,
    offense: Math.round(clamp(offense, -8, 14) * 100) / 100,
    defense: Math.round(clamp(defense, -6, 10) * 100) / 100,
    shooting: clamp(Math.round(50 + ((row.threePointPct || 0.33) - 0.3) * 180), 25, 95),
    finishing: row.fieldGoalsAttempted > row.threePointersAttempted ? clamp(Math.round(50 + (((row.fieldGoalsMade - row.threePointersMade) / (row.fieldGoalsAttempted - row.threePointersAttempted)) - 0.45) * 120), 25, 95) : 55,
    playmaking: clamp(
      Math.round(30 + (row.assists / Math.max(1, row.gamesPlayed)) * 8),
      15,
      95
    ),
    rebounding: clamp(
      Math.round(25 + (row.rebounds / Math.max(1, row.gamesPlayed)) * 6),
      15,
      95
    ),
    durability: clamp(Math.round(55 + row.gamesPlayed * 0.4), 40, 95),
    potential: estimateActivePotential({
      impact,
      age,
      usagePct: row.usagePct,
      draftPick: opts?.draftPick,
    }),
  };
}

function countingFromSeason(row: PlayerSeason): GmCountingLine {
  return {
    season: row.season,
    team: row.teamAbbreviation || row.teamName,
    gp: row.gamesPlayed,
    gs: row.gamesStarted,
    min: row.minutes,
    pts: row.points,
    reb: row.rebounds,
    ast: row.assists,
    stl: row.steals,
    blk: row.blocks,
    tov: row.turnovers,
    fgm: row.fieldGoalsMade,
    fga: row.fieldGoalsAttempted,
    tpm: row.threePointersMade,
    tpa: row.threePointersAttempted,
    ftm: row.freeThrowsMade,
    fta: row.freeThrowsAttempted,
    orb: row.offensiveRebounds,
    drb: row.defensiveRebounds,
    orbPct: percentPoints(row.offensiveReboundPct),
    drbPct: percentPoints(row.defensiveReboundPct),
    blkPct: percentPoints(row.blockPct),
    stlPct: percentPoints(row.stealPct),
    astPct: percentPoints(row.assistPct),
  };
}

function percentPoints(value: number | undefined): number | undefined {
  if (value == null || !Number.isFinite(value) || value <= 0) return undefined;
  return value <= 1 ? Math.round(value * 1000) / 10 : value;
}

function scoutedKnown(ratings: GmRatings): ScoutedRatings {
  return {
    impact: ratings.impact,
    offense: ratings.offense,
    defense: ratings.defense,
    uncertainty: 0.15,
  };
}

export function playerSeasonToGmPlayer(
  row: PlayerSeason,
  teamId: string | null,
  seasonEndYear: number,
  opts?: {
    cap?: CBARules;
    salaryByName?: Map<string, number>;
  }
): GmPlayer {
  // Thin adapters can carry NaN for unpublished counting fields.
  row = { ...row };
  for (const key of ["gamesPlayed", "gamesStarted", "minutes", "points", "assists", "rebounds", "steals", "blocks", "turnovers", "fieldGoalsMade", "fieldGoalsAttempted", "threePointersMade", "threePointersAttempted", "freeThrowsMade", "freeThrowsAttempted", "offensiveRebounds", "defensiveRebounds"] as const) {
    if (!Number.isFinite(row[key])) row[key] = 0;
  }
  const position = mapPosition(row.position);
  const bio = getBundledPlayerBio(row.playerId);
  const birth = bio?.birthDate ? new Date(bio.birthDate) : null;
  const seasonalAge = birth && Number.isFinite(birth.getTime()) ? Math.floor((Date.UTC(seasonEndYear, 1, 1) - birth.getTime()) / (365.2425 * 86400000)) : null;
  const age = typeof row.age === "number" && row.age > 0 ? Math.round(row.age) : seasonalAge != null && seasonalAge >= 17 && seasonalAge <= 48 ? seasonalAge : 26;
  const draft = parsePlayerDraftInfo(bio?.draftInfo);
  const ratings = ratingsFromSeason(row, {
    age,
    draftPick: draft && !draft.undrafted ? draft.pick : null,
  });
  const seasonStart = seasonEndYear - 1;
  const cap = opts?.cap ?? getCbaRules(seasonEndYear);
  const contract = teamId
    ? resolvePlayerContract({
        playerName: row.playerName,
        seasonStartYear: seasonStart,
        seasonEndYear,
        impact: ratings.impact,
        cap,
        salaryByName: opts?.salaryByName,
      }).contract
    : null;
  const hint: SheetStatHint = {
    twoPct: row.fieldGoalsAttempted > row.threePointersAttempted ? (row.fieldGoalsMade - row.threePointersMade) / (row.fieldGoalsAttempted - row.threePointersAttempted) : undefined,
    twoAttempts: Math.max(0, row.fieldGoalsAttempted - row.threePointersAttempted),
    threeAttempts: row.threePointersAttempted,
    freeThrowAttempts: row.freeThrowsAttempted,
    threeRate: Number.isFinite(row.threePointAttemptRate) ? row.threePointAttemptRate : row.fieldGoalsAttempted > 0 ? row.threePointersAttempted / row.fieldGoalsAttempted : undefined,
    threePct: row.threePointPct,
    ftPct: row.freeThrowPct,
    fgPct: row.fieldGoalPct,
    mpg: row.gamesPlayed > 0 ? row.minutes / row.gamesPlayed : undefined,
    ppg: row.gamesPlayed > 0 ? row.points / row.gamesPlayed : undefined,
    rpg: row.gamesPlayed > 0 ? row.rebounds / row.gamesPlayed : undefined,
    apg: row.gamesPlayed > 0 ? row.assists / row.gamesPlayed : undefined,
    spg: row.gamesPlayed > 0 ? row.steals / row.gamesPlayed : undefined,
    bpg: row.gamesPlayed > 0 ? row.blocks / row.gamesPlayed : undefined,
    orbPct: percentPoints(row.offensiveReboundPct),
    drbPct: percentPoints(row.defensiveReboundPct),
    blkPct: percentPoints(row.blockPct),
    stlPct: percentPoints(row.stealPct),
    astPct: percentPoints(row.assistPct),
  };
  const entryValue = entryValueForNbaId(row.playerId, row.season);
  const player: GmPlayer = {
    listedPosition: POSITIONS.includes(row.position?.toUpperCase() as GmPosition) ? row.position!.toUpperCase() as GmPosition : undefined,
    realRole: { season: seasonEndYear, teamId, starts: row.gamesStarted ?? 0, games: row.gamesPlayed, mpg: row.minutes / Math.max(1, row.gamesPlayed) },
    id: row.playerId,
    name: row.playerName,
    teamId,
    position,
    age,
    heightIn:
      bio?.heightInches && bio.heightInches > 0
        ? bio.heightInches
        : HEIGHT_BY_POS[position],
    weightLbs: bio?.weightLbs && bio.weightLbs > 0 ? bio.weightLbs : 210,
    ratings,
    scouted: scoutedKnown(ratings),
    contract,
    injury: null,
    morale: 72,
    personality: 0,
    minutesPreference: clamp(
      row.gamesPlayed > 0 ? row.minutes / row.gamesPlayed : 18,
      8,
      38
    ),
    nbaPlayerId: row.playerId,
    nbaSeason: row.gamesPlayed > 0 ? countingFromSeason(row) : undefined,
    drbl100: entryValue.drbl100,
    entryWar1: entryValue.war1,
    college: bio?.college,
    draftLabel: bio?.draftInfo,
    birthDate: bio?.birthDate,
    jersey: bio?.jersey,
    darko: row.darkoDpm,
    raptor: row.raptor,
  };
  player.sheet = buildSheet(player, row.gamesPlayed > 0 ? hint : undefined);
  // ESPN only ships G/F/C → SG/SF/C. Split into five spots + secondary here.
  return ensureSimProfile(withListedPositions(applyRookieRatings(player)));
}

export function buildLeagueFromPlayerSeasons(
  rows: PlayerSeason[],
  options: {
    userTeamId: string;
    seasonCanonical: string;
    seed?: number;
    salaryCapM?: number;
    luxuryTaxM?: number;
    firstApronM?: number;
    secondApronM?: number;
    maxRoster?: number;
    minRoster?: number;
    /** When provided, use real NBA tips instead of a generated schedule. */
    schedule?: GmScheduleGame[];
    /**
     * Opening camp. Everyone on this year's roster stays with that team.
     * The 15-man cap still blocks new signings. It does not waive a rostered player.
     */
    keepAssignedRoster?: boolean;
  }
): GmLeagueState {
  const seed = options.seed ?? Date.now() % 1_000_000;
  const rng = createRng(seed);
  const startYear = startYearFromCanonicalSeason(options.seasonCanonical);
  const season = startYear + 1; // Franchise Lab uses ending calendar year
  const userTeamId = options.userTeamId;
  const cba = getCbaRules(season);
  const settings = {
    ...DEFAULT_SETTINGS,
    salaryCapM: options.salaryCapM ?? cba.salaryCapM ?? DEFAULT_SETTINGS.salaryCapM,
    luxuryTaxM: options.luxuryTaxM ?? cba.luxuryTaxM ?? DEFAULT_SETTINGS.luxuryTaxM,
    firstApronM:
      options.firstApronM ?? cba.firstApronM ?? DEFAULT_SETTINGS.firstApronM,
    secondApronM:
      options.secondApronM ?? cba.secondApronM ?? DEFAULT_SETTINGS.secondApronM,
    maxRoster: options.maxRoster ?? cba.maxRoster ?? DEFAULT_SETTINGS.maxRoster,
    minRoster: options.minRoster ?? cba.minRoster ?? DEFAULT_SETTINGS.minRoster,
  };
  const salaryByName = salaryMapForSeason(startYear);
  let csvContracts = 0;

  const teams: GmTeam[] = FRANCHISES.map((f, i) => {
    const scout = defaultTeamScout(seed + i * 41 + f.id.charCodeAt(0) * 3);
    const developer = defaultTeamDeveloper(seed + i * 53 + f.id.charCodeAt(0) * 7);
    const trainer = trainerForLevel(randInt(rng, 2, 5));
    return {
      ...f,
      ownerPatience: randInt(rng, 35, 90),
      ownerGoal: pick(rng, ["contend", "retool", "tank"] as const),
      fanConfidence: randInt(rng, 40, 85),
      payrollLuxuryTaxM: 0,
      staff: {
        headCoach: coachForTeam(f.id),
        trainer,
        dead: [],
        scout,
        developer,
        scoutLevel: scout.eye,
        trainerLevel: trainer.level,
      },
      starters: emptyStarters(),
      benchOrder: [],
      draftPicks: [
        {
          id: uid("dp"),
          season,
          round: 1,
          originalTeamId: f.id,
          ownerTeamId: f.id,
        },
        {
          id: uid("dp"),
          season,
          round: 2,
          originalTeamId: f.id,
          ownerTeamId: f.id,
        },
        {
          id: uid("dp"),
          season: season + 1,
          round: 1,
          originalTeamId: f.id,
          ownerTeamId: f.id,
        },
      ],
      tradeExceptionsM: [],
    };
  });

  // Dedupe by player - keep highest-minute row if multi-team season.
  const bestByPlayer = new Map<string, PlayerSeason>();
  for (const row of rows) {
    const prev = bestByPlayer.get(row.playerId);
    if (!prev || row.minutes > prev.minutes) {
      bestByPlayer.set(row.playerId, row);
    }
  }

  type Ranked = { row: PlayerSeason; franchiseId: string | null; score: number };
  const ranked: Ranked[] = [...bestByPlayer.values()].map((row) => {
    const franchiseId = franchiseForSeasonRow(row);
    const impact = estimateImpact(row);
    const score = row.minutes * (1 + Math.max(0, impact) * 0.15);
    return { row, franchiseId, score };
  });

  const byTeam = new Map<string, Ranked[]>();
  const unassigned: Ranked[] = [];
  for (const item of ranked) {
    if (!item.franchiseId) {
      unassigned.push(item);
      continue;
    }
    const list = byTeam.get(item.franchiseId) ?? [];
    list.push(item);
    byTeam.set(item.franchiseId, list);
  }

  const players: GmPlayer[] = [];
  const ROSTER_CAP = settings.maxRoster;
  const contractOpts = { cap: cba, salaryByName };

  for (const team of teams) {
    const list = (byTeam.get(team.id) ?? []).sort((a, b) => b.score - a.score);
    const kept = options.keepAssignedRoster ? list : list.slice(0, ROSTER_CAP);
    const cut = options.keepAssignedRoster ? [] : list.slice(ROSTER_CAP);
    for (const item of kept) {
      const p = playerSeasonToGmPlayer(item.row, team.id, season, contractOpts);
      if (salaryByName.has(normalizePlayerName(item.row.playerName))) {
        csvContracts += 1;
      }
      players.push(p);
    }
    for (const item of cut) {
      const p = playerSeasonToGmPlayer(item.row, null, season, contractOpts);
      p.contract = null;
      players.push(p);
    }
  }

  for (const item of unassigned) {
    const p = playerSeasonToGmPlayer(item.row, null, season, contractOpts);
    p.contract = null;
    players.push(p);
  }

  const userStaff = teams.find((t) => t.id === userTeamId)?.staff;
  const userScout = userStaff?.scout ?? null;
  const userScoutLevel = effectiveScoutLevel(userScout, userStaff?.scoutLevel ?? 2);
  const prospects = createDraftClass({
    count: 60,
    seasonEndYear: season,
    scoutLevel: userScoutLevel,
    rng,
    seal: (player, scoutLevel, boardIndex, r) =>
      sealProspect(player, scoutLevel, boardIndex, r, userScout),
  });
  players.push(...prospects);
  const listedPlayers = assignLeaguePositions(players);
  const draftPool = prospects.map((p) => p.id);
  const scoutMarket = generateScoutMarket(seed + 1201, 5);
  const developerMarket = generateDeveloperMarket(seed + 1403, 5);

  const freeAgents = listedPlayers
    .filter((p) => p.teamId === null && !draftPool.includes(p.id))
    .map((p) => p.id);

  const realSchedule = options.schedule?.length
    ? options.schedule
    : generateSchedule(teams, season, seed);

  const state: GmLeagueState = {
    version: 1,
    season,
    day: 0,
    phase: "regular",
    userTeamId,
    settings,
    automation: {
      autoDraft: false,
      autoFreeAgency: true,
      autoScout: false,
    },
    teams,
    players: listedPlayers,
    freeAgents,
    draftPool,
    scoutMarket,
    developerMarket,
    coachMarket: openCoachMarket(),
    staffBook: 1,
    positionBook: POSITION_BOOK_VERSION,
    rosterBook: options.keepAssignedRoster ? 1 : undefined,
    schedule: realSchedule,
    standings: emptyStandings(teams),
    boxScores: [],
    news: [
      {
        id: uid("news"),
        day: 0,
        season,
        headline: `Real NBA rosters loaded · ${options.seasonCanonical}`,
        body: `${bestByPlayer.size} players · ${csvContracts} real salaries · ${realSchedule.length} games${
          options.schedule?.length ? " (official NBA tips)" : " (generated)"
        } · cap $${settings.salaryCapM}M.`,
        tone: "info",
      },
    ],
    tradeLog: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return applyRealBooks(applyBalancedRotations(state));
}

export function defaultGmCanonicalSeason(): string {
  return canonicalSeasonFromStartYear(currentNbaStartYear());
}

