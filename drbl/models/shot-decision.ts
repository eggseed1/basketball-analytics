/**
 * M6 — Shot decision / continuation (standalone; NOT wired into DRBL fusion).
 *
 * Equations (decision timestamp t, pre-outcome):
 *
 *   ÊPV_shoot(S_t)     = P̂(make | S_t) · pointValue
 *   ÊPV_continue(S_t)  = EPV̂_possession(S_t)   // M5-style state EPV
 *   SDV(S_t)           = ÊPV_shoot(S_t) − ÊPV_continue(S_t)
 *   ShotMaking         = observedShotPoints − ÊPV_shoot(S_t)
 *
 * P̂(make) is fit with chronological OOF ridge (linear probability, clamped).
 * Continuation uses only pre-shot possession state (no same-possession outcome).
 *
 * A make can have negative SDV; a miss can have positive SDV.
 */

import type { DrblBoxScore, DrblEvent, DrblPossession } from "../types";
import {
  predictExpectedPoints,
  type PossessionEpState,
} from "./expected-points";
import { shotDistanceFeet } from "./behavior";

export const M6_VERSION = "drbl-m6-shot-decision-v1";

export const MAKE_FEATURE_NAMES = [
  "bias",
  "isThree",
  "distanceNorm",
  "hasDistance",
  "rim",
  "mid",
  "longTwo",
  "cornerThreeProxy",
  "offenseIsHome",
  "periodGe4",
  "clockLe8",
  "clockLe4",
  "absDiffGe10",
  "playerPriorMake",
  "playerPriorLogAttempts",
  "teamPriorMake",
  "oppPriorAllow",
  "lineupOffensePriorMake",
  "lineupDefensePriorAllow",
] as const;

export type MakeFeatureName = (typeof MAKE_FEATURE_NAMES)[number];

export interface ShotDecisionRow {
  gameId: string;
  gameDate: string;
  actionNumber: number;
  possessionId: string;
  playerId: string;
  playerName: string;
  teamId: string;
  defenseTeamId: string;
  /** On-court offense ids at possession start (timestamp-safe). */
  offensePlayerIds: string[];
  /** On-court defense ids at possession start (timestamp-safe). */
  defensePlayerIds: string[];
  period: number;
  clockSeconds: number;
  scoreDiff: number;
  offenseIsHome: boolean;
  isThree: boolean;
  distanceFeet: number | null;
  pointValue: 2 | 3;
  made: 0 | 1;
  observedShotPoints: number;
  /** Possession points (includes this shot) — analysis / leakage checks only. */
  possessionPoints: number;
  /** Next possession points for the same team if available. */
  nextOffensePossessionPoints: number | null;
}

export interface ShotDecisionPrediction {
  pMake: number;
  epvShoot: number;
  epvContinue: number;
  sdv: number;
  shotMaking: number;
  /** Simple baseline: bucket empirical make% · pointValue */
  baselineEpvShoot: number;
  baselineSdv: number;
}

