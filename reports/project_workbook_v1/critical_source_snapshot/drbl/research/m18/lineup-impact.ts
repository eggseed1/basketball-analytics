/**
 * M18 research-only lineup impact (sidecar).
 * Does NOT modify production DRBL-LN (drbl-ln-ridge-v1).
 *
 * m18-lineup-impact-v1:
 *   y = possession.points (scoreboard)
 *   X = +1 offense / −1 defense (net) OR separate O/D indicators
 *   ridge λ from frozen grid
 */
import type { DrblBoxScore, DrblPossession } from "../../types";

export const M18_LINEUP_VERSION = "m18-lineup-impact-v1";

export type M18LineupRow = {
  gameId: string;
  gameDate: string;
  offenseTeamId: string;
  defenseTeamId: string;
  offensePlayerIds: string[];
  defensePlayerIds: string[];
  offenseIsHome: boolean;
  /** Scoreboard points on the possession. */
  points: number;
};

export type M18LineupFit = {
  version: typeof M18_LINEUP_VERSION;
  mode: "NET" | "OD";
  lambda: number;
  playerIds: string[];
  /** Net mode: one coef per player (pts/poss). OD: [O..., D...] length 2p. */
  coefficients: number[];
  homeCoef: number;
  intercept: number;
  nPossessions: number;
};

export function buildM18LineupRows(
  box: DrblBoxScore,
  possessions: DrblPossession[]
): M18LineupRow[] {
  const rows: M18LineupRow[] = [];
  for (const possession of possessions) {
    const offensePlayerIds = possession.offensePlayerIds.filter(Boolean);
    const defensePlayerIds = possession.defensePlayerIds.filter(Boolean);
    if (offensePlayerIds.length < 5 || defensePlayerIds.length < 5) continue;
    rows.push({
      gameId: possession.gameId,
      gameDate: box.gameDate || "",
      offenseTeamId: possession.offenseTeamId,
      defenseTeamId: possession.defenseTeamId,
      offensePlayerIds,
      defensePlayerIds,
      offenseIsHome: possession.offenseTeamId === box.homeTeamId,
      points: possession.points,
    });
  }
  return rows;
}

function collectPlayers(rows: M18LineupRow[]): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    for (const id of r.offensePlayerIds) set.add(id);
    for (const id of r.defensePlayerIds) set.add(id);
  }
  return [...set].sort();
}

function solveLinearSystem(aIn: number[][], bIn: number[]): number[] {
  const n = bIn.length;
  const a = aIn.map((row) => row.slice());
  const b = bIn.slice();
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(a[r]![col]!) > Math.abs(a[pivot]![col]!)) pivot = r;
    }
    if (Math.abs(a[pivot]![col]!) < 1e-12) continue;
    [a[col], a[pivot]] = [a[pivot]!, a[col]!];
    [b[col], b[pivot]] = [b[pivot]!, b[col]!];
    const div = a[col]![col]!;
    for (let j = col; j < n; j++) a[col]![j]! /= div;
    b[col]! /= div;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = a[r]![col]!;
      for (let j = col; j < n; j++) a[r]![j]! -= f * a[col]![j]!;
      b[r]! -= f * b[col]!;
    }
  }
  return b;
}

/** Net RAPM-style: offense +1, defense −1, home, intercept. y = points. */
export function fitM18LineupNet(
  rows: M18LineupRow[],
  lambda: number
): M18LineupFit {
  const playerIds = collectPlayers(rows);
  const p = playerIds.length;
  const dim = p + 2; // players + home + intercept
  const index = new Map(playerIds.map((id, i) => [id, i] as const));
  const xtx: number[][] = Array.from({ length: dim }, () =>
    Array.from({ length: dim }, () => 0)
  );
  const xty: number[] = Array.from({ length: dim }, () => 0);

  for (const row of rows) {
    const active = new Map<number, number>();
    for (const id of row.offensePlayerIds) {
      const i = index.get(id);
      if (i != null) active.set(i, (active.get(i) ?? 0) + 1);
    }
    for (const id of row.defensePlayerIds) {
      const i = index.get(id);
      if (i != null) active.set(i, (active.get(i) ?? 0) - 1);
    }
    if (row.offenseIsHome) active.set(p, (active.get(p) ?? 0) + 1);
    active.set(p + 1, 1); // intercept
    const entries = [...active.entries()];
    for (const [i, xi] of entries) {
      xty[i]! += xi * row.points;
      for (const [j, xj] of entries) xtx[i]![j]! += xi * xj;
    }
  }
  for (let i = 0; i < p; i++) xtx[i]![i]! += lambda;
  xtx[p]![p]! += lambda * 0.25;
  // intercept lightly regularized
  xtx[p + 1]![p + 1]! += lambda * 0.01;

  const beta = solveLinearSystem(xtx, xty);
  return {
    version: M18_LINEUP_VERSION,
    mode: "NET",
    lambda,
    playerIds,
    coefficients: beta.slice(0, p),
    homeCoef: beta[p] ?? 0,
    intercept: beta[p + 1] ?? 0,
    nPossessions: rows.length,
  };
}

