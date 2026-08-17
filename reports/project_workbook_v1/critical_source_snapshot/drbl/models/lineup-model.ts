/**
 * M9 — DRBL-LN: regularized lineup (possession RAPM-style) model.
 *
 * Y_t = residual points vs EPV on possession t
 * X: +1 offense on-court, −1 defense on-court, optional home flag
 * Fit ridge: (X'X + λI) β = X'y
 *
 * This is an adjusted association estimator — not causal (v2.1 §10).
 */

import type { DrblBoxScore, DrblEvent, DrblPossession } from "../types";
import {
  predictExpectedPoints,
  type PossessionEpState,
} from "./expected-points";
import { stateForPossession } from "./player-value";

export interface LineupPossessionRow {
  gameId: string;
  gameDate: string;
  offensePlayerIds: string[];
  defensePlayerIds: string[];
  offenseIsHome: boolean;
  /** Points − EPV(state). */
  residual: number;
}

export interface LineupModelArtifact {
  version: string;
  fittedAt: string;
  lambda: number;
  playerIds: string[];
  /** Coefficients aligned with playerIds (points per possession). */
  coefficients: number[];
  /** Home offense bump. */
  homeCoef: number;
  train: { n: number; mae: number; rmse: number };
  holdout?: { n: number; mae: number; rmse: number };
}

export function buildLineupRows(
  box: DrblBoxScore,
  events: DrblEvent[],
  possessions: DrblPossession[]
): LineupPossessionRow[] {
  const rows: LineupPossessionRow[] = [];
  for (const possession of possessions) {
    const offensePlayerIds = possession.offensePlayerIds.filter(Boolean);
    const defensePlayerIds = possession.defensePlayerIds.filter(Boolean);
    if (offensePlayerIds.length === 0 || defensePlayerIds.length === 0) {
      continue;
    }
    const state: PossessionEpState = stateForPossession(
      possession,
      box,
      events
    );
    const ep = predictExpectedPoints(state);
    rows.push({
      gameId: possession.gameId,
      gameDate: box.gameDate || "",
      offensePlayerIds,
      defensePlayerIds,
      offenseIsHome: state.offenseIsHome,
      residual: possession.points - ep,
    });
  }
  return rows;
}

function collectPlayerIds(rows: LineupPossessionRow[]): string[] {
  const set = new Set<string>();
  for (const row of rows) {
    for (const id of row.offensePlayerIds) set.add(id);
    for (const id of row.defensePlayerIds) set.add(id);
  }
  return [...set].sort();
}

/**
 * Fit ridge lineup coefficients.
 * Index layout: [players..., homeFlag]
 */
