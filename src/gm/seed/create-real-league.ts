/**
 * Map real PlayerSeason rows → Franchise Lab GmPlayer / league.
 * Impact prefers DARKO DPM, then LEBRON, then a stats heuristic.
 */

import type { PlayerSeason } from "@/data/types";
import type {
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
import { resolveTeamBrand } from "@/lib/nba-brand";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
  startYearFromCanonicalSeason,
} from "@/data/providers/historical/season-range";
import { getCbaRules } from "@/gm/myleague/cba-registry";
import { resolvePlayerContract } from "@/gm/seed/contracts";
import { createDraftClass } from "@/gm/seed/prospect-identities";
import { sealProspect } from "@/gm/engine/scouting";
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

function estimateImpact(row: PlayerSeason): number {
  if (typeof row.darkoDpm === "number") return row.darkoDpm;
  if (typeof row.lebron === "number") return row.lebron;
  const mpg = row.gamesPlayed > 0 ? row.minutes / row.gamesPlayed : 0;
  const net = (row.netRating || 0) - 100;
  const usg = (row.usagePct || 0.18) * 100;
  const rough = net * 0.08 + (usg - 18) * 0.05 + (mpg - 20) * 0.04;
  return Math.round(clamp(rough, -4, 8) * 100) / 100;
}

function ratingsFromSeason(row: PlayerSeason): GmRatings {
  const impact = estimateImpact(row);
  const offense =
    row.darkoOff ??
    row.oLebron ??
    impact * 0.65 + ((row.offensiveRating || 110) - 110) * 0.05;
  const defense =
    row.darkoDef ??
    row.dLebron ??
    impact * 0.45 + (110 - (row.defensiveRating || 110)) * 0.05;
  const ts = row.trueShootingPct || 0.55;
  const usg = row.usagePct || 0.18;
  return {
    impact: Math.round(impact * 100) / 100,
    offense: Math.round(offense * 100) / 100,
    defense: Math.round(defense * 100) / 100,
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
  return {
    id: row.playerId,
    name: row.playerName,
    teamId,
    position,
    age: 26,
    heightIn: HEIGHT_BY_POS[position],
    weightLbs: 210,
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
    darko: row.darkoDpm,
    lebron: row.lebron,
  };
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
    const trainerLevel = randInt(rng, 2, 5);
    return {
      ...f,
      ownerPatience: randInt(rng, 35, 90),
      ownerGoal: pick(rng, ["contend", "retool", "tank"] as const),
      fanConfidence: randInt(rng, 40, 85),
      payrollLuxuryTaxM: 0,
      staff: {
        headCoach: {
          name: "Head Coach",
          offenseBonus: (rng() - 0.5) * 2,
          defenseBonus: (rng() - 0.5) * 2,
          developmentBonus: rng() * 1.2,
        },
        scout,
        scoutLevel: scout.eye,
        trainerLevel,
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
    const franchiseId = franchiseIdFromTeamKey(row.teamId, row.teamName);
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
    const kept = list.slice(0, ROSTER_CAP);
    const cut = list.slice(ROSTER_CAP);
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

  let state: GmLeagueState = {
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
  return state;
}

export function defaultGmCanonicalSeason(): string {
  return canonicalSeasonFromStartYear(currentNbaStartYear());
}
