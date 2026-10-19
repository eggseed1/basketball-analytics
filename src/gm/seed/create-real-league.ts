/**
 * Map real PlayerSeason rows → Franchise Lab GmPlayer / league.
 * Impact prefers DARKO DPM, then RAPTOR, then a stats heuristic.
 */

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
import { autoSetLineup } from "@/gm/engine/lineup";
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
import { applyRookieRatings } from "@/gm/engine/rookie-ratings";
import { applyRealBooks } from "@/gm/seed/real-books";
import { entryValueForNbaId } from "@/gm/lib/season-line";
import {
  defaultTeamScout,
  effectiveScoutLevel,
  generateScoutMarket,
} from "@/gm/seed/scouts";
import {
  normalizePlayerName,
  salaryMapForSeason,
} from "@/data/providers/salaries/salary-store";
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
 * Points per 100 above average. DARKO when we have it.
 * Otherwise BPM. A raw net rating is already a point differential, not an
 * offensive rating near 110, so it is not shifted by 100.
 */
function estimateImpact(row: PlayerSeason): number {
  if (finite(row.darkoDpm)) return row.darkoDpm;
  if (finite(row.dpm) && row.dpm !== 0) return row.dpm;
  if (finite(row.raptor)) return row.raptor;
  if (finite(row.bpm)) return Math.round(clamp(row.bpm, -8, 14) * 100) / 100;
  const net = row.netRating;
  if (finite(net)) {
    const points = Math.abs(net) > 40 ? net - 110 : net;
    return Math.round(clamp(points * 0.45, -8, 12) * 100) / 100;
  }
  if (!(row.minutes > 80) || !(row.gamesPlayed > 0)) return -1.2;
  const mpg = row.minutes / row.gamesPlayed;
  const usg = (row.usagePct || 0.18) * 100;
  const rough = (usg - 18) * 0.04 + (mpg - 22) * 0.03;
  return Math.round(clamp(rough, -3, 4) * 100) / 100;
}

function ratingsFromSeason(row: PlayerSeason): GmRatings {
  const impact = estimateImpact(row);
  const offense = finite(row.darkoOff)
    ? row.darkoOff
    : finite(row.oDpm) && row.oDpm !== 0
      ? row.oDpm
      : finite(row.oRaptor)
        ? row.oRaptor
        : finite(row.obpm)
          ? row.obpm
          : impact * 0.65;
  const defense = finite(row.darkoDef)
    ? row.darkoDef
    : finite(row.dDpm) && row.dDpm !== 0
      ? row.dDpm
      : finite(row.dRaptor)
        ? row.dRaptor
        : finite(row.dbpm)
          ? row.dbpm
          : impact * 0.35;
  const ts = row.trueShootingPct || 0.55;
  const usg = row.usagePct || 0.18;
  return {
    impact: Math.round(impact * 100) / 100,
    offense: Math.round(clamp(offense, -8, 14) * 100) / 100,
    defense: Math.round(clamp(defense, -6, 10) * 100) / 100,
    shooting: clamp(Math.round(ts * 100), 25, 95),
    finishing: clamp(Math.round(50 + impact * 4), 25, 95),
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
    potential: clamp(impact + usg * 4, 0, 10),
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
  const position = mapPosition(row.position);
  const ratings = ratingsFromSeason(row);
  const bio = getBundledPlayerBio(row.playerId);
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
    threeRate: row.threePointAttemptRate,
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
  const entryValue = entryValueForNbaId(row.playerId);
  const player: GmPlayer = {
    id: row.playerId,
    name: row.playerName,
    teamId,
    position,
    age:
      typeof row.age === "number" && row.age > 0
        ? Math.round(row.age)
        : typeof bio?.age === "number" && bio.age > 0
          ? bio.age
          : 26,
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
  return applyRookieRatings(player);
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
  const draftPool = prospects.map((p) => p.id);
  const scoutMarket = generateScoutMarket(seed + 1201, 5);

  const freeAgents = players
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
    teams,
    players,
    freeAgents,
    draftPool,
    scoutMarket,
    coachMarket: openCoachMarket(),
    staffBook: 1,
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

  state.teams = state.teams.map((t) => autoSetLineup(t, state.players));
  return applyRealBooks(state);
}

export function defaultGmCanonicalSeason(): string {
  return canonicalSeasonFromStartYear(currentNbaStartYear());
}