export function fitLineupRidge(
  rows: LineupPossessionRow[],
  options: { lambda?: number } = {}
): {
  playerIds: string[];
  coefficients: number[];
  homeCoef: number;
} {
  const lambda = options.lambda ?? 800;
  const playerIds = collectPlayerIds(rows);
  const p = playerIds.length;
  const dim = p + 1; // + home
  const index = new Map(playerIds.map((id, i) => [id, i] as const));

  const xtx: number[][] = Array.from({ length: dim }, () =>
    Array.from({ length: dim }, () => 0)
  );
  const xty: number[] = Array.from({ length: dim }, () => 0);

  for (const row of rows) {
    const active = new Map<number, number>();
    for (const id of row.offensePlayerIds) {
      const i = index.get(id);
      if (i == null) continue;
      active.set(i, (active.get(i) ?? 0) + 1);
    }
    for (const id of row.defensePlayerIds) {
      const i = index.get(id);
      if (i == null) continue;
      active.set(i, (active.get(i) ?? 0) - 1);
    }
    if (row.offenseIsHome) active.set(p, (active.get(p) ?? 0) + 1);

    const entries = [...active.entries()];
    for (const [i, xi] of entries) {
      xty[i]! += xi * row.residual;
      for (const [j, xj] of entries) {
        xtx[i]![j]! += xi * xj;
      }
    }
  }

  for (let i = 0; i < dim; i++) {
    xtx[i]![i]! += i < p ? lambda : lambda * 0.25;
  }

  const beta = solveLinearSystem(xtx, xty);
  return {
    playerIds,
    coefficients: beta.slice(0, p),
    homeCoef: beta[p] ?? 0,
  };
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

export function predictLineupResidual(
  row: LineupPossessionRow,
  playerIds: string[],
  coefficients: number[],
  homeCoef: number
): number {
  const index = new Map(playerIds.map((id, i) => [id, i] as const));
  let y = row.offenseIsHome ? homeCoef : 0;
  for (const id of row.offensePlayerIds) {
    const i = index.get(id);
    if (i != null) y += coefficients[i] ?? 0;
  }
  for (const id of row.defensePlayerIds) {
    const i = index.get(id);
    if (i != null) y -= coefficients[i] ?? 0;
  }
  return y;
}

export function evaluateLineupModel(
  rows: LineupPossessionRow[],
  playerIds: string[],
  coefficients: number[],
  homeCoef: number
): { n: number; mae: number; rmse: number } {
  if (rows.length === 0) return { n: 0, mae: 0, rmse: 0 };
  let abs = 0;
  let sq = 0;
  for (const row of rows) {
    const pred = predictLineupResidual(row, playerIds, coefficients, homeCoef);
    const err = pred - row.residual;
    abs += Math.abs(err);
    sq += err * err;
  }
  const n = rows.length;
  return { n, mae: abs / n, rmse: Math.sqrt(sq / n) };
}

export function chronologicalSplitRows(
  rows: LineupPossessionRow[],
  holdoutFrac: number
): { train: LineupPossessionRow[]; holdout: LineupPossessionRow[] } {
  const games = [
    ...new Map(rows.map((r) => [r.gameId, r.gameDate] as const)).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]));
  const cut = Math.floor(games.length * (1 - holdoutFrac));
  const holdoutGames = new Set(games.slice(cut).map(([id]) => id));
  return {
    train: rows.filter((r) => !holdoutGames.has(r.gameId)),
    holdout: rows.filter((r) => holdoutGames.has(r.gameId)),
  };
}

/** Per-player LN rating scaled to ~per 100 possessions. */
export function lineupRatingsPer100(
  playerIds: string[],
  coefficients: number[]
): Map<string, number> {
  const out = new Map<string, number>();
  for (let i = 0; i < playerIds.length; i++) {
    out.set(playerIds[i]!, Number(((coefficients[i] ?? 0) * 100).toFixed(2)));
  }
  return out;
}

/**
 * Fit LN on all rows (optionally report holdout metrics from chrono split).
 */
export function fitLineupModel(
  rows: LineupPossessionRow[],
  options: { lambda?: number; holdoutFrac?: number } = {}
): LineupModelArtifact & { ratingsPer100: Map<string, number> } {
  const holdoutFrac = options.holdoutFrac ?? 0.2;
  const { train, holdout } = chronologicalSplitRows(rows, holdoutFrac);
  const fitRows = train.length >= 50 ? train : rows;
  const fitted = fitLineupRidge(fitRows, { lambda: options.lambda });
  const trainMetrics = evaluateLineupModel(
    fitRows,
    fitted.playerIds,
    fitted.coefficients,
    fitted.homeCoef
  );
  const holdoutMetrics =
    holdout.length > 0
      ? evaluateLineupModel(
          holdout,
          fitted.playerIds,
          fitted.coefficients,
          fitted.homeCoef
        )
      : undefined;

  return {
    version: "drbl-ln-ridge-v1",
    fittedAt: new Date().toISOString(),
    lambda: options.lambda ?? 800,
    playerIds: fitted.playerIds,
    coefficients: fitted.coefficients.map((c) => Math.round(c * 1e6) / 1e6),
    homeCoef: Math.round(fitted.homeCoef * 1e6) / 1e6,
    train: {
      n: trainMetrics.n,
      mae: Math.round(trainMetrics.mae * 1000) / 1000,
      rmse: Math.round(trainMetrics.rmse * 1000) / 1000,
    },
    holdout: holdoutMetrics
      ? {
          n: holdoutMetrics.n,
          mae: Math.round(holdoutMetrics.mae * 1000) / 1000,
          rmse: Math.round(holdoutMetrics.rmse * 1000) / 1000,
        }
      : undefined,
    ratingsPer100: lineupRatingsPer100(
      fitted.playerIds,
      fitted.coefficients
    ),
  };
}
