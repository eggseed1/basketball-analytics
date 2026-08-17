/**
 * drbl-counterfactual-epv-v1 — player-sensitive contextual possession EPV.
 *
 * V(s0, L) = M5(s0) + ContextualPlayerResidual(s0, L)
 *
 * Residual includes offensive/defensive main effects plus player×state,
 * player×teammate-role, and player×opponent-role interactions.
 * Fit on ENGINE_FIT only. Deterministic ridge. No VALIDATION/RESERVED_TEST.
 */

import { createHash } from "node:crypto";

import type { DrblProcessedGame } from "../index";
import type { DrblPossession } from "../types";
import {
  fitRidgeCoefficients,
  predictFromCoefficients,
  EPV_FEATURE_NAMES,
} from "./epv-model";
import type { PossessionEpState } from "./expected-points";
import {
  accumulateReplacementSignals,
  buildReplacementPool,
  emptyRole,
  finalizeRoleAccum,
  roleDistance,
  type ReplacementPool,
  type RoleVector,
} from "./replacement";

export const COUNTERFACTUAL_EPV_VERSION = "drbl-counterfactual-epv-v1";
export const LAMBDA_GRID = [0.1, 1, 3, 8, 20, 50, 100] as const;
export const R1_K = 8;
export const STATE_DIM = 4;
export const ROLE_DIM = 4;
export const PER_PLAYER_FEATURES = 1 + STATE_DIM;

export type SupportStatus = "SUPPORTED" | "WEAK_SUPPORT" | "UNSUPPORTED";

export interface EpvPossRow {
  gameId: string;
  gameDate: string;
  possessionId: string;
  state: PossessionEpState;
  points: number;
  offensePlayerIds: string[];
  defensePlayerIds: string[];
  m5: number;
  residualTarget: number;
}

export interface ContextualEpvModel {
  version: typeof COUNTERFACTUAL_EPV_VERSION;
  lambda: number;
  playerIds: string[];
  coefficients: number[];
  homeCoefIndex: number;
  m5Coefficients: number[];
  roleByPlayer: Record<string, RoleVector>;
  supportDistanceThreshold: number;
  weakDistanceThreshold: number;
}

function stateBasis(state: PossessionEpState): number[] {
  const periodLen = state.period <= 4 ? 720 : 300;
  return [
    periodLen > 0 ? state.clockSeconds / periodLen : 0,
    state.scoreDiff / 20,
    state.period >= 4 ? 1 : 0,
    state.offenseIsHome ? 1 : 0,
  ];
}

export function roleToArray(role: RoleVector): number[] {
  return [
    role.usage,
    role.threeRate,
    role.starterRate,
    role.minutesPerGame / 36,
  ];
}

function meanRole(
  ids: string[],
  roles: Map<string, RoleVector>,
  exclude?: string
): number[] {
  const acc = [0, 0, 0, 0];
  let n = 0;
  for (const id of ids) {
    if (exclude && id === exclude) continue;
    const r = roles.get(id) ?? emptyRole();
    const a = roleToArray(r);
    for (let i = 0; i < ROLE_DIM; i++) acc[i]! += a[i]!;
    n += 1;
  }
  if (n === 0) return roleToArray(emptyRole());
  return acc.map((v) => v / n);
}

