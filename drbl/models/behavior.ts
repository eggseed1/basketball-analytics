/**
 * M10 — DRBL-B: public behavioral features → regularized impact proxy.
 *
 * Sources: box + play-by-play only (no optical tracking).
 * "Gravity" is labeled **DRBL Gravity Proxy** (teammate 3PA share while on
 * offense) — not true defender gravity.
 *
 * Optional: a missing behavioral fit must not block DRBL-P / DRBL-LN.
 */

import { DRBL_PARSER_VERSION } from "../constants";
import type { DrblBoxScore, DrblEvent, DrblPossession } from "../types";
import {
  predictExpectedPoints,
  type PossessionEpState,
} from "./expected-points";

export const BEHAVIOR_FEATURE_KEYS = [
  "usage",
  "threeRate",
  "assistPer100",
  "tovPer100",
  "stlPer100",
  "blkPer100",
  "ftRate",
  "rimRate",
  "gravityProxy",
] as const;

export type BehaviorFeatureKey = (typeof BEHAVIOR_FEATURE_KEYS)[number];

export interface BehaviorFeatureVector {
  usage: number;
  threeRate: number;
  assistPer100: number;
  tovPer100: number;
  stlPer100: number;
  blkPer100: number;
  ftRate: number;
  /** Share of located FGA within ~8 ft of the rim. */
  rimRate: number;
  /**
   * DRBL Gravity Proxy — teammate 3PA / teammate FGA while this player is
   * on offense (not the shooter). Not optical gravity.
   */
  gravityProxy: number;
}

export interface BehaviorPlayerRow {
  playerId: string;
  playerName: string;
  teamId: string;
  possessions: number;
  features: BehaviorFeatureVector;
  /** Target: mean residual × 100 (points/100 vs EPV). */
  targetPer100: number;
  asOfDate: string;
  /** Fraction of this player's FGA missing x/y. */
  missingXyRate: number;
}

export interface BehaviorProvenance {
  version: string;
  sources: string[];
  endpoint: string;
  asOfTimestamp: string;
  postGameOnly: true;
  parserVersion: string;
  coverage: {
    games: number;
    players: number;
    missingXyRate: number;
  };
  definitions: Record<string, string>;
}

export interface BehaviorModelArtifact {
  version: string;
  fittedAt: string;
  lambda: number;
  featureKeys: BehaviorFeatureKey[];
  /** Intercept + coefficients aligned with featureKeys. */
  intercept: number;
  coefficients: number[];
  featureMeans: number[];
  featureStds: number[];
  train: { n: number; mae: number; rmse: number };
  holdout?: { n: number; mae: number; rmse: number };
  provenance: BehaviorProvenance;
}

