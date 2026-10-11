/**
 * Shadow DRBL/100 that shrinks DRBL-P toward a box-score rating instead of 0.
 *
 * Box rating: per-100 box rates (plus minutes per game and start rate),
 * standardized within the season. Weights come from a regression of points
 * on every 5v5 possession on the summed rates of the ten players on the
 * floor, so the target is the scoreboard, not DRBL-P.
 *
 * drblBox100 = N/(N+shrinkK) × rawAbilityRate + shrinkK/(N+shrinkK) × boxScale × box.
 *
 * Shadow only: never read by the site overlay or any published surface.
 * Config is frozen; change it only with a fresh run of
 * `scripts/drbl-outcome-test.ts`.
 */
import type { DrblBoxPlayer } from "../types";
import { choleskySolve, type AnchoredLineupPossession } from "./anchored-lineup";

export const BOX_PRIOR_VERSION = "drbl-box-prior-v1";

export const BOX_PRIOR_STATS = [
  "points",
  "fieldGoalsAttempted",
  "threePointersAttempted",
  "threePointersMade",
  "freeThrowsAttempted",
  "offensiveRebounds",
  "defensiveRebounds",
  "assists",
  "steals",
  "blocks",
  "turnovers",
  "personalFouls",
] as const satisfies readonly (keyof DrblBoxPlayer)[];

export const BOX_PRIOR_FEATURES = [
  ...BOX_PRIOR_STATS.map((s) => `${s}Per100`),
  "minutesPerGame",
  "startRate",
] as const;

export interface BoxPriorConfig {
  /** Pseudo offensive possessions at the league rate added to every per-100 rate. */
  rateShrinkPossessions: number;
  /** Pseudo games at the league value added to minutes per game and start rate. */
  gameShrink: number;
  ridge: number;
  /** Possession count at which DRBL-P and the box rating get equal weight. */
  shrinkK: number;
  /** Box rating multiplier before shrinking (puts it on DRBL-P's scale). */
  boxScale: number;
  /** Below this many 5v5 possessions the weights are not fit and no value is written. */
  minFitPossessions: number;
}

export const BOX_PRIOR_CONFIG: Readonly<BoxPriorConfig> = Object.freeze({
  rateShrinkPossessions: 25,
  gameShrink: 10,
  ridge: 0,
  shrinkK: 3200,
  boxScale: 2,
  minFitPossessions: 10_000,
});

const NS = BOX_PRIOR_STATS.length;
const NF = BOX_PRIOR_FEATURES.length;

export interface BoxTotals {
  stats: number[];
  minutes: number;
  starts: number;
  games: number;
}

export type BoxPriorTotals = Map<string, BoxTotals>;

export function addBoxScoreToTotals(totals: BoxPriorTotals, players: readonly DrblBoxPlayer[]): void {
  for (const p of players) {
    const minutes = Number(p.minutes) || 0;
    const stats = BOX_PRIOR_STATS.map((k) => Number(p[k]) || 0);
    if (minutes <= 0 && stats.every((v) => v === 0)) continue;
    const t = totals.get(p.playerId) ?? { stats: new Array<number>(NS).fill(0), minutes: 0, starts: 0, games: 0 };
    for (let i = 0; i < NS; i++) t.stats[i]! += stats[i]!;
    t.minutes += minutes;
    t.starts += p.starter ? 1 : 0;
    t.games += 1;
    totals.set(p.playerId, t);
  }
}

/** Standardized features; `appearances` counts offense + defense possessions on court. */
export function boxPriorFeatures(
  totals: ReadonlyMap<string, BoxTotals>,
  appearances: ReadonlyMap<string, number>,
  config: BoxPriorConfig = BOX_PRIOR_CONFIG
): Map<string, number[]> {
  const league = new Array<number>(NS).fill(0);
  let leaguePoss = 0;
  let lgMin = 0;
  let lgStarts = 0;
  let lgGames = 0;
  for (const [id, t] of totals) {
    const off = (appearances.get(id) ?? 0) / 2;
    if (off <= 0) continue;
    for (let i = 0; i < NS; i++) league[i]! += t.stats[i]!;
    leaguePoss += off;
    lgMin += t.minutes;
    lgStarts += t.starts;
    lgGames += t.games;
  }
  if (leaguePoss <= 0 || lgGames <= 0) return new Map();
  const lgRate = league.map((v) => (100 * v) / leaguePoss);
  const k = config.rateShrinkPossessions;
  const kg = config.gameShrink;
  const raw = new Map<string, { x: number[]; w: number }>();
  for (const [id, t] of totals) {
    const off = (appearances.get(id) ?? 0) / 2;
    if (off <= 0) continue;
    const x = t.stats.map((s, i) => (100 * s + k * lgRate[i]!) / (off + k));
    x.push((t.minutes + kg * (lgMin / lgGames)) / (t.games + kg));
    x.push((t.starts + kg * (lgStarts / lgGames)) / (t.games + kg));
    raw.set(id, { x, w: off });
  }
  const mean = new Array<number>(NF).fill(0);
  const sd = new Array<number>(NF).fill(0);
  let W = 0;
  for (const { x, w } of raw.values()) {
    W += w;
    for (let i = 0; i < NF; i++) mean[i]! += w * x[i]!;
  }
  for (let i = 0; i < NF; i++) mean[i]! /= W;
  for (const { x, w } of raw.values()) for (let i = 0; i < NF; i++) sd[i]! += w * (x[i]! - mean[i]!) ** 2;
  for (let i = 0; i < NF; i++) sd[i] = Math.sqrt(sd[i]! / W) || 1;
  const out = new Map<string, number[]>();
  for (const [id, { x }] of raw) out.set(id, x.map((v, i) => (v - mean[i]!) / sd[i]!));
  return out;
}