/** Separate offense/defense player effects. Layout: [O_0..O_p-1, D_0..D_p-1, home, intercept]. */
export function fitM18LineupOD(
  rows: M18LineupRow[],
  lambda: number
): M18LineupFit {
  const playerIds = collectPlayers(rows);
  const p = playerIds.length;
  const dim = 2 * p + 2;
  const index = new Map(playerIds.map((id, i) => [id, i] as const));
  const xtx: number[][] = Array.from({ length: dim }, () =>
    Array.from({ length: dim }, () => 0)
  );
  const xty: number[] = Array.from({ length: dim }, () => 0);

  for (const row of rows) {
    const active = new Map<number, number>();
    for (const id of row.offensePlayerIds) {
      const i = index.get(id);
      if (i != null) active.set(i, (active.get(i) ?? 0) + 1);
    }
    for (const id of row.defensePlayerIds) {
      const i = index.get(id);
      if (i != null) active.set(p + i, (active.get(p + i) ?? 0) + 1);
    }
    if (row.offenseIsHome) active.set(2 * p, (active.get(2 * p) ?? 0) + 1);
    active.set(2 * p + 1, 1);
    const entries = [...active.entries()];
    for (const [i, xi] of entries) {
      xty[i]! += xi * row.points;
      for (const [j, xj] of entries) xtx[i]![j]! += xi * xj;
    }
  }
  for (let i = 0; i < 2 * p; i++) xtx[i]![i]! += lambda;
  xtx[2 * p]![2 * p]! += lambda * 0.25;
  xtx[2 * p + 1]![2 * p + 1]! += lambda * 0.01;

  const beta = solveLinearSystem(xtx, xty);
  return {
    version: M18_LINEUP_VERSION,
    mode: "OD",
    lambda,
    playerIds,
    coefficients: beta.slice(0, 2 * p),
    homeCoef: beta[2 * p] ?? 0,
    intercept: beta[2 * p + 1] ?? 0,
    nPossessions: rows.length,
  };
}

/** Per-100 net impact from NET fit. */
export function netRatingsPer100(fit: M18LineupFit): Map<string, number> {
  const out = new Map<string, number>();
  if (fit.mode !== "NET") return out;
  for (let i = 0; i < fit.playerIds.length; i++) {
    out.set(fit.playerIds[i]!, (fit.coefficients[i] ?? 0) * 100);
  }
  return out;
}

/** Combined L = 100*(L_O - L_D) convention for OD fits (documented). */
export function odCombinedPer100(fit: M18LineupFit): Map<string, number> {
  const out = new Map<string, number>();
  if (fit.mode !== "OD") return out;
  const p = fit.playerIds.length;
  for (let i = 0; i < p; i++) {
    const o = fit.coefficients[i] ?? 0;
    const d = fit.coefficients[p + i] ?? 0;
    out.set(fit.playerIds[i]!, (o - d) * 100);
  }
  return out;
}

export function odSeparatePer100(fit: M18LineupFit): {
  o: Map<string, number>;
  d: Map<string, number>;
} {
  const o = new Map<string, number>();
  const d = new Map<string, number>();
  if (fit.mode !== "OD") return { o, d };
  const p = fit.playerIds.length;
  for (let i = 0; i < p; i++) {
    o.set(fit.playerIds[i]!, (fit.coefficients[i] ?? 0) * 100);
    d.set(fit.playerIds[i]!, (fit.coefficients[p + i] ?? 0) * 100);
  }
  return { o, d };
}