interface BehaviorAccum {
  playerId: string;
  playerName: string;
  teamId: string;
  offPoss: number;
  defPoss: number;
  involvement: number;
  fga: number;
  fg3a: number;
  fgaWithXy: number;
  rimFga: number;
  fta: number;
  assists: number;
  turnovers: number;
  steals: number;
  blocks: number;
  /** Teammate FGA / 3PA while on offense and not the shooter. */
  teammateFga: number;
  teammateFg3a: number;
  residualSum: number;
  residualN: number;
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

/** Approximate shot distance in feet from NBA x/y (often tenths of a foot). */
export function shotDistanceFeet(
  x: number | null,
  y: number | null
): number | null {
  if (x == null || y == null) return null;
  const dist = Math.sqrt(x * x + y * y);
  // Heuristic: values > 50 are usually tenths-of-a-foot coords.
  return dist > 50 ? dist / 10 : dist;
}

function ensureAccum(
  into: Map<string, BehaviorAccum>,
  playerId: string,
  playerName: string,
  teamId: string
): BehaviorAccum {
  let row = into.get(playerId);
  if (!row) {
    row = {
      playerId,
      playerName,
      teamId,
      offPoss: 0,
      defPoss: 0,
      involvement: 0,
      fga: 0,
      fg3a: 0,
      fgaWithXy: 0,
      rimFga: 0,
      fta: 0,
      assists: 0,
      turnovers: 0,
      steals: 0,
      blocks: 0,
      teammateFga: 0,
      teammateFg3a: 0,
      residualSum: 0,
      residualN: 0,
      lastDate: "",
    };
    into.set(playerId, row);
  }
  return row;
}

/**
 * Accumulate public behavioral counts for one reconciled game.
 */
export function accumulateBehaviorSignals(
  box: DrblBoxScore,
  events: DrblEvent[],
  possessions: DrblPossession[],
  into: Map<string, BehaviorAccum>
): void {
  const gameDate = box.gameDate || "";
  const eventsByAction = new Map(events.map((e) => [e.actionNumber, e]));

  for (const player of box.players) {
    const row = ensureAccum(
      into,
      player.playerId,
      player.playerName,
      player.teamId
    );
    row.assists += player.assists;
    row.turnovers += player.turnovers;
    row.steals += player.steals;
    row.blocks += player.blocks;
    row.fta += player.freeThrowsAttempted;
    if (gameDate && gameDate >= row.lastDate) row.lastDate = gameDate;
    row.playerName = player.playerName;
    row.teamId = player.teamId;
  }

  for (const event of events) {
    if (!event.playerId) continue;
    if (event.actionType === "2pt" || event.actionType === "3pt") {
      const row = into.get(event.playerId);
      if (!row) continue;
      row.fga += 1;
      if (event.actionType === "3pt") row.fg3a += 1;
      const dist = shotDistanceFeet(event.x, event.y);
      if (dist != null) {
        row.fgaWithXy += 1;
        if (dist <= 8) row.rimFga += 1;
      }
    }
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
      const involved = possession.eventActionNumbers.some((n) => {
        const e = eventsByAction.get(n);
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

    // Gravity proxy: teammate shot mix while each offense player is on court.
    for (const n of possession.eventActionNumbers) {
      const event = eventsByAction.get(n);
      if (!event?.playerId) continue;
      if (event.actionType !== "2pt" && event.actionType !== "3pt") continue;
      for (const playerId of offenseIds) {
        if (playerId === event.playerId) continue;
        const row = into.get(playerId);
        if (!row) continue;
        row.teammateFga += 1;
        if (event.actionType === "3pt") row.teammateFg3a += 1;
      }
    }
  }
}

export function finalizeBehaviorRows(
  accum: Map<string, BehaviorAccum>,
  options: { minPossessions?: number } = {}
): BehaviorPlayerRow[] {
  const minPossessions = options.minPossessions ?? 50;
  const out: BehaviorPlayerRow[] = [];
  for (const row of accum.values()) {
    const possessions = row.offPoss + row.defPoss;
    if (possessions < minPossessions) continue;
    const off = Math.max(1, row.offPoss);
    const per100 = 100 / off;
    const fga = Math.max(1, row.fga);
    const features: BehaviorFeatureVector = {
      usage: row.offPoss > 0 ? row.involvement / row.offPoss : 0.2,
      threeRate: row.fga > 0 ? row.fg3a / row.fga : 0.35,
      assistPer100: row.assists * per100,
      tovPer100: row.turnovers * per100,
      stlPer100: (row.steals * 100) / Math.max(1, row.defPoss),
      blkPer100: (row.blocks * 100) / Math.max(1, row.defPoss),
      ftRate: row.fta / (fga + 0.44 * Math.max(0, row.fta)),
      rimRate: row.fgaWithXy > 0 ? row.rimFga / row.fgaWithXy : 0.25,
      gravityProxy:
        row.teammateFga > 0 ? row.teammateFg3a / row.teammateFga : 0.35,
    };
    out.push({
      playerId: row.playerId,
      playerName: row.playerName,
      teamId: row.teamId,
      possessions,
      features,
      targetPer100:
        row.residualN > 0 ? (row.residualSum / row.residualN) * 100 : 0,
      asOfDate: row.lastDate || "",
      missingXyRate: row.fga > 0 ? 1 - row.fgaWithXy / row.fga : 1,
    });
  }
  return out;
}

function featureArray(f: BehaviorFeatureVector): number[] {
  return BEHAVIOR_FEATURE_KEYS.map((k) => f[k]);
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

function standardize(rows: BehaviorPlayerRow[]): {
  means: number[];
  stds: number[];
  xs: number[][];
  ys: number[];
} {
  const dim = BEHAVIOR_FEATURE_KEYS.length;
  const means = Array.from({ length: dim }, () => 0);
  const stds = Array.from({ length: dim }, () => 1);
  const raw = rows.map((r) => featureArray(r.features));
  const ys = rows.map((r) => r.targetPer100);
  const n = Math.max(1, rows.length);
  for (let j = 0; j < dim; j++) {
    let s = 0;
    for (const x of raw) s += x[j]!;
    means[j] = s / n;
  }
  for (let j = 0; j < dim; j++) {
    let s = 0;
    for (const x of raw) {
      const d = x[j]! - means[j]!;
      s += d * d;
    }
    stds[j] = Math.sqrt(s / n) || 1;
  }
  const xs = raw.map((x) => x.map((v, j) => (v - means[j]!) / stds[j]!));
  return { means, stds, xs, ys };
}

export function fitBehaviorRidge(
  rows: BehaviorPlayerRow[],
  options: { lambda?: number } = {}
): {
  intercept: number;
  coefficients: number[];
  featureMeans: number[];
  featureStds: number[];
} {
  const lambda = options.lambda ?? 40;
  const { means, stds, xs, ys } = standardize(rows);
  const p = BEHAVIOR_FEATURE_KEYS.length;
  const dim = p + 1; // intercept
  const xtx: number[][] = Array.from({ length: dim }, () =>
    Array.from({ length: dim }, () => 0)
  );
  const xty: number[] = Array.from({ length: dim }, () => 0);

  for (let i = 0; i < xs.length; i++) {
    const xi = [1, ...xs[i]!];
    const y = ys[i]!;
    for (let a = 0; a < dim; a++) {
      xty[a]! += xi[a]! * y;
      for (let b = 0; b < dim; b++) xtx[a]![b]! += xi[a]! * xi[b]!;
    }
  }
  for (let i = 1; i < dim; i++) xtx[i]![i]! += lambda;

  const beta = solveLinearSystem(xtx, xty);
  return {
    intercept: beta[0] ?? 0,
    coefficients: beta.slice(1),
    featureMeans: means,
    featureStds: stds,
  };
}

export function predictBehaviorPer100(
  features: BehaviorFeatureVector,
  model: Pick<
    BehaviorModelArtifact,
    "intercept" | "coefficients" | "featureMeans" | "featureStds"
  >
): number {
  const raw = featureArray(features);
  let y = model.intercept;
  for (let j = 0; j < raw.length; j++) {
    const z = (raw[j]! - model.featureMeans[j]!) / (model.featureStds[j] || 1);
    y += (model.coefficients[j] ?? 0) * z;
  }
  return y;
}

function evalMaeRmse(
  rows: BehaviorPlayerRow[],
  model: Pick<
    BehaviorModelArtifact,
    "intercept" | "coefficients" | "featureMeans" | "featureStds"
  >
): { n: number; mae: number; rmse: number } {
  if (rows.length === 0) return { n: 0, mae: 0, rmse: 0 };
  let abs = 0;
  let sq = 0;
  for (const row of rows) {
    const err = predictBehaviorPer100(row.features, model) - row.targetPer100;
    abs += Math.abs(err);
    sq += err * err;
  }
  const n = rows.length;
  return { n, mae: abs / n, rmse: Math.sqrt(sq / n) };
}

function chronologicalSplit(
  rows: BehaviorPlayerRow[],
  holdoutFrac: number
): { train: BehaviorPlayerRow[]; holdout: BehaviorPlayerRow[] } {
  const sorted = rows
    .slice()
    .sort(
      (a, b) =>
        a.asOfDate.localeCompare(b.asOfDate) ||
        a.playerId.localeCompare(b.playerId)
    );
  const cut = Math.floor(sorted.length * (1 - holdoutFrac));
  return { train: sorted.slice(0, cut), holdout: sorted.slice(cut) };
}

export function buildBehaviorProvenance(
  rows: BehaviorPlayerRow[],
  games: number
): BehaviorProvenance {
  const missing =
    rows.length === 0
      ? 1
      : rows.reduce((s, r) => s + r.missingXyRate, 0) / rows.length;
  return {
    version: "drbl-b-v1",
    sources: ["box", "play-by-play"],
    endpoint: "cdn+stats.nba.com",
    asOfTimestamp: new Date().toISOString(),
    postGameOnly: true,
    parserVersion: DRBL_PARSER_VERSION,
    coverage: {
      games,
      players: rows.length,
      missingXyRate: Math.round(missing * 1000) / 1000,
    },
    definitions: {
      gravityProxy:
        "DRBL Gravity Proxy — teammate 3PA share while player is on offense (not optical gravity)",
      rimRate: "Share of located FGA within ~8 ft of the rim",
      target: "Mean possession residual vs EPV, scaled per 100",
    },
  };
}

/**
 * Fit DRBL-B ridge and return per-player ratings (already on /100 scale).
 */
export function fitBehaviorModel(
  rows: BehaviorPlayerRow[],
  options: {
    lambda?: number;
    holdoutFrac?: number;
    games?: number;
  } = {}
): BehaviorModelArtifact & { ratingsPer100: Map<string, number> } {
  const holdoutFrac = options.holdoutFrac ?? 0.2;
  const { train, holdout } = chronologicalSplit(rows, holdoutFrac);
  const fitRows = train.length >= 30 ? train : rows;
  const fitted = fitBehaviorRidge(fitRows, { lambda: options.lambda });
  const modelBase = {
    intercept: fitted.intercept,
    coefficients: fitted.coefficients.map((c) => Math.round(c * 1e6) / 1e6),
    featureMeans: fitted.featureMeans,
    featureStds: fitted.featureStds,
  };
  const trainMetrics = evalMaeRmse(fitRows, modelBase);
  const holdoutMetrics =
    holdout.length > 0 ? evalMaeRmse(holdout, modelBase) : undefined;
  const provenance = buildBehaviorProvenance(rows, options.games ?? 0);

  const ratingsPer100 = new Map<string, number>();
  for (const row of rows) {
    ratingsPer100.set(
      row.playerId,
      Number(predictBehaviorPer100(row.features, modelBase).toFixed(2))
    );
  }

  return {
    version: "drbl-b-ridge-v1",
    fittedAt: new Date().toISOString(),
    lambda: options.lambda ?? 40,
    featureKeys: [...BEHAVIOR_FEATURE_KEYS],
    ...modelBase,
    intercept: Math.round(modelBase.intercept * 1e6) / 1e6,
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
    provenance,
    ratingsPer100,
  };
}

/** Diagnostic: SD of independent estimators (do not auto-penalize). */
export { estimatorDisagreement } from "./fusion";