export interface BoxPriorFit {
  version: typeof BOX_PRIOR_VERSION;
  config: BoxPriorConfig;
  possessions: number;
  /** Points per 100 possessions per one SD of each feature, one player on court. */
  weightsPer100: number[];
  ratingsPer100: Map<string, number>;
}

/** Returns null when there are too few 5v5 possessions to fit the weights. */
export function fitBoxPrior(
  rows: readonly AnchoredLineupPossession[],
  features: ReadonlyMap<string, number[]>,
  config: BoxPriorConfig = BOX_PRIOR_CONFIG
): BoxPriorFit | null {
  const n = NF + 2;
  const xtx = new Float64Array(n * n);
  const xty = new Float64Array(n);
  const row = new Float64Array(n);
  let used = 0;
  for (const r of rows) {
    if (r.offensePlayerIds.length !== 5 || r.defensePlayerIds.length !== 5) continue;
    row.fill(0);
    for (const id of r.offensePlayerIds) {
      const z = features.get(id);
      if (z) for (let i = 0; i < NF; i++) row[i]! += z[i]!;
    }
    for (const id of r.defensePlayerIds) {
      const z = features.get(id);
      if (z) for (let i = 0; i < NF; i++) row[i]! -= z[i]!;
    }
    row[NF] = r.offenseIsHome ? 1 : 0;
    row[NF + 1] = 1;
    for (let a = 0; a < n; a++) {
      xty[a]! += row[a]! * r.points;
      for (let b = 0; b < n; b++) xtx[a * n + b]! += row[a]! * row[b]!;
    }
    used += 1;
  }
  if (used < config.minFitPossessions) return null;
  for (let i = 0; i < NF; i++) xtx[i * n + i]! += config.ridge + 1e-9;
  xtx[NF * n + NF]! += 1e-9;
  xtx[(NF + 1) * n + NF + 1]! += 1e-9;
  const beta = Array.from(choleskySolve(xtx, xty, n)).slice(0, NF);
  const ratingsPer100 = new Map<string, number>();
  for (const [id, z] of features) ratingsPer100.set(id, 100 * z.reduce((s, v, i) => s + v * beta[i]!, 0));
  return {
    version: BOX_PRIOR_VERSION,
    config: { ...config },
    possessions: used,
    weightsPer100: beta.map((b) => 100 * b),
    ratingsPer100,
  };
}

/** DRBL-P raw rate shrunk toward boxScale × box rating; players without either stay absent. */
export function shrinkTowardBoxPrior(
  raw: ReadonlyMap<string, number>,
  possessions: ReadonlyMap<string, number>,
  box: ReadonlyMap<string, number>,
  config: BoxPriorConfig = BOX_PRIOR_CONFIG
): Map<string, number> {
  const out = new Map<string, number>();
  for (const [id, b] of box) {
    const target = config.boxScale * b;
    const r = raw.get(id);
    const n = possessions.get(id) ?? 0;
    if (r == null || !Number.isFinite(r) || n <= 0) out.set(id, target);
    else out.set(id, (n / (n + config.shrinkK)) * r + (config.shrinkK / (n + config.shrinkK)) * target);
  }
  return out;
}

export interface BoxPriorSummary {
  version: typeof BOX_PRIOR_VERSION;
  shadow: true;
  shrinkK: number;
  boxScale: number;
  possessions: number;
  players: number;
  weightsPer100: Record<(typeof BOX_PRIOR_FEATURES)[number], number>;
}

export function boxPriorSummary(fit: BoxPriorFit): BoxPriorSummary {
  return {
    version: fit.version,
    shadow: true,
    shrinkK: fit.config.shrinkK,
    boxScale: fit.config.boxScale,
    possessions: fit.possessions,
    players: fit.ratingsPer100.size,
    weightsPer100: Object.fromEntries(
      BOX_PRIOR_FEATURES.map((f, i) => [f, Number(fit.weightsPer100[i]!.toFixed(3))])
    ) as BoxPriorSummary["weightsPer100"],
  };
}

export function attachBoxPrior<T extends { playerId: string; rawAbilityRate: number; possessions: number }>(
  players: T[],
  fit: BoxPriorFit | null
): (T & { drblBox100?: number })[] {
  const values = fit
    ? shrinkTowardBoxPrior(
        new Map(players.map((p) => [p.playerId, p.rawAbilityRate])),
        new Map(players.map((p) => [p.playerId, p.possessions])),
        fit.ratingsPer100,
        fit.config
      )
    : new Map<string, number>();
  return players.map((p) => {
    const { drblBox100: _stale, ...rest } = p as T & { drblBox100?: number };
    void _stale;
    const v = values.get(p.playerId);
    if (v == null || !Number.isFinite(v)) return rest as T;
    return { ...rest, drblBox100: Number(v.toFixed(2)) } as T & { drblBox100: number };
  });
}