export function chronologicalGameSplit(
  rows: M18LineupRow[],
  holdoutFrac: number
): { train: M18LineupRow[]; holdout: M18LineupRow[] } {
  const games = [
    ...new Map(rows.map((r) => [r.gameId, r.gameDate] as const)).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]));
  const cut = Math.max(1, Math.floor(games.length * (1 - holdoutFrac)));
  const holdoutGames = new Set(games.slice(cut).map(([id]) => id));
  return {
    train: rows.filter((r) => !holdoutGames.has(r.gameId)),
    holdout: rows.filter((r) => holdoutGames.has(r.gameId)),
  };
}

export function chronologicalHalves(rows: M18LineupRow[]): {
  first: M18LineupRow[];
  second: M18LineupRow[];
} {
  return chronologicalGameSplit(rows, 0.5) as unknown as {
    first: M18LineupRow[];
    second: M18LineupRow[];
  };
}

/** HoldoutFrac is trailing share → train=first, holdout=second when 0.5. */
export function splitHalves(rows: M18LineupRow[]): {
  first: M18LineupRow[];
  second: M18LineupRow[];
} {
  const { train, holdout } = chronologicalGameSplit(rows, 0.5);
  return { first: train, second: holdout };
}

export function evaluateNetPred(
  rows: M18LineupRow[],
  fit: M18LineupFit
): { n: number; mae: number; rmse: number } {
  if (fit.mode !== "NET" || !rows.length) return { n: 0, mae: 0, rmse: 0 };
  const index = new Map(fit.playerIds.map((id, i) => [id, i] as const));
  let abs = 0;
  let sq = 0;
  for (const row of rows) {
    let yhat = fit.intercept + (row.offenseIsHome ? fit.homeCoef : 0);
    for (const id of row.offensePlayerIds) {
      const i = index.get(id);
      if (i != null) yhat += fit.coefficients[i] ?? 0;
    }
    for (const id of row.defensePlayerIds) {
      const i = index.get(id);
      if (i != null) yhat -= fit.coefficients[i] ?? 0;
    }
    const err = yhat - row.points;
    abs += Math.abs(err);
    sq += err * err;
  }
  const n = rows.length;
  return { n, mae: abs / n, rmse: Math.sqrt(sq / n) };
}

/** Shuffle player IDs within offense/defense slots per possession (identity placebo). */
export function shuffleLineupIdentities(
  rows: M18LineupRow[],
  seed: number
): M18LineupRow[] {
  let t = seed >>> 0;
  const rng = () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
  const poolOff = new Map<string, string[]>();
  const poolDef = new Map<string, string[]>();
  for (const row of rows) {
    const o = poolOff.get(row.offenseTeamId) ?? [];
    const d = poolDef.get(row.defenseTeamId) ?? [];
    for (const id of row.offensePlayerIds) o.push(id);
    for (const id of row.defensePlayerIds) d.push(id);
    poolOff.set(row.offenseTeamId, o);
    poolDef.set(row.defenseTeamId, d);
  }
  for (const arr of poolOff.values()) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j]!, arr[i]!];
    }
  }
  for (const arr of poolDef.values()) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j]!, arr[i]!];
    }
  }
  const offIdx = new Map<string, number>();
  const defIdx = new Map<string, number>();
  return rows.map((row) => {
    const oPool = poolOff.get(row.offenseTeamId)!;
    const dPool = poolDef.get(row.defenseTeamId)!;
    const oi = offIdx.get(row.offenseTeamId) ?? 0;
    const di = defIdx.get(row.defenseTeamId) ?? 0;
    const offensePlayerIds = oPool.slice(oi, oi + 5);
    const defensePlayerIds = dPool.slice(di, di + 5);
    offIdx.set(row.offenseTeamId, oi + 5);
    defIdx.set(row.defenseTeamId, di + 5);
    while (offensePlayerIds.length < 5 && oPool.length)
      offensePlayerIds.push(oPool[Math.floor(rng() * oPool.length)]!);
    while (defensePlayerIds.length < 5 && dPool.length)
      defensePlayerIds.push(dPool[Math.floor(rng() * dPool.length)]!);
    return { ...row, offensePlayerIds, defensePlayerIds };
  });
}
