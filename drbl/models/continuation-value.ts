/**
 * M7-CV — Isolated continuation-value models (C0 / C1 / C2).
 *
 * Does NOT modify M6 (`shot-decision.ts`) or DRBL fusion.
 *
 * Estimand (C1/C2):
 *   V_cont(S) = E[ remaining possession points | S, A ≠ shoot ]
 *
 * Y may use post-state points; features must be timestamp-safe only.
 * Possession age is a shot-clock PROXY (CDN PBP has no shot clock).
 */

import type { DrblBoxScore, DrblEvent, DrblPossession } from "../types";
import { predictExpectedPoints } from "./expected-points";

export const M7_CV_VERSION = "drbl-m7-cv-continuation-v1";

export const C1_FEATURE_NAMES = [
  "bias",
  "offenseIsHome",
  "periodGe4",
  "clockLe4",
  "clockLe8",
  "clockLe24",
  "clockNorm",
  "absDiffGe10",
  "absDiffGe20",
  "trailingGe10",
  "leadingGe10",
] as const;

export const C2_FEATURE_NAMES = [
  ...C1_FEATURE_NAMES,
  "possessionAgeNorm", // /24 shot-clock PROXY — not true shot clock
  "ageGe8",
  "ageGe14",
  "ageGe20",
  "startedViaOreb",
  "startedViaSteal",
  "teamPriorPpp",
  "oppPriorPppAllowed",
] as const;

export type C1FeatureName = (typeof C1_FEATURE_NAMES)[number];
export type C2FeatureName = (typeof C2_FEATURE_NAMES)[number];

export type ContinueModelKind = "C0" | "C1" | "C2";

/** Timestamp-safe state for continuation; Y stored separately and never in features. */
export interface ContinueStateRow {
  gameId: string;
  gameDate: string;
  actionNumber: number;
  possessionId: string;
  period: number;
  clockSeconds: number;
  scoreDiff: number;
  offenseIsHome: boolean;
  possessionAgeSec: number;
  startedViaOreb: boolean;
  startedViaSteal: boolean;
  teamId: string;
  defenseTeamId: string;
  beforeFirstFg: boolean;
  actionType: string;
  /**
   * TARGET ONLY — remaining offense points from this event to possession end.
   * Must never enter feature vectors.
   */
  remainingPoints: number;
}