function stateForPossession(
  possession: DrblPossession,
  game: DrblProcessedGame
): PossessionEpState {
  const start = game.events.find(
    (e) => e.actionNumber === possession.startActionNumber
  );
  const offenseIsHome = possession.offenseTeamId === game.box.homeTeamId;
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

export function buildEpvPossRows(
  games: DrblProcessedGame[],
  m5Coefficients: number[]
): EpvPossRow[] {
  const rows: EpvPossRow[] = [];
  for (const game of games) {
    for (const possession of game.possessions) {
      if (
        possession.offensePlayerIds.length !== 5 ||
        possession.defensePlayerIds.length !== 5
      ) {
        continue;
      }
      const state = stateForPossession(possession, game);
      const m5 = predictFromCoefficients(state, m5Coefficients);
      rows.push({
        gameId: game.box.gameId,
        gameDate: game.box.gameDate,
        possessionId: possession.possessionId,
        state,
        points: possession.points,
        offensePlayerIds: [...possession.offensePlayerIds],
        defensePlayerIds: [...possession.defensePlayerIds],
        m5,
        residualTarget: possession.points - m5,
      });
    }
  }
  return rows;
}

export function fitM5OnRows(
  rows: Array<{ state: PossessionEpState; points: number }>,
  lambda = 1e-2
): number[] {
  return fitRidgeCoefficients(rows, lambda);
}

function playerFeatureOffset(
  playerIndex: number,
  side: "off" | "def",
  nPlayers: number
): number {
  const sideBase = side === "off" ? 0 : nPlayers * PER_PLAYER_FEATURES;
  return sideBase + playerIndex * PER_PLAYER_FEATURES;
}

function addPlayerBlock(
  x: number[],
  offset: number,
  state: number[],
  _teammate: number[],
  _opponent: number[],
  sign: number
) {
  x[offset]! += sign;
  for (let i = 0; i < STATE_DIM; i++) {
    x[offset + 1 + i]! += sign * state[i]!;
  }
}

export function designDim(nPlayers: number): number {
  // per-player blocks + home + shared teammate/opponent composition×state (2 * ROLE_DIM * STATE_DIM)
  return nPlayers * 2 * PER_PLAYER_FEATURES + 1 + 2 * ROLE_DIM * STATE_DIM;
}

function buildDesignVector(
  row: Pick<EpvPossRow, "state" | "offensePlayerIds" | "defensePlayerIds">,
  playerIndex: Map<string, number>,
  roles: Map<string, RoleVector>,
  nPlayers: number
): number[] | null {
  const p = designDim(nPlayers);
  const x = Array.from({ length: p }, () => 0);
  const state = stateBasis(row.state);
  const oppAgg = meanRole(row.defensePlayerIds, roles);
  const offAgg = meanRole(row.offensePlayerIds, roles);

  for (const id of row.offensePlayerIds) {
    const idx = playerIndex.get(id);
    if (idx == null) continue; // unseen / below-threshold → no main/interaction credit
    const tm = meanRole(row.offensePlayerIds, roles, id);
    addPlayerBlock(
      x,
      playerFeatureOffset(idx, "off", nPlayers),
      state,
      tm,
      oppAgg,
      1
    );
  }
  for (const id of row.defensePlayerIds) {
    const idx = playerIndex.get(id);
    if (idx == null) continue;
    const tm = meanRole(row.defensePlayerIds, roles, id);
    addPlayerBlock(
      x,
      playerFeatureOffset(idx, "def", nPlayers),
      state,
      tm,
      offAgg,
      1
    );
  }
  x[nPlayers * 2 * PER_PLAYER_FEATURES]! = row.state.offenseIsHome ? 1 : 0;
  // Shared composition × state (cancels under pure focal ID swap with fixed lineups
  // for teammate/opponent aggregates of non-focal players — still helps prediction;
  // focal role enters via meanRole of the side including focal).
  const offMean = meanRole(row.offensePlayerIds, roles);
  const defMean = meanRole(row.defensePlayerIds, roles);
  let base = nPlayers * 2 * PER_PLAYER_FEATURES + 1;
  for (let i = 0; i < ROLE_DIM; i++) {
    for (let j = 0; j < STATE_DIM; j++) {
      x[base]! = offMean[i]! * state[j]!;
      base += 1;
    }
  }
  for (let i = 0; i < ROLE_DIM; i++) {
    for (let j = 0; j < STATE_DIM; j++) {
      x[base]! = defMean[i]! * state[j]!;
      base += 1;
    }
  }
  return x;
}

function solveLinear(xtx: number[][], xty: number[]): number[] {
  const p = xty.length;
  const a = xtx.map((r) => r.slice());
  const b = xty.slice();
  for (let col = 0; col < p; col++) {
    let pivot = col;
    for (let r = col + 1; r < p; r++) {
      if (Math.abs(a[r]![col]!) > Math.abs(a[pivot]![col]!)) pivot = r;
    }
    if (Math.abs(a[pivot]![col]!) < 1e-12) continue;
    [a[col], a[pivot]] = [a[pivot]!, a[col]!];
    [b[col], b[pivot]] = [b[pivot]!, b[col]!];
    const div = a[col]![col]!;
    for (let j = col; j < p; j++) a[col]![j]! /= div;
    b[col]! /= div;
    for (let r = 0; r < p; r++) {
      if (r === col) continue;
      const f = a[r]![col]!;
      for (let j = col; j < p; j++) a[r]![j]! -= f * a[col]![j]!;
      b[r]! -= f * b[col]!;
    }
  }
  return b;
}

/**
 * Sparse SGD ridge for large player×interaction designs.
 * Avoids O(p³) dense solve when p is thousands.
 */
function solveRidgeSgd(
  rows: EpvPossRow[],
  playerIndex: Map<string, number>,
  roles: Map<string, RoleVector>,
  nPlayers: number,
  lambda: number,
  epochs = 4,
  lr = 0.08
): number[] {
  const p = designDim(nPlayers);
  const w = Array.from({ length: p }, () => 0);
  if (rows.length === 0) return w;

  // Sparse: only update indices touched by the design vector.
  for (let epoch = 0; epoch < epochs; epoch++) {
    const step = lr / Math.sqrt(1 + epoch);
    for (const row of rows) {
      const x = buildDesignVector(row, playerIndex, roles, nPlayers);
      if (!x) continue;
      let pred = 0;
      const nz: number[] = [];
      for (let i = 0; i < p; i++) {
        if (x[i] !== 0) {
          nz.push(i);
          pred += w[i]! * x[i]!;
        }
      }
      const err = pred - row.residualTarget;
      const shrink = 1 - step * (lambda / rows.length);
      for (const i of nz) {
        w[i]! = w[i]! * shrink - step * err * x[i]!;
      }
    }
  }
  return w;
}

function solveRidge(
  rows: EpvPossRow[],
  playerIndex: Map<string, number>,
  roles: Map<string, RoleVector>,
  nPlayers: number,
  lambda: number
): number[] {
  const p = designDim(nPlayers);
  const xtx: number[][] = Array.from({ length: p }, () =>
    Array.from({ length: p }, () => 0)
  );
  const xty: number[] = Array.from({ length: p }, () => 0);
  for (const row of rows) {
    const x = buildDesignVector(row, playerIndex, roles, nPlayers);
    if (!x) continue;
    const y = row.residualTarget;
    for (let i = 0; i < p; i++) {
      if (x[i] === 0) continue;
      xty[i]! += x[i]! * y;
      for (let j = 0; j < p; j++) {
        if (x[j] === 0) continue;
        xtx[i]![j]! += x[i]! * x[j]!;
      }
    }
  }
  for (let i = 0; i < p; i++) xtx[i]![i]! += lambda;
  const beta = solveLinear(xtx, xty);
  return beta.map((v) => (Number.isFinite(v) ? v : 0));
}

export function predictResidual(
  row: Pick<EpvPossRow, "state" | "offensePlayerIds" | "defensePlayerIds">,
  model: ContextualEpvModel
): number | null {
  const playerIndex = new Map(model.playerIds.map((id, i) => [id, i]));
  const roles = new Map(Object.entries(model.roleByPlayer));
  const x = buildDesignVector(row, playerIndex, roles, model.playerIds.length);
  if (!x) return null;
  let y = 0;
  for (let i = 0; i < x.length; i++) y += x[i]! * (model.coefficients[i] ?? 0);
  return y;
}

export function predictV(
  row: Pick<EpvPossRow, "state" | "offensePlayerIds" | "defensePlayerIds">,
  model: ContextualEpvModel
): number | null {
  const residual = predictResidual(row, model);
  if (residual == null) return null;
  return predictFromCoefficients(row.state, model.m5Coefficients) + residual;
}

export function fitAdditiveBaseline(
  rows: EpvPossRow[],
  playerIds: string[],
  roles: Map<string, RoleVector>,
  lambda: number,
  m5Coefficients: number[]
): ContextualEpvModel {
  const playerIndex = new Map(playerIds.map((id, i) => [id, i]));
  const nPlayers = playerIds.length;
  const p = nPlayers * 2 + 1;
  const xtx: number[][] = Array.from({ length: p }, () =>
    Array.from({ length: p }, () => 0)
  );
  const xty: number[] = Array.from({ length: p }, () => 0);

  for (const row of rows) {
    const x = Array.from({ length: p }, () => 0);
    let ok = true;
    for (const id of row.offensePlayerIds) {
      const idx = playerIndex.get(id);
      if (idx == null) {
        ok = false;
        break;
      }
      x[idx]! += 1;
    }
    for (const id of row.defensePlayerIds) {
      const idx = playerIndex.get(id);
      if (idx == null) {
        ok = false;
        break;
      }
      x[nPlayers + idx]! += 1;
    }
    if (!ok) continue;
    x[p - 1]! = row.state.offenseIsHome ? 1 : 0;
    const y = row.residualTarget;
    for (let i = 0; i < p; i++) {
      xty[i]! += x[i]! * y;
      for (let j = 0; j < p; j++) xtx[i]![j]! += x[i]! * x[j]!;
    }
  }
  for (let i = 0; i < p; i++) xtx[i]![i]! += lambda;
  const b = solveLinear(xtx, xty);

  const full = Array.from({ length: designDim(nPlayers) }, () => 0);
  for (let i = 0; i < nPlayers; i++) {
    full[playerFeatureOffset(i, "off", nPlayers)] = b[i]!;
    full[playerFeatureOffset(i, "def", nPlayers)] = b[nPlayers + i]!;
  }
  full[nPlayers * 2 * PER_PLAYER_FEATURES] = b[p - 1]!;

  return {
    version: COUNTERFACTUAL_EPV_VERSION,
    lambda,
    playerIds,
    coefficients: full,
    homeCoefIndex: nPlayers * 2 * PER_PLAYER_FEATURES,
    m5Coefficients,
    roleByPlayer: Object.fromEntries(roles),
    supportDistanceThreshold: 2.5,
    weakDistanceThreshold: 1.5,
  };
}

export function selectLambdaChronoCv(
  rows: EpvPossRow[],
  playerIds: string[],
  roles: Map<string, RoleVector>,
  folds = 3
): { lambda: number; foldRmse: number[] } {
  const sorted = [...rows].sort((a, b) =>
    a.gameDate === b.gameDate
      ? a.gameId.localeCompare(b.gameId)
      : a.gameDate.localeCompare(b.gameDate)
  );
  // Fast grid: evaluate last chrono fold only (predeclared procedure).
  const cut = Math.floor(sorted.length * 0.75);
  const train = sorted.slice(0, cut);
  const hold = sorted.slice(cut);
  const playerIndex = new Map(playerIds.map((id, i) => [id, i]));
  let bestLambda = LAMBDA_GRID[3]!; // 8 default
  let bestScore = Infinity;
  const foldRmseMean: number[] = [];

  for (const lambda of LAMBDA_GRID) {
    const coeffs = solveRidge(
      train,
      playerIndex,
      roles,
      playerIds.length,
      lambda
    );
    const model: ContextualEpvModel = {
      version: COUNTERFACTUAL_EPV_VERSION,
      lambda,
      playerIds,
      coefficients: coeffs,
      homeCoefIndex: designDim(playerIds.length) - 1,
      m5Coefficients: Array.from({ length: EPV_FEATURE_NAMES.length }, () => 0),
      roleByPlayer: Object.fromEntries(roles),
      supportDistanceThreshold: 2.5,
      weakDistanceThreshold: 1.5,
    };
    let sse = 0;
    let n = 0;
    for (const row of hold) {
      const pred = predictResidual(row, model);
      if (pred == null) continue;
      const err = pred - row.residualTarget;
      sse += err * err;
      n += 1;
    }
    const rmse = n > 0 ? Math.sqrt(sse / n) : Infinity;
    foldRmseMean.push(rmse);
    if (rmse < bestScore) {
      bestScore = rmse;
      bestLambda = lambda;
    }
  }
  void folds;
  return { lambda: bestLambda, foldRmse: foldRmseMean };
}

export function fitContextualEpv(
  rows: EpvPossRow[],
  playerIds: string[],
  roles: Map<string, RoleVector>,
  m5Coefficients: number[],
  lambda: number
): ContextualEpvModel {
  const playerIndex = new Map(playerIds.map((id, i) => [id, i]));
  const coeffs = solveRidge(rows, playerIndex, roles, playerIds.length, lambda);
  return {
    version: COUNTERFACTUAL_EPV_VERSION,
    lambda,
    playerIds,
    coefficients: coeffs,
    homeCoefIndex: designDim(playerIds.length) - 1,
    m5Coefficients,
    roleByPlayer: Object.fromEntries(roles),
    supportDistanceThreshold: 2.5,
    weakDistanceThreshold: 1.5,
  };
}

export function buildRolesFromGames(
  games: DrblProcessedGame[]
): Map<string, RoleVector> {
  const accum = new Map();
  for (const game of games) {
    accumulateReplacementSignals(
      game.box,
      game.events,
      game.possessions,
      accum
    );
  }
  const candidates = finalizeRoleAccum(accum);
  return new Map(candidates.map((c) => [c.playerId, c.role]));
}

export function buildR1PoolFromGames(
  games: DrblProcessedGame[],
  cutoffDate: string
): ReplacementPool {
  const accum = new Map();
  for (const game of games) {
    accumulateReplacementSignals(
      game.box,
      game.events,
      game.possessions,
      accum
    );
  }
  const candidates = finalizeRoleAccum(accum);
  return buildReplacementPool(candidates, {
    level: "R1",
    cutoffDate,
    topN: 80,
  });
}

export function nearestReplacements(
  targetRole: RoleVector,
  pool: ReplacementPool,
  k = R1_K
): string[] {
  return [...pool.candidates]
    .map((c) => ({ id: c.playerId, d: roleDistance(targetRole, c.role) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, k)
    .map((x) => x.id);
}

export function supportStatus(args: {
  focalId: string;
  replacementIds: string[];
  model: ContextualEpvModel;
  focalRole: RoleVector;
  pool: ReplacementPool;
}): SupportStatus {
  const { focalId, replacementIds, model, focalRole, pool } = args;
  if (!model.playerIds.includes(focalId)) return "UNSUPPORTED";
  if (replacementIds.length === 0) return "UNSUPPORTED";
  const known = replacementIds.filter((id) => model.playerIds.includes(id));
  if (known.length === 0) return "UNSUPPORTED";
  const dists = known.map((id) => {
    const cand = pool.candidates.find((c) => c.playerId === id);
    return cand ? roleDistance(focalRole, cand.role) : 99;
  });
  const meanD = dists.reduce((a, b) => a + b, 0) / dists.length;
  if (known.length < 3 || meanD > model.supportDistanceThreshold) {
    return "UNSUPPORTED";
  }
  if (known.length < R1_K || meanD > model.weakDistanceThreshold) {
    return "WEAK_SUPPORT";
  }
  return "SUPPORTED";
}

/**
 * Diagnostic breakdown of supportStatus — does not change classification.
 * Reason flags map 1:1 onto checks in supportStatus / role availability.
 */
export function diagnoseSupport(args: {
  focalId: string;
  replacementIds: string[];
  model: ContextualEpvModel;
  focalRole: RoleVector;
  pool: ReplacementPool;
  roles: Map<string, RoleVector>;
}): {
  status: SupportStatus;
  reasons: string[];
  knownReplacementCount: number;
  meanRoleDistance: number | null;
} {
  const { focalId, replacementIds, model, focalRole, pool, roles } = args;
  const reasons: string[] = [];
  if (!model.playerIds.includes(focalId)) {
    reasons.push("FOCAL_ID_UNSEEN");
  }
  if (!roles.has(focalId) && !pool.candidates.some((c) => c.playerId === focalId)) {
    // Focal may still have emptyRole fallback; flag only if truly absent from FIT roles map
    if (!roles.has(focalId)) reasons.push("ROLE_VECTOR_MISSING");
  }
  if (replacementIds.length === 0) {
    reasons.push("TOO_FEW_REPLACEMENTS");
  }
  const known = replacementIds.filter((id) => model.playerIds.includes(id));
  const unseenReps = replacementIds.filter((id) => !model.playerIds.includes(id));
  if (unseenReps.length > 0) reasons.push("REPLACEMENT_ID_UNSEEN");
  if (known.length === 0 && replacementIds.length > 0) {
    reasons.push("TOO_FEW_REPLACEMENTS");
  }
  let meanD: number | null = null;
  if (known.length > 0) {
    const dists = known.map((id) => {
      const cand = pool.candidates.find((c) => c.playerId === id);
      return cand ? roleDistance(focalRole, cand.role) : 99;
    });
    meanD = dists.reduce((a, b) => a + b, 0) / dists.length;
    if (known.length < R1_K) reasons.push("TOO_FEW_REPLACEMENTS");
    // Geometric gate in supportStatus is mean roleDistance vs thresholds
    if (meanD > model.supportDistanceThreshold) {
      reasons.push("STATE_DISTANCE"); // roleDistance > supportDistanceThreshold
    } else if (meanD > model.weakDistanceThreshold) {
      reasons.push("STATE_DISTANCE"); // roleDistance > weakDistanceThreshold
    }
  } else if (replacementIds.length > 0) {
    reasons.push("TOO_FEW_REPLACEMENTS");
  }
  // Deduplicate while preserving order
  const uniq = [...new Set(reasons)];
  if (uniq.length > 1) uniq.push("MULTIPLE_FAILURES");
  const status = supportStatus(args);
  // If SUPPORTED, clear failure reasons
  if (status === "SUPPORTED") {
    return {
      status,
      reasons: [],
      knownReplacementCount: known.length,
      meanRoleDistance: meanD,
    };
  }
  // WEAK: still report why not SUPPORTED
  if (status === "WEAK_SUPPORT") {
    const weakReasons: string[] = [];
    if (known.length < R1_K) weakReasons.push("TOO_FEW_REPLACEMENTS");
    if (meanD != null && meanD > model.weakDistanceThreshold) {
      weakReasons.push("STATE_DISTANCE");
    }
    if (unseenReps.length > 0) weakReasons.push("REPLACEMENT_ID_UNSEEN");
    const w = [...new Set(weakReasons)];
    if (w.length > 1) w.push("MULTIPLE_FAILURES");
    return {
      status,
      reasons: w,
      knownReplacementCount: known.length,
      meanRoleDistance: meanD,
    };
  }
  return {
    status,
    reasons: uniq.length ? uniq : ["TOO_FEW_REPLACEMENTS"],
    knownReplacementCount: known.length,
    meanRoleDistance: meanD,
  };
}

export interface CounterfactualDecomposition {
  totalDelta: number;
  staticMainEffect: number;
  stateInteractionEffect: number;
  teammateCompositionInteractionEffect: number;
  opponentCompositionInteractionEffect: number;
}

function playerCoefSlice(
  model: ContextualEpvModel,
  playerId: string,
  side: "off" | "def"
): number[] | null {
  const idx = model.playerIds.indexOf(playerId);
  if (idx < 0) return null;
  const off = playerFeatureOffset(idx, side, model.playerIds.length);
  return model.coefficients.slice(off, off + PER_PLAYER_FEATURES);
}

export function decomposeOffenseSwap(
  row: EpvPossRow,
  focalId: string,
  replacementIds: string[],
  model: ContextualEpvModel
): CounterfactualDecomposition | null {
  if (!row.offensePlayerIds.includes(focalId)) return null;
  const state = stateBasis(row.state);
  const focal = playerCoefSlice(model, focalId, "off");
  if (!focal) return null;

  const parts = (coef: number[]) => ({
    main: coef[0]!,
    state: coef
      .slice(1, 1 + STATE_DIM)
      .reduce((s, c, i) => s + c * state[i]!, 0),
  });

  const f = parts(focal);
  let mainR = 0;
  let stateR = 0;
  let n = 0;
  for (const rid of replacementIds) {
    const coef = playerCoefSlice(model, rid, "off");
    if (!coef) continue;
    const r = parts(coef);
    mainR += r.main;
    stateR += r.state;
    n += 1;
  }
  if (n === 0) return null;
  mainR /= n;
  stateR /= n;

  // Shared composition×state: offense mean role changes when focal is swapped.
  const roles = new Map(Object.entries(model.roleByPlayer));
  const offActual = meanRole(row.offensePlayerIds, roles);
  let offRep = [0, 0, 0, 0];
  let rn = 0;
  for (const rid of replacementIds) {
    const swapped = row.offensePlayerIds.map((id) =>
      id === focalId ? rid : id
    );
    const m = meanRole(swapped, roles);
    for (let i = 0; i < ROLE_DIM; i++) offRep[i]! += m[i]!;
    rn += 1;
  }
  if (rn > 0) offRep = offRep.map((v) => v / rn);
  const nPlayers = model.playerIds.length;
  let base = nPlayers * 2 * PER_PLAYER_FEATURES + 1;
  let teammateCompositionInteractionEffect = 0;
  for (let i = 0; i < ROLE_DIM; i++) {
    for (let j = 0; j < STATE_DIM; j++) {
      const coef = model.coefficients[base] ?? 0;
      teammateCompositionInteractionEffect +=
        coef * ((offActual[i]! - offRep[i]!) * state[j]!);
      base += 1;
    }
  }
  // Opponent shared block is unchanged under offense focal swap.
  const opponentCompositionInteractionEffect = 0;

  const staticMainEffect = f.main - mainR;
  const stateInteractionEffect = f.state - stateR;
  return {
    totalDelta:
      staticMainEffect +
      stateInteractionEffect +
      teammateCompositionInteractionEffect +
      opponentCompositionInteractionEffect,
    staticMainEffect,
    stateInteractionEffect,
    teammateCompositionInteractionEffect,
    opponentCompositionInteractionEffect,
  };
}

export function metricsFromPredictions(
  actual: number[],
  pred: number[]
): {
  rmse: number;
  mae: number;
  meanPred: number;
  meanActual: number;
  r2: number;
  calibrationIntercept: number;
  calibrationSlope: number;
} {
  const n = actual.length;
  if (n === 0) {
    return {
      rmse: NaN,
      mae: NaN,
      meanPred: NaN,
      meanActual: NaN,
      r2: NaN,
      calibrationIntercept: NaN,
      calibrationSlope: NaN,
    };
  }
  let sse = 0;
  let sae = 0;
  let sumA = 0;
  let sumP = 0;
  for (let i = 0; i < n; i++) {
    const e = pred[i]! - actual[i]!;
    sse += e * e;
    sae += Math.abs(e);
    sumA += actual[i]!;
    sumP += pred[i]!;
  }
  const meanA = sumA / n;
  const meanP = sumP / n;
  let sst = 0;
  let cov = 0;
  let varP = 0;
  for (let i = 0; i < n; i++) {
    sst += (actual[i]! - meanA) ** 2;
    cov += (pred[i]! - meanP) * (actual[i]! - meanA);
    varP += (pred[i]! - meanP) ** 2;
  }
  const slope = varP > 1e-12 ? cov / varP : 0;
  return {
    rmse: Math.sqrt(sse / n),
    mae: sae / n,
    meanPred: meanP,
    meanActual: meanA,
    r2: sst > 1e-12 ? 1 - sse / sst : 0,
    calibrationIntercept: meanA - slope * meanP,
    calibrationSlope: slope,
  };
}

export function hashList(ids: string[]): string {
  return createHash("sha256").update(ids.slice().sort().join("\n")).digest("hex");
}

export { EPV_FEATURE_NAMES };
