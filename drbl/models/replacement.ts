/**
 * M7 — contextual replacement (R1).
 *
 * Replacement is role-compatible and cutoff-safe: candidates are frozen to
 * players observed on or before `asOfDate` (game date), never future seasons.
 *
 * R1 baseline for Approach B: expected points under the same pre-possession
 * state, adjusted by the mean residual of role-similar replacement-level
 * players (not a full counterfactual simulation — that is Approach A / later).
 */

import type { DrblBoxScore, DrblEvent, DrblPossession } from "../types";
import {
  predictExpectedPoints,
  type PossessionEpState,
} from "./expected-points";

export type ReplacementLevel = "R1" | "R2" | "R3";

export interface RoleVector {
  /** Offensive involvement share when on offense (0–1). */
  usage: number;
  /** Share of FGA that are threes (0–1). */
  threeRate: number;
  /** Fraction of games started (0–1). */
  starterRate: number;
  /** Minutes per game (approx). */
  minutesPerGame: number;
}

export interface ReplacementCandidate {
  playerId: string;
  playerName: string;
  role: RoleVector;
  /** Mean points − EP residual per possession (offense+defense blended). */
  meanResidual: number;
  possessions: number;
  /** Last game date YYYY-MM-DD this candidate was observed. */
  asOfDate: string;
}

export interface ReplacementPool {
  level: ReplacementLevel;
  builtAt: string;
  cutoffDate: string;
  candidates: ReplacementCandidate[];
}

const ROLE_WEIGHTS = {
  usage: 1.2,
  threeRate: 0.8,
  starterRate: 0.6,
  minutesPerGame: 0.4,
};

export function emptyRole(): RoleVector {
  return { usage: 0.2, threeRate: 0.35, starterRate: 0, minutesPerGame: 12 };
}

export function roleDistance(a: RoleVector, b: RoleVector): number {
  const dUsage = a.usage - b.usage;
  const dThree = a.threeRate - b.threeRate;
  const dStarter = a.starterRate - b.starterRate;
  const dMin = (a.minutesPerGame - b.minutesPerGame) / 36;
  return Math.sqrt(
    ROLE_WEIGHTS.usage * dUsage * dUsage +
      ROLE_WEIGHTS.threeRate * dThree * dThree +
      ROLE_WEIGHTS.starterRate * dStarter * dStarter +
      ROLE_WEIGHTS.minutesPerGame * dMin * dMin
  );
}

interface RoleAccum {
  playerId: string;
  playerName: string;
  teamId: string;
  offPoss: number;
  defPoss: number;
  involvement: number;
  fga: number;
  fg3a: number;
  residualSum: number;
  residualN: number;
  starterGames: number;
  games: Set<string>;
  minutes: number;
  lastDate: string;
}

function stateForPossession(
  possession: DrblPossession,
  box: DrblBoxScore,
  events: DrblEvent[]
): PossessionEpState {
  const start = events.find(
    (e) => e.actionNumber === possession.startActionNumber
  );
  const offenseIsHome = possession.offenseTeamId === box.homeTeamId;
  const scoreHome = start?.scoreHome ?? 0;
  const scoreAway = start?.scoreAway ?? 0;
  const scoreDiff = offenseIsHome
    ? scoreHome - scoreAway
    : scoreAway - scoreHome;
  return {
    period: possession.period,
    clockSeconds: possession.startClockSeconds,
    offenseIsHome,
    scoreDiff,
  };
}

/**
 * Update role / residual accumulators for one reconciled game.
 */
export function accumulateReplacementSignals(
  box: DrblBoxScore,
  events: DrblEvent[],
  possessions: DrblPossession[],
  into: Map<string, RoleAccum>
): void {
  const nameById = new Map(box.players.map((p) => [p.playerId, p.playerName]));
  const starterIds = new Set(
    box.players.filter((p) => p.starter).map((p) => p.playerId)
  );
  const gameDate = box.gameDate || "";

  for (const player of box.players) {
    let row = into.get(player.playerId);
    if (!row) {
      row = {
        playerId: player.playerId,
        playerName: player.playerName,
        teamId: player.teamId,
        offPoss: 0,
        defPoss: 0,
        involvement: 0,
        fga: 0,
        fg3a: 0,
        residualSum: 0,
        residualN: 0,
        starterGames: 0,
        games: new Set(),
        minutes: 0,
        lastDate: "",
      };
      into.set(player.playerId, row);
    }
    row.minutes += player.minutes;
    row.games.add(box.gameId);
    if (starterIds.has(player.playerId)) row.starterGames += 1;
    if (gameDate && gameDate >= row.lastDate) row.lastDate = gameDate;
    row.playerName = nameById.get(player.playerId) ?? row.playerName;
    row.teamId = player.teamId;
  }

  // Shot attempts for three-rate.
  for (const event of events) {
    if (!event.playerId) continue;
    if (event.actionType !== "2pt" && event.actionType !== "3pt") continue;
    const row = into.get(event.playerId);
    if (!row) continue;
    row.fga += 1;
    if (event.actionType === "3pt") row.fg3a += 1;
  }

  for (const possession of possessions) {
    const state = stateForPossession(possession, box, events);
    const ep = predictExpectedPoints(state);
    const residual = possession.points - ep;
    const offenseIds = possession.offensePlayerIds.filter(Boolean);
    const defenseIds = possession.defensePlayerIds.filter(Boolean);

    for (const playerId of offenseIds) {
      const row = into.get(playerId);
      if (!row) continue;
      row.offPoss += 1;
      row.residualSum += residual / Math.max(1, offenseIds.length);
      row.residualN += 1;
      // Crude involvement: player appears in event list on this possession.
      const involved = possession.eventActionNumbers.some((n) => {
        const e = events.find((x) => x.actionNumber === n);
        return e?.playerId === playerId;
      });
      if (involved) row.involvement += 1;
    }
    for (const playerId of defenseIds) {
      const row = into.get(playerId);
      if (!row) continue;
      row.defPoss += 1;
      row.residualSum += -residual / Math.max(1, defenseIds.length);
      row.residualN += 1;
    }
  }
}