export interface TeamPppPrior {
  points: number;
  possessions: number;
  pointsAllowed: number;
  possessionsFaced: number;
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

export function fitRidge(
  rows: Array<{ x: number[]; y: number }>,
  p: number,
  lambda = 5
): number[] {
  if (rows.length === 0) {
    return Array.from({ length: p }, (_, i) => (i === 0 ? 1.0 : 0));
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

export function predictLinear(x: number[], coef: number[]): number {
  let y = 0;
  for (let i = 0; i < x.length; i++) y += (coef[i] ?? 0) * x[i]!;
  return clamp(y, 0, 3.5);
}

export function isFieldGoalAttempt(e: DrblEvent): boolean {
  return (
    (e.actionType === "2pt" || e.actionType === "3pt") &&
    (e.shotResult === "Made" || e.shotResult === "Missed")
  );
}

export function isBookkeepingEvent(e: DrblEvent): boolean {
  return (
    e.actionType === "period" ||
    e.actionType === "game" ||
    e.actionType === "timeout" ||
    e.actionType === "substitution" ||
    e.actionType === "instantreplay"
  );
}

/** Infer start flags from events on the possession strictly before `actionNumber`. */
export function possessionStartFlags(
  eventsBefore: DrblEvent[]
): { startedViaOreb: boolean; startedViaSteal: boolean } {
  let startedViaOreb = false;
  let startedViaSteal = false;
  for (const e of eventsBefore) {
    if (e.actionType === "rebound" && /off/i.test(e.subType || e.description)) {
      startedViaOreb = true;
    }
    if (
      e.actionType === "rebound" &&
      (e.qualifiers || []).some((q) => /off/i.test(q))
    ) {
      startedViaOreb = true;
    }
    if (e.actionType === "steal") startedViaSteal = true;
  }
  // Possession often begins with the OREB/steal itself as first event.
  if (eventsBefore.length > 0) {
    const first = eventsBefore[0]!;
    if (first.actionType === "rebound") {
      const off =
        /off/i.test(first.subType || "") ||
        /offens/i.test(first.description || "") ||
        (first.qualifiers || []).some((q) => /off/i.test(q));
      if (off) startedViaOreb = true;
    }
    if (first.actionType === "steal") startedViaSteal = true;
  }
  return { startedViaOreb, startedViaSteal };
}

/** Age grid (seconds) for pre-first-FGA continuation states — shot-clock PROXY. */
export const CONTINUE_AGE_GRID_SEC = [0, 4, 8, 12, 16, 20, 24] as const;

/**
 * Build continue-labeled rows for one game.
 *
 * Primary population (C1/C2): **age-grid states before first FGA**.
 * For each possession that is still live (no FGA yet) at age τ ∈ grid:
 *   features from last pre-τ event (timestamp-safe),
 *   Y = offense points from τ until possession end (TARGET ONLY).
 *
 * This avoids training mostly on turnover/foul terminal events (which made V_cont
 * collapse to a low flat mean at shot moments).
 *
 * Supplemental: non-bookkeeping, non-FGA, non-turnover events before first FGA
 * (still A ≠ shoot), for event-level diversity.
 */
export function buildContinueRowsForGame(
  box: DrblBoxScore,
  events: DrblEvent[],
  possessions: DrblPossession[]
): ContinueStateRow[] {
  const byAction = new Map(events.map((e) => [e.actionNumber, e]));
  const rows: ContinueStateRow[] = [];

  for (const p of possessions) {
    const actionNums = p.eventActionNumbers.slice().sort((a, b) => a - b);
    const possEvents: DrblEvent[] = [];
    for (const n of actionNums) {
      const e = byAction.get(n);
      if (e) possEvents.push(e);
    }
    if (possEvents.length === 0) continue;

    const offenseIsHome = p.offenseTeamId === box.homeTeamId;
    const startFlags = possessionStartFlags(possEvents.slice(0, 3));

    // First FGA age (seconds since possession start); Inf if none.
    let firstFgAge = Number.POSITIVE_INFINITY;
    let firstFgIdx = -1;
    for (let i = 0; i < possEvents.length; i++) {
      const e = possEvents[i]!;
      if (isFieldGoalAttempt(e)) {
        firstFgAge = Math.max(0, p.startClockSeconds - e.clockSeconds);
        firstFgIdx = i;
        break;
      }
    }

    // Possession duration to end (for grid upper bound).
    const last = possEvents[possEvents.length - 1]!;
    const endAge = Math.max(0, p.startClockSeconds - last.clockSeconds);

    // Points from each event index forward (inclusive).
    const remainingFromIdx: number[] = Array.from(
      { length: possEvents.length },
      () => 0
    );
    let rem = 0;
    for (let i = possEvents.length - 1; i >= 0; i--) {
      rem += possEvents[i]!.pointsOnAction || 0;
      remainingFromIdx[i] = rem;
    }

    const stateAtAge = (
      age: number
    ): {
      clockSeconds: number;
      scoreDiff: number;
      period: number;
      actionNumber: number;
      remainingPoints: number;
    } | null => {
      // Last event with age <= τ (clock >= start - τ), strictly before first FGA.
      const clockAt = p.startClockSeconds - age;
      let chosen = -1;
      for (let i = 0; i < possEvents.length; i++) {
        const e = possEvents[i]!;
        if (firstFgIdx >= 0 && i >= firstFgIdx) break;
        if (e.clockSeconds >= clockAt - 1e-6) chosen = i;
        else break;
      }
      // Age 0 / no events yet: use possession start from first event scores reversed.
      if (chosen < 0) {
        const e0 = possEvents[0]!;
        let scoreHome = e0.scoreHome;
        let scoreAway = e0.scoreAway;
        if (e0.pointsOnAction > 0 && e0.teamId) {
          if (e0.teamId === box.homeTeamId) scoreHome -= e0.pointsOnAction;
          else if (e0.teamId === box.awayTeamId) scoreAway -= e0.pointsOnAction;
        }
        const scoreDiff = offenseIsHome
          ? scoreHome - scoreAway
          : scoreAway - scoreHome;
        return {
          clockSeconds: p.startClockSeconds,
          scoreDiff,
          period: p.period,
          actionNumber: e0.actionNumber,
          remainingPoints: remainingFromIdx[0] ?? p.points,
        };
      }
      const e = possEvents[chosen]!;
      let scoreHome = e.scoreHome;
      let scoreAway = e.scoreAway;
      if (e.pointsOnAction > 0 && e.teamId) {
        if (e.teamId === box.homeTeamId) scoreHome -= e.pointsOnAction;
        else if (e.teamId === box.awayTeamId) scoreAway -= e.pointsOnAction;
      }
      const scoreDiff = offenseIsHome
        ? scoreHome - scoreAway
        : scoreAway - scoreHome;
      // Remaining from τ: points on/after first event with age >= τ.
      let remFrom = 0;
      for (let i = 0; i < possEvents.length; i++) {
        const ev = possEvents[i]!;
        const evAge = Math.max(0, p.startClockSeconds - ev.clockSeconds);
        if (evAge + 1e-6 >= age) {
          remFrom = remainingFromIdx[i] ?? 0;
          break;
        }
      }
      return {
        clockSeconds: Math.max(0, clockAt),
        scoreDiff,
        period: e.period,
        actionNumber: e.actionNumber,
        remainingPoints: remFrom,
      };
    };

    for (const age of CONTINUE_AGE_GRID_SEC) {
      // Only while still continuing (no FGA yet) at this age.
      if (age > firstFgAge + 1e-6) continue;
      if (age > endAge + 1e-6 && age > 0) continue;
      const st = stateAtAge(age);
      if (!st) continue;
      rows.push({
        gameId: box.gameId,
        gameDate: box.gameDate || "",
        actionNumber: st.actionNumber,
        possessionId: p.possessionId,
        period: st.period,
        clockSeconds: st.clockSeconds,
        scoreDiff: st.scoreDiff,
        offenseIsHome,
        possessionAgeSec: age,
        startedViaOreb: startFlags.startedViaOreb,
        startedViaSteal: startFlags.startedViaSteal,
        teamId: p.offenseTeamId,
        defenseTeamId: p.defenseTeamId,
        beforeFirstFg: true,
        actionType: `age_grid_${age}`,
        remainingPoints: st.remainingPoints,
      });
    }

    // Supplemental event-level continue rows (exclude FGAs, bookkeeping, turnovers).
    for (let i = 0; i < possEvents.length; i++) {
      if (firstFgIdx >= 0 && i >= firstFgIdx) break;
      const e = possEvents[i]!;
      if (isFieldGoalAttempt(e) || isBookkeepingEvent(e)) continue;
      if (e.actionType === "turnover") continue;
      const age = Math.max(0, p.startClockSeconds - e.clockSeconds);
      let scoreHome = e.scoreHome;
      let scoreAway = e.scoreAway;
      if (e.pointsOnAction > 0 && e.teamId) {
        if (e.teamId === box.homeTeamId) scoreHome -= e.pointsOnAction;
        else if (e.teamId === box.awayTeamId) scoreAway -= e.pointsOnAction;
      }
      const scoreDiff = offenseIsHome
        ? scoreHome - scoreAway
        : scoreAway - scoreHome;
      rows.push({
        gameId: box.gameId,
        gameDate: box.gameDate || "",
        actionNumber: e.actionNumber,
        possessionId: p.possessionId,
        period: e.period,
        clockSeconds: e.clockSeconds,
        scoreDiff,
        offenseIsHome,
        possessionAgeSec: age,
        startedViaOreb: startFlags.startedViaOreb,
        startedViaSteal: startFlags.startedViaSteal,
        teamId: p.offenseTeamId,
        defenseTeamId: p.defenseTeamId,
        beforeFirstFg: true,
        actionType: e.actionType,
        remainingPoints: remainingFromIdx[i] ?? 0,
      });
    }
  }
  return rows;
}

/** Assert helper: feature builders must never read remainingPoints. */
export function c1FeatureVector(row: ContinueStateRow): number[] {
  const periodLen = row.period <= 4 ? 720 : 300;
  const absDiff = Math.abs(row.scoreDiff);
  return [
    1,
    row.offenseIsHome ? 1 : 0,
    row.period >= 4 ? 1 : 0,
    row.clockSeconds <= 4 ? 1 : 0,
    row.clockSeconds <= 8 ? 1 : 0,
    row.clockSeconds <= 24 ? 1 : 0,
    periodLen > 0 ? row.clockSeconds / periodLen : 0,
    absDiff >= 10 ? 1 : 0,
    absDiff >= 20 ? 1 : 0,
    row.scoreDiff <= -10 ? 1 : 0,
    row.scoreDiff >= 10 ? 1 : 0,
  ];
}

export function c2FeatureVector(
  row: ContinueStateRow,
  teamPriors: Map<string, TeamPppPrior>,
  leaguePpp = 1.08
): number[] {
  const base = c1FeatureVector(row);
  const off = teamPriors.get(row.teamId);
  const def = teamPriors.get(row.defenseTeamId);
  const teamPpp =
    off && off.possessions >= 20
      ? off.points / off.possessions
      : leaguePpp;
  const oppAllow =
    def && def.possessionsFaced >= 20
      ? def.pointsAllowed / def.possessionsFaced
      : leaguePpp;
  const age = row.possessionAgeSec;
  return [
    ...base,
    clamp(age / 24, 0, 2),
    age >= 8 ? 1 : 0,
    age >= 14 ? 1 : 0,
    age >= 20 ? 1 : 0,
    row.startedViaOreb ? 1 : 0,
    row.startedViaSteal ? 1 : 0,
    clamp(teamPpp, 0.7, 1.4),
    clamp(oppAllow, 0.7, 1.4),
  ];
}

/** Leakage guard: ensure no Y field sneaks into X by name. */
export function assertFeaturesExcludeTarget(featureNames: readonly string[]): void {
  const banned = [
    "remainingPoints",
    "possessionPoints",
    "pointsOnAction",
    "made",
    "observedShotPoints",
    "shotMaking",
  ];
  for (const b of banned) {
    if (featureNames.includes(b)) {
      throw new Error(`Leakage: feature list includes banned target field ${b}`);
    }
  }
}

export function accumulateTeamPppFromPossessions(
  possessions: DrblPossession[],
  into: Map<string, TeamPppPrior>
): void {
  for (const p of possessions) {
    const off = into.get(p.offenseTeamId) ?? {
      points: 0,
      possessions: 0,
      pointsAllowed: 0,
      possessionsFaced: 0,
    };
    off.points += p.points;
    off.possessions += 1;
    into.set(p.offenseTeamId, off);

    const def = into.get(p.defenseTeamId) ?? {
      points: 0,
      possessions: 0,
      pointsAllowed: 0,
      possessionsFaced: 0,
    };
    def.pointsAllowed += p.points;
    def.possessionsFaced += 1;
    into.set(p.defenseTeamId, def);
  }
}

export function c0Predict(row: ContinueStateRow): number {
  return predictExpectedPoints({
    period: row.period,
    clockSeconds: row.clockSeconds,
    offenseIsHome: row.offenseIsHome,
    scoreDiff: row.scoreDiff,
  });
}

export interface ContinueMetrics {
  n: number;
  mae: number;
  rmse: number;
  corr: number;
  meanPred: number;
  meanActual: number;
  stdPred: number;
}

export function evaluateContinuePreds(
  y: number[],
  yhat: number[]
): ContinueMetrics {
  const n = y.length;
  if (n === 0) {
    return {
      n: 0,
      mae: 0,
      rmse: 0,
      corr: 0,
      meanPred: 0,
      meanActual: 0,
      stdPred: 0,
    };
  }
  let abs = 0;
  let sq = 0;
  let sumP = 0;
  let sumA = 0;
  for (let i = 0; i < n; i++) {
    const err = yhat[i]! - y[i]!;
    abs += Math.abs(err);
    sq += err * err;
    sumP += yhat[i]!;
    sumA += y[i]!;
  }
  const mx = sumA / n;
  const my = sumP / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = y[i]! - mx;
    const b = yhat[i]! - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const den = Math.sqrt(dx * dy);
  const varP = dy / n;
  return {
    n,
    mae: abs / n,
    rmse: Math.sqrt(sq / n),
    corr: den > 1e-12 ? num / den : 0,
    meanPred: my,
    meanActual: mx,
    stdPred: Math.sqrt(varP),
  };
}

export interface ContinueOofResult {
  c0: ContinueMetrics;
  c1: ContinueMetrics;
  c2: ContinueMetrics;
  c1Coef: number[];
  c2Coef: number[];
  holdoutPreds: Array<{
    remainingPoints: number;
    c0: number;
    c1: number;
    c2: number;
    possessionAgeSec: number;
    clockSeconds: number;
    beforeFirstFg: boolean;
    gameId: string;
    gameDate: string;
  }>;
  trainN: number;
  holdoutN: number;
  trainGames: number;
  holdoutGames: number;
}

/**
 * Chronological OOF: fit C1/C2 on train continue rows; score holdout.
 * C0 is M5 (no fit). Team PPP priors expand game-by-game (past only).
 */
export function chronologicalOofContinuation(
  gameRows: Array<{
    gameDate: string;
    gameId: string;
    continueRows: ContinueStateRow[];
    possessions: DrblPossession[];
  }>,
  options: { holdoutFrac?: number; lambda?: number } = {}
): ContinueOofResult {
  assertFeaturesExcludeTarget(C1_FEATURE_NAMES);
  assertFeaturesExcludeTarget(C2_FEATURE_NAMES);

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

  // Expanding priors while building train design.
  const trainPriors = new Map<string, TeamPppPrior>();
  const trainDesignC1: Array<{ x: number[]; y: number }> = [];
  const trainDesignC2: Array<{ x: number[]; y: number }> = [];
  let trainN = 0;
  for (const g of trainGames) {
    for (const row of g.continueRows) {
      trainDesignC1.push({ x: c1FeatureVector(row), y: row.remainingPoints });
      trainDesignC2.push({
        x: c2FeatureVector(row, trainPriors),
        y: row.remainingPoints,
      });
      trainN += 1;
    }
    accumulateTeamPppFromPossessions(g.possessions, trainPriors);
  }

  const c1Coef = fitRidge(trainDesignC1, C1_FEATURE_NAMES.length, lambda);
  const c2Coef = fitRidge(trainDesignC2, C2_FEATURE_NAMES.length, lambda);

  const livePriors = new Map(trainPriors);
  const holdoutPreds: ContinueOofResult["holdoutPreds"] = [];
  for (const g of holdoutGames) {
    for (const row of g.continueRows) {
      const c0 = c0Predict(row);
      const c1 = predictLinear(c1FeatureVector(row), c1Coef);
      const c2 = predictLinear(c2FeatureVector(row, livePriors), c2Coef);
      holdoutPreds.push({
        remainingPoints: row.remainingPoints,
        c0,
        c1,
        c2,
        possessionAgeSec: row.possessionAgeSec,
        clockSeconds: row.clockSeconds,
        beforeFirstFg: row.beforeFirstFg,
        gameId: row.gameId,
        gameDate: row.gameDate,
      });
    }
    accumulateTeamPppFromPossessions(g.possessions, livePriors);
  }

  const y = holdoutPreds.map((r) => r.remainingPoints);
  return {
    c0: evaluateContinuePreds(
      y,
      holdoutPreds.map((r) => r.c0)
    ),
    c1: evaluateContinuePreds(
      y,
      holdoutPreds.map((r) => r.c1)
    ),
    c2: evaluateContinuePreds(
      y,
      holdoutPreds.map((r) => r.c2)
    ),
    c1Coef,
    c2Coef,
    holdoutPreds,
    trainN,
    holdoutN: holdoutPreds.length,
    trainGames: trainGames.length,
    holdoutGames: holdoutGames.length,
  };
}

/**
 * Build a ContinueStateRow-shaped state at a shot decision for applying V_cont.
 * Does not include remaining points as a usable feature (set to NaN sentinel).
 */
export function continueStateAtShot(args: {
  gameId: string;
  gameDate: string;
  actionNumber: number;
  possessionId: string;
  period: number;
  clockSeconds: number;
  scoreDiff: number;
  offenseIsHome: boolean;
  possessionAgeSec: number;
  startedViaOreb: boolean;
  startedViaSteal: boolean;
  teamId: string;
  defenseTeamId: string;
}): ContinueStateRow {
  return {
    ...args,
    beforeFirstFg: true,
    actionType: "shot_decision_apply",
    remainingPoints: Number.NaN, // must not be read by feature builders
  };
}

export function predictVCont(
  row: ContinueStateRow,
  kind: ContinueModelKind,
  c1Coef: number[],
  c2Coef: number[],
  teamPriors: Map<string, TeamPppPrior>
): number {
  if (kind === "C0") return c0Predict(row);
  if (kind === "C1") return predictLinear(c1FeatureVector(row), c1Coef);
  return predictLinear(c2FeatureVector(row, teamPriors), c2Coef);
}
