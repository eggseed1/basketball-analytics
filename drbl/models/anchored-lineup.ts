/**
 * Shadow lineup rating anchored on published DRBL/100.
 *
 * One NET ridge on scoreboard points per possession (+1 offense, −1 defense,
 * home flag, intercept). Each player is shrunk toward priorWeight × drbl100
 * instead of 0, so lineup evidence moves a player only as far as the
 * scoreboard supports.
 *
 * Shadow only: written to artifacts as `drblAnchored100`, never read by the
 * site overlay or any published surface. Config is frozen; change it only
 * with a fresh run of the outcome test (`scripts/drbl-outcome-test.ts`).
 */
import type { DrblPossession } from "../types";

export const ANCHORED_LINEUP_VERSION = "drbl-anchored-lineup-v1";

export interface AnchoredLineupConfig {
  priorWeight: number;
  lambda: number;
  homeLambdaScale: number;
  interceptLambdaScale: number;
  /** Below this many on-court possessions a player's prior is replaced by the fill. */
  minPriorAppearances: number;
  /** Fill = mean prior of players with [minPriorAppearances, this) appearances. */
  fillMaxAppearances: number;
}

export const ANCHORED_LINEUP_CONFIG: Readonly<AnchoredLineupConfig> = Object.freeze({
  priorWeight: 4,
  lambda: 6400,
  homeLambdaScale: 0.25,
  interceptLambdaScale: 0.01,
  minPriorAppearances: 100,
  fillMaxAppearances: 1500,
});

export interface AnchoredLineupPossession {
  offenseIsHome: boolean;
  offensePlayerIds: string[];
  defensePlayerIds: string[];
  points: number;
}

export interface AnchoredLineupInput {
  /** 5v5 possessions only; these enter the fit. */
  rows: AnchoredLineupPossession[];
  /** On-court possessions per player, counting partial lineups too. */
  appearances: Map<string, number>;
}

export interface AnchoredLineupFit {
  version: typeof ANCHORED_LINEUP_VERSION;
  config: AnchoredLineupConfig;
  possessions: number;
  priorFill: number;
  homeAdvantagePer100: number;
  ratingsPer100: Map<string, number>;
}

export function createAnchoredLineupInput(): AnchoredLineupInput {
  return { rows: [], appearances: new Map() };
}

export function addGameToAnchoredLineupInput(
  input: AnchoredLineupInput,
  homeTeamId: string,
  possessions: readonly DrblPossession[]
): void {
  for (const p of possessions) {
    const off = p.offensePlayerIds.filter(Boolean);
    const def = p.defensePlayerIds.filter(Boolean);
    if (off.length === 0 || def.length === 0) continue;
    for (const id of off) input.appearances.set(id, (input.appearances.get(id) ?? 0) + 1);
    for (const id of def) input.appearances.set(id, (input.appearances.get(id) ?? 0) + 1);
    if (off.length !== 5 || def.length !== 5) continue;
    input.rows.push({
      offenseIsHome: p.offenseTeamId === homeTeamId,
      offensePlayerIds: off,
      defensePlayerIds: def,
      points: p.points,
    });
  }
}

export function anchoredPriorFill(
  prior: ReadonlyMap<string, number>,
  appearances: ReadonlyMap<string, number>,
  config: AnchoredLineupConfig = ANCHORED_LINEUP_CONFIG
): number {
  let sum = 0;
  let n = 0;
  for (const [id, v] of prior) {
    const e = appearances.get(id) ?? 0;
    if (e >= config.minPriorAppearances && e < config.fillMaxAppearances && Number.isFinite(v)) {
      sum += v;
      n += 1;
    }
  }
  return n > 0 ? sum / n : 0;
}

/** Solves A x = b in place for symmetric positive definite A (row-major n×n). */
export function choleskySolve(a: Float64Array, b: Float64Array, n: number): Float64Array {
  for (let j = 0; j < n; j++) {
    let s = a[j * n + j]!;
    for (let k = 0; k < j; k++) s -= a[j * n + k]! * a[j * n + k]!;
    const d = Math.sqrt(Math.max(s, 1e-12));
    a[j * n + j] = d;
    for (let i = j + 1; i < n; i++) {
      let t = a[i * n + j]!;
      for (let k = 0; k < j; k++) t -= a[i * n + k]! * a[j * n + k]!;
      a[i * n + j] = t / d;
    }
  }
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = b[i]!;
    for (let k = 0; k < i; k++) s -= a[i * n + k]! * y[k]!;
    y[i] = s / a[i * n + i]!;
  }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i]!;
    for (let k = i + 1; k < n; k++) s -= a[k * n + i]! * x[k]!;
    x[i] = s / a[i * n + i]!;
  }
  return x;
}