export function finalizeRoleAccum(
  accum: Map<string, RoleAccum>,
  options: { minPossessions?: number } = {}
): ReplacementCandidate[] {
  const minPossessions = options.minPossessions ?? 40;
  const out: ReplacementCandidate[] = [];
  for (const row of accum.values()) {
    const poss = row.offPoss + row.defPoss;
    if (poss < minPossessions) continue;
    const games = Math.max(1, row.games.size);
    const role: RoleVector = {
      usage: row.offPoss > 0 ? row.involvement / row.offPoss : 0.2,
      threeRate: row.fga > 0 ? row.fg3a / row.fga : 0.35,
      starterRate: row.starterGames / games,
      minutesPerGame: row.minutes / games,
    };
    out.push({
      playerId: row.playerId,
      playerName: row.playerName,
      role,
      meanResidual: row.residualN > 0 ? row.residualSum / row.residualN : 0,
      possessions: poss,
      asOfDate: row.lastDate || "9999-99-99",
    });
  }
  return out;
}

/**
 * Build an R1 pool: lower-impact, rotation-capable players frozen at cutoff.
 * Excludes the target player. Uses residual quintile + minutes band.
 */
export function buildReplacementPool(
  candidates: ReplacementCandidate[],
  options: {
    level?: ReplacementLevel;
    cutoffDate: string;
    excludePlayerId?: string;
    topN?: number;
  }
): ReplacementPool {
  const level = options.level ?? "R1";
  const cutoff = options.cutoffDate;
  const frozen = candidates.filter(
    (c) =>
      c.playerId !== options.excludePlayerId &&
      c.asOfDate &&
      c.asOfDate <= cutoff &&
      c.possessions >= 40
  );

  const byResidual = frozen.slice().sort((a, b) => a.meanResidual - b.meanResidual);
  // Replacement-level ≈ bottom 40% by residual (not stars).
  const cutIdx = Math.max(1, Math.floor(byResidual.length * 0.4));
  let pool = byResidual.slice(0, cutIdx);

  // Prefer players who actually play rotation minutes.
  pool = pool.filter((c) => c.role.minutesPerGame >= 8 && c.role.minutesPerGame <= 32);
  if (pool.length < 5) pool = byResidual.slice(0, Math.min(30, byResidual.length));

  return {
    level,
    builtAt: new Date().toISOString(),
    cutoffDate: cutoff,
    candidates: pool.slice(0, options.topN ?? 80),
  };
}

/**
 * Pick role-similar R1 replacements and return mean residual adjustment.
 */
export function roleMatchedReplacementResidual(
  targetRole: RoleVector,
  pool: ReplacementPool,
  k = 8
): number {
  if (pool.candidates.length === 0) return 0;
  const ranked = pool.candidates
    .map((c) => ({ c, d: roleDistance(targetRole, c.role) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, k);
  if (ranked.length === 0) return 0;
  const sum = ranked.reduce((s, x) => s + x.c.meanResidual, 0);
  return sum / ranked.length;
}

/**
 * Approach B replacement EP: context EP + role-matched R1 residual.
 * Documents that we are NOT simulating a full lineup swap (Approach A).
 */
export function replacementExpectedPoints(
  state: PossessionEpState,
  targetRole: RoleVector | null,
  pool: ReplacementPool | null
): number {
  const contextEp = predictExpectedPoints(state);
  if (!targetRole || !pool || pool.candidates.length === 0) {
    return contextEp;
  }
  const adj = roleMatchedReplacementResidual(targetRole, pool);
  // Keep adjustment modest — identification is weak without full simulation.
  const clamped = Math.max(-0.08, Math.min(0.04, adj));
  return Math.max(0.7, Math.min(1.4, contextEp + clamped));
}

export function roleFromBoxPlayer(
  player: DrblBoxScore["players"][number],
  gamesPlayed = 1
): RoleVector {
  return {
    usage: 0.2,
    threeRate: 0.35,
    starterRate: player.starter ? 1 : 0,
    minutesPerGame: player.minutes / Math.max(1, gamesPlayed),
  };
}