export interface MakeModelArtifact {
  version: string;
  fittedAt: string;
  lambda: number;
  featureNames: MakeFeatureName[];
  coefficients: number[];
  train: { n: number; mae: number; rmse: number; logLoss: number };
  holdout?: { n: number; mae: number; rmse: number; logLoss: number };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
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

/** Pre-decision possession state (score reversed if event already includes make). */
export function decisionStateFromEvent(
  event: DrblEvent,
  box: DrblBoxScore
): PossessionEpState {
  let scoreHome = event.scoreHome;
  let scoreAway = event.scoreAway;
  if (event.shotResult === "Made" && event.pointsOnAction > 0 && event.teamId) {
    if (event.teamId === box.homeTeamId) scoreHome -= event.pointsOnAction;
    else if (event.teamId === box.awayTeamId) scoreAway -= event.pointsOnAction;
  }
  const offenseIsHome = event.teamId === box.homeTeamId;
  const scoreDiff = offenseIsHome
    ? scoreHome - scoreAway
    : scoreAway - scoreHome;
  return {
    period: event.period,
    clockSeconds: event.clockSeconds,
    offenseIsHome,
    scoreDiff,
  };
}

export interface MakeFeatureContext {
  playerPriorMake: number;
  playerPriorAttempts: number;
  teamPriorMake: number;
  oppPriorAllow: number;
  lineupOffensePriorMake: number;
  lineupDefensePriorAllow: number;
}

export function makeFeatureVector(
  row: ShotDecisionRow,
  ctx: MakeFeatureContext
): number[] {
  const dist = row.distanceFeet;
  const hasDistance = dist != null ? 1 : 0;
  const d = dist ?? (row.isThree ? 25 : 12);
  const distanceNorm = clamp(d / 30, 0, 1.5);
  return [
    1,
    row.isThree ? 1 : 0,
    distanceNorm,
    hasDistance,
    !row.isThree && d <= 8 ? 1 : 0,
    !row.isThree && d > 8 && d <= 16 ? 1 : 0,
    !row.isThree && d > 16 ? 1 : 0,
    row.isThree && d <= 24 ? 1 : 0,
    row.offenseIsHome ? 1 : 0,
    row.period >= 4 ? 1 : 0,
    row.clockSeconds <= 8 ? 1 : 0,
    row.clockSeconds <= 4 ? 1 : 0,
    Math.abs(row.scoreDiff) >= 10 ? 1 : 0,
    clamp(ctx.playerPriorMake, 0, 1),
    Math.log1p(Math.max(0, ctx.playerPriorAttempts)),
    clamp(ctx.teamPriorMake, 0, 1),
    clamp(ctx.oppPriorAllow, 0, 1),
    clamp(ctx.lineupOffensePriorMake, 0, 1),
    clamp(ctx.lineupDefensePriorAllow, 0, 1),
  ];
}

export function fitMakeRidge(
  rows: Array<{ x: number[]; y: number }>,
  lambda = 5
): number[] {
  const p = MAKE_FEATURE_NAMES.length;
  if (rows.length === 0) {
    return Array.from({ length: p }, (_, i) => (i === 0 ? 0.45 : 0));
  }
  const xtx: number[][] = Array.from({ length: p }, () =>
    Array.from({ length: p }, () => 0)
  );
  const xty: number[] = Array.from({ length: p }, () => 0);
  for (const row of rows) {
    for (let i = 0; i < p; i++) {
      xty[i]! += row.x[i]! * row.y;
      for (let j = 0; j < p; j++) xtx[i]![j]! += row.x[i]! * row.x[j]!;
    }
  }
  for (let i = 0; i < p; i++) xtx[i]![i]! += lambda;
  return solveLinearSystem(xtx, xty);
}

export function predictMakeProb(
  x: number[],
  coefficients: number[]
): number {
  let y = 0;
  for (let i = 0; i < x.length; i++) y += (coefficients[i] ?? 0) * x[i]!;
  return clamp(y, 0.05, 0.95);
}

export function epvShoot(pMake: number, pointValue: 2 | 3): number {
  return pMake * pointValue;
}

/** Continuation = M5 possession EPV at pre-shot state (no shot outcome). */
export function epvContinue(state: PossessionEpState): number {
  return predictExpectedPoints(state);
}

export function shotDecisionValue(
  epvShootVal: number,
  epvContinueVal: number
): number {
  return epvShootVal - epvContinueVal;
}

export function shotMakingResidual(
  observedShotPoints: number,
  epvShootVal: number
): number {
  return observedShotPoints - epvShootVal;
}

export type DistanceBucket =
  | "rim"
  | "mid"
  | "long2"
  | "three"
  | "unknown2"
  | "unknown3";

export function distanceBucket(row: ShotDecisionRow): DistanceBucket {
  if (row.isThree) return row.distanceFeet == null ? "unknown3" : "three";
  if (row.distanceFeet == null) return "unknown2";
  if (row.distanceFeet <= 8) return "rim";
  if (row.distanceFeet <= 16) return "mid";
  return "long2";
}

/** Empirical make rates by bucket (training fold only). */
export function fitBucketBaseline(
  rows: ShotDecisionRow[]
): Map<DistanceBucket, number> {
  const stats = new Map<DistanceBucket, { makes: number; n: number }>();
  for (const row of rows) {
    const b = distanceBucket(row);
    const s = stats.get(b) ?? { makes: 0, n: 0 };
    s.n += 1;
    s.makes += row.made;
    stats.set(b, s);
  }
  const out = new Map<DistanceBucket, number>();
  for (const [b, s] of stats) {
    out.set(b, s.n > 0 ? s.makes / s.n : rowIsThreeDefault(b));
  }
  return out;
}

function rowIsThreeDefault(b: DistanceBucket): number {
  return b === "three" || b === "unknown3" ? 0.36 : 0.47;
}

export function baselineMakeProb(
  row: ShotDecisionRow,
  buckets: Map<DistanceBucket, number>
): number {
  const b = distanceBucket(row);
  return buckets.get(b) ?? rowIsThreeDefault(b);
}

export interface PlayerPrior {
  makes: number;
  attempts: number;
}

export interface TeamPrior {
  makes: number;
  attempts: number;
  /** Makes allowed when this team is on defense. */
  oppMakes: number;
  oppAttempts: number;
}

/** Update priors after a game (call only after processing that game). */
export function accumulatePlayerPriors(
  rows: ShotDecisionRow[],
  into: Map<string, PlayerPrior>
): void {
  for (const row of rows) {
    const p = into.get(row.playerId) ?? { makes: 0, attempts: 0 };
    p.attempts += 1;
    p.makes += row.made;
    into.set(row.playerId, p);
  }
}

export function accumulateTeamPriors(
  rows: ShotDecisionRow[],
  into: Map<string, TeamPrior>
): void {
  for (const row of rows) {
    const off = into.get(row.teamId) ?? {
      makes: 0,
      attempts: 0,
      oppMakes: 0,
      oppAttempts: 0,
    };
    off.attempts += 1;
    off.makes += row.made;
    into.set(row.teamId, off);

    const def = into.get(row.defenseTeamId) ?? {
      makes: 0,
      attempts: 0,
      oppMakes: 0,
      oppAttempts: 0,
    };
    def.oppAttempts += 1;
    def.oppMakes += row.made;
    into.set(row.defenseTeamId, def);
  }
}

export function priorMakeRate(
  priors: Map<string, PlayerPrior>,
  playerId: string,
  leaguePrior = 0.45
): { make: number; attempts: number } {
  const p = priors.get(playerId);
  if (!p || p.attempts < 5) {
    return { make: leaguePrior, attempts: p?.attempts ?? 0 };
  }
  // Light shrink toward league for small samples (prior games only).
  const w = p.attempts / (p.attempts + 20);
  return {
    make: w * (p.makes / p.attempts) + (1 - w) * leaguePrior,
    attempts: p.attempts,
  };
}

function shrinkRate(
  makes: number,
  attempts: number,
  leaguePrior: number,
  minAttempts = 20
): number {
  if (attempts < minAttempts) return leaguePrior;
  const w = attempts / (attempts + 40);
  return w * (makes / attempts) + (1 - w) * leaguePrior;
}

function meanPriorMake(
  priors: Map<string, PlayerPrior>,
  playerIds: string[],
  excludePlayerId: string | null,
  leaguePrior: number
): number {
  const rates: number[] = [];
  for (const id of playerIds) {
    if (excludePlayerId && id === excludePlayerId) continue;
    rates.push(priorMakeRate(priors, id, leaguePrior).make);
  }
  if (rates.length === 0) return leaguePrior;
  return rates.reduce((a, b) => a + b, 0) / rates.length;
}

/** Timestamp-safe feature context from expanding priors only. */
export function featureContextFromPriors(
  row: ShotDecisionRow,
  playerPriors: Map<string, PlayerPrior>,
  teamPriors: Map<string, TeamPrior>,
  leaguePrior = 0.45
): MakeFeatureContext {
  const player = priorMakeRate(playerPriors, row.playerId, leaguePrior);
  const team = teamPriors.get(row.teamId);
  const opp = teamPriors.get(row.defenseTeamId);
  return {
    playerPriorMake: player.make,
    playerPriorAttempts: player.attempts,
    teamPriorMake: shrinkRate(
      team?.makes ?? 0,
      team?.attempts ?? 0,
      leaguePrior
    ),
    oppPriorAllow: shrinkRate(
      opp?.oppMakes ?? 0,
      opp?.oppAttempts ?? 0,
      leaguePrior
    ),
    lineupOffensePriorMake: meanPriorMake(
      playerPriors,
      row.offensePlayerIds,
      row.playerId,
      leaguePrior
    ),
    lineupDefensePriorAllow: meanPriorMake(
      playerPriors,
      row.defensePlayerIds,
      null,
      leaguePrior
    ),
  };
}

export function predictShotDecision(
  row: ShotDecisionRow,
  coefficients: number[],
  playerPriors: Map<string, PlayerPrior>,
  teamPriors: Map<string, TeamPrior>,
  baselineBuckets: Map<DistanceBucket, number>
): ShotDecisionPrediction {
  const ctx = featureContextFromPriors(row, playerPriors, teamPriors);
  const x = makeFeatureVector(row, ctx);
  const pMake = predictMakeProb(x, coefficients);
  const shoot = epvShoot(pMake, row.pointValue);
  const state = {
    period: row.period,
    clockSeconds: row.clockSeconds,
    offenseIsHome: row.offenseIsHome,
    scoreDiff: row.scoreDiff,
  };
  const cont = epvContinue(state);
  const baseP = baselineMakeProb(row, baselineBuckets);
  const baseShoot = epvShoot(baseP, row.pointValue);
  return {
    pMake,
    epvShoot: shoot,
    epvContinue: cont,
    sdv: shotDecisionValue(shoot, cont),
    shotMaking: shotMakingResidual(row.observedShotPoints, shoot),
    baselineEpvShoot: baseShoot,
    baselineSdv: shotDecisionValue(baseShoot, cont),
  };
}

export function metricsBinary(
  ys: number[],
  phats: number[]
): { n: number; mae: number; rmse: number; logLoss: number; brier: number } {
  const n = ys.length;
  if (n === 0) return { n: 0, mae: 0, rmse: 0, logLoss: 0, brier: 0 };
  let abs = 0;
  let sq = 0;
  let ll = 0;
  let brier = 0;
  for (let i = 0; i < n; i++) {
    const y = ys[i]!;
    const p = clamp(phats[i]!, 1e-6, 1 - 1e-6);
    abs += Math.abs(p - y);
    sq += (p - y) ** 2;
    brier += (p - y) ** 2;
    ll += -(y * Math.log(p) + (1 - y) * Math.log(1 - p));
  }
  return {
    n,
    mae: abs / n,
    rmse: Math.sqrt(sq / n),
    logLoss: ll / n,
    brier: brier / n,
  };
}

export function metricsContinuous(
  ys: number[],
  yhats: number[]
): { n: number; mae: number; rmse: number; corr: number } {
  const n = ys.length;
  if (n === 0) return { n: 0, mae: 0, rmse: 0, corr: 0 };
  let abs = 0;
  let sq = 0;
  const mx = ys.reduce((a, b) => a + b, 0) / n;
  const my = yhats.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const err = yhats[i]! - ys[i]!;
    abs += Math.abs(err);
    sq += err * err;
    const a = ys[i]! - mx;
    const b = yhats[i]! - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const den = Math.sqrt(dx * dy);
  return {
    n,
    mae: abs / n,
    rmse: Math.sqrt(sq / n),
    corr: den > 1e-12 ? num / den : 0,
  };
}

/**
 * Extract FG decision rows from one processed game.
 * Uses event clock/score; reverses made-shot score for pre-decision state.
 */
export function buildShotRowsForGame(
  box: DrblBoxScore,
  events: DrblEvent[],
  possessions: DrblPossession[]
): ShotDecisionRow[] {
  const rows: ShotDecisionRow[] = [];

  // Map possession by containing action numbers.
  const possByAction = new Map<number, DrblPossession>();
  for (const p of possessions) {
    for (const n of p.eventActionNumbers) possByAction.set(n, p);
  }

  // Ordered possessions for "next offense possession" lookup.
  const ordered = possessions.slice().sort((a, b) => {
    if (a.period !== b.period) return a.period - b.period;
    return b.startClockSeconds - a.startClockSeconds;
  });

  for (const event of events) {
    if (event.actionType !== "2pt" && event.actionType !== "3pt") continue;
    if (!event.playerId || !event.teamId) continue;
    if (event.shotResult !== "Made" && event.shotResult !== "Missed") continue;

    const possession = possByAction.get(event.actionNumber);
    if (!possession) continue;

    const state = decisionStateFromEvent(event, box);
    const isThree = event.actionType === "3pt";
    const pointValue: 2 | 3 = isThree ? 3 : 2;
    const made: 0 | 1 = event.shotResult === "Made" ? 1 : 0;
    const dist = shotDistanceFeet(event.x, event.y);

    // Next possession for same offense team (future relative to this shot).
    let nextOffensePossessionPoints: number | null = null;
    const idx = ordered.findIndex((p) => p.possessionId === possession.possessionId);
    if (idx >= 0) {
      for (let j = idx + 1; j < ordered.length; j++) {
        const nxt = ordered[j]!;
        if (nxt.offenseTeamId === possession.offenseTeamId) {
          nextOffensePossessionPoints = nxt.points;
          break;
        }
      }
    }

    rows.push({
      gameId: box.gameId,
      gameDate: box.gameDate || "",
      actionNumber: event.actionNumber,
      possessionId: possession.possessionId,
      playerId: event.playerId,
      playerName: event.playerName || event.playerId,
      teamId: event.teamId,
      defenseTeamId: possession.defenseTeamId,
      offensePlayerIds: possession.offensePlayerIds.filter(Boolean),
      defensePlayerIds: possession.defensePlayerIds.filter(Boolean),
      period: state.period,
      clockSeconds: state.clockSeconds,
      scoreDiff: state.scoreDiff,
      offenseIsHome: state.offenseIsHome,
      isThree,
      distanceFeet: dist,
      pointValue,
      made,
      observedShotPoints: made ? pointValue : 0,
      possessionPoints: possession.points,
      nextOffensePossessionPoints,
    });
  }

  return rows;
}

/**
 * Chronological OOF: sort games by date, expand priors only from past games,
 * fit make model on train games, predict holdout.
 */
export function chronologicalOofShotDecision(
  gameRows: Array<{ gameDate: string; gameId: string; rows: ShotDecisionRow[] }>,
  options: { holdoutFrac?: number; lambda?: number } = {}
): {
  artifact: MakeModelArtifact;
  baselineBuckets: Map<DistanceBucket, number>;
  oof: Array<ShotDecisionRow & ShotDecisionPrediction & { fold: "train" | "holdout" }>;
  holdoutMake: ReturnType<typeof metricsBinary>;
  holdoutBaselineMake: ReturnType<typeof metricsBinary>;
  holdoutSdvVsNextPoss: ReturnType<typeof metricsContinuous>;
  holdoutShotMakingCal: ReturnType<typeof metricsContinuous>;
} {
  const holdoutFrac = options.holdoutFrac ?? 0.2;
  const lambda = options.lambda ?? 5;
  const sorted = gameRows
    .slice()
    .sort(
      (a, b) =>
        a.gameDate.localeCompare(b.gameDate) || a.gameId.localeCompare(b.gameId)
    );
  const cut = Math.max(1, Math.floor(sorted.length * (1 - holdoutFrac)));
  const trainGames = sorted.slice(0, cut);
  const holdoutGames = sorted.slice(cut);

  const trainRows = trainGames.flatMap((g) => g.rows);
  const baselineBuckets = fitBucketBaseline(trainRows);

  // Expanding priors within train: design matrix uses only past games.
  const trainPlayerPriors = new Map<string, PlayerPrior>();
  const trainTeamPriors = new Map<string, TeamPrior>();
  const trainDesign: Array<{ x: number[]; y: number }> = [];
  for (const g of trainGames) {
    for (const row of g.rows) {
      const ctx = featureContextFromPriors(
        row,
        trainPlayerPriors,
        trainTeamPriors
      );
      trainDesign.push({ x: makeFeatureVector(row, ctx), y: row.made });
    }
    accumulatePlayerPriors(g.rows, trainPlayerPriors);
    accumulateTeamPriors(g.rows, trainTeamPriors);
  }
  const coefficients = fitMakeRidge(trainDesign, lambda);

  const trainMetrics = metricsBinary(
    trainDesign.map((r) => r.y),
    trainDesign.map((r) => predictMakeProb(r.x, coefficients))
  );

  const oof: Array<
    ShotDecisionRow & ShotDecisionPrediction & { fold: "train" | "holdout" }
  > = [];

  // Re-score train with same expanding priors for reporting.
  const scorePlayerPriors = new Map<string, PlayerPrior>();
  const scoreTeamPriors = new Map<string, TeamPrior>();
  for (const g of trainGames) {
    for (const row of g.rows) {
      const pred = predictShotDecision(
        row,
        coefficients,
        scorePlayerPriors,
        scoreTeamPriors,
        baselineBuckets
      );
      oof.push({ ...row, ...pred, fold: "train" });
    }
    accumulatePlayerPriors(g.rows, scorePlayerPriors);
    accumulateTeamPriors(g.rows, scoreTeamPriors);
  }

  // Holdout: continue expanding priors (train + earlier holdout only).
  for (const g of holdoutGames) {
    for (const row of g.rows) {
      const pred = predictShotDecision(
        row,
        coefficients,
        scorePlayerPriors,
        scoreTeamPriors,
        baselineBuckets
      );
      oof.push({ ...row, ...pred, fold: "holdout" });
    }
    accumulatePlayerPriors(g.rows, scorePlayerPriors);
    accumulateTeamPriors(g.rows, scoreTeamPriors);
  }

  const holdoutPreds = oof.filter((r) => r.fold === "holdout");
  const holdoutMake = metricsBinary(
    holdoutPreds.map((r) => r.made),
    holdoutPreds.map((r) => r.pMake)
  );
  const holdoutBaselineMake = metricsBinary(
    holdoutPreds.map((r) => r.made),
    holdoutPreds.map((r) => baselineMakeProb(r, baselineBuckets))
  );

  const withNext = holdoutPreds.filter(
    (r) => r.nextOffensePossessionPoints != null
  );
  const holdoutSdvVsNextPoss = metricsContinuous(
    withNext.map((r) => r.nextOffensePossessionPoints as number),
    withNext.map((r) => r.sdv)
  );

  // Shot-making calibration: observed shot points vs epvShoot
  const holdoutShotMakingCal = metricsContinuous(
    holdoutPreds.map((r) => r.observedShotPoints),
    holdoutPreds.map((r) => r.epvShoot)
  );

  const artifact: MakeModelArtifact = {
    version: M6_VERSION,
    fittedAt: new Date().toISOString(),
    lambda,
    featureNames: [...MAKE_FEATURE_NAMES],
    coefficients: coefficients.map((c) => Math.round(c * 1e6) / 1e6),
    train: {
      n: trainMetrics.n,
      mae: Math.round(trainMetrics.mae * 1000) / 1000,
      rmse: Math.round(trainMetrics.rmse * 1000) / 1000,
      logLoss: Math.round(trainMetrics.logLoss * 1000) / 1000,
    },
    holdout: {
      n: holdoutMake.n,
      mae: Math.round(holdoutMake.mae * 1000) / 1000,
      rmse: Math.round(holdoutMake.rmse * 1000) / 1000,
      logLoss: Math.round(holdoutMake.logLoss * 1000) / 1000,
    },
  };

  return {
    artifact,
    baselineBuckets,
    oof,
    holdoutMake,
    holdoutBaselineMake,
    holdoutSdvVsNextPoss,
    holdoutShotMakingCal,
  };
}