/**
 * NET ridge on points per possession. With priorWeight 0 this is plain
 * scoreboard RAPM shrunk toward 0.
 */
export function fitAnchoredLineup(
  input: AnchoredLineupInput,
  prior: ReadonlyMap<string, number>,
  config: AnchoredLineupConfig = ANCHORED_LINEUP_CONFIG
): AnchoredLineupFit {
  const fill = anchoredPriorFill(prior, input.appearances, config);
  const priorOf = (id: string): number => {
    const v = prior.get(id);
    if (v == null || !Number.isFinite(v)) return fill;
    if ((input.appearances.get(id) ?? 0) < config.minPriorAppearances) return fill;
    return v;
  };

  const local = new Map<string, number>();
  for (const r of input.rows) {
    for (const id of r.offensePlayerIds) if (!local.has(id)) local.set(id, local.size);
    for (const id of r.defensePlayerIds) if (!local.has(id)) local.set(id, local.size);
  }
  const P = local.size;
  const n = P + 2;
  const xtx = new Float64Array(n * n);
  const xty = new Float64Array(n);
  const idx: number[] = new Array(12);
  const val: number[] = new Array(12);
  const gamma = config.priorWeight;
  for (const r of input.rows) {
    let k = 0;
    let offset = 0;
    for (const id of r.offensePlayerIds) {
      idx[k] = local.get(id)!;
      val[k++] = 1;
      offset += (gamma * priorOf(id)) / 100;
    }
    for (const id of r.defensePlayerIds) {
      idx[k] = local.get(id)!;
      val[k++] = -1;
      offset -= (gamma * priorOf(id)) / 100;
    }
    if (r.offenseIsHome) {
      idx[k] = P;
      val[k++] = 1;
    }
    idx[k] = P + 1;
    val[k++] = 1;
    const y = r.points - offset;
    for (let a = 0; a < k; a++) {
      const ia = idx[a]!;
      xty[ia]! += val[a]! * y;
      for (let b = 0; b < k; b++) xtx[ia * n + idx[b]!]! += val[a]! * val[b]!;
    }
  }
  for (let i = 0; i < P; i++) xtx[i * n + i]! += config.lambda;
  xtx[P * n + P]! += config.lambda * config.homeLambdaScale;
  xtx[(P + 1) * n + P + 1]! += config.lambda * config.interceptLambdaScale;
  const beta = P > 0 ? choleskySolve(xtx, xty, n) : new Float64Array(n);

  const ratingsPer100 = new Map<string, number>();
  for (const [id, l] of local) ratingsPer100.set(id, beta[l]! * 100 + gamma * priorOf(id));
  return {
    version: ANCHORED_LINEUP_VERSION,
    config: { ...config },
    possessions: input.rows.length,
    priorFill: fill,
    homeAdvantagePer100: P > 0 ? beta[P]! * 100 : 0,
    ratingsPer100,
  };
}

export interface AnchoredLineupSummary {
  version: typeof ANCHORED_LINEUP_VERSION;
  shadow: true;
  priorInput: "drbl100";
  priorWeight: number;
  lambda: number;
  players: number;
  possessions: number;
  homeAdvantagePer100: number;
}

export function anchoredLineupSummary(fit: AnchoredLineupFit): AnchoredLineupSummary {
  return {
    version: fit.version,
    shadow: true,
    priorInput: "drbl100",
    priorWeight: fit.config.priorWeight,
    lambda: fit.config.lambda,
    players: fit.ratingsPer100.size,
    possessions: fit.possessions,
    homeAdvantagePer100: Number(fit.homeAdvantagePer100.toFixed(3)),
  };
}

/** Players who never played a 5v5 possession keep no value (absent, not 0). */
export function attachAnchoredLineup<T extends { playerId: string }>(
  players: T[],
  fit: AnchoredLineupFit
): (T & { drblAnchored100?: number })[] {
  return players.map((p) => {
    const { drblAnchored100: _stale, ...rest } = p as T & { drblAnchored100?: number };
    void _stale;
    const v = fit.ratingsPer100.get(p.playerId);
    if (v == null || !Number.isFinite(v)) return rest as T;
    return { ...rest, drblAnchored100: Number(v.toFixed(2)) } as T & { drblAnchored100: number };
  });
}
