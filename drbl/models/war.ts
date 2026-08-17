/**
 * M13 — team-level WAR calibration.
 *
 * Fit points→wins from team aggregates of seasonal DRBL value vs observed
 * wins in the processed sample. Validate with chronological game holdout.
 *
 * If OOF validation fails, keep provisional 1/30 and set `calibrated: false`
 * (publish DRBL/100 + seasonal impact; do not claim validated WAR).
 */

import type { DrblBoxScore, DrblEvent, DrblPossession } from "../types";
import {
  attributeGamePlayerValue,
  PROVISIONAL_WIN_CONVERSION,
  type AttributeOptions,
} from "./player-value";

export interface TeamWarRow {
  teamId: string;
  games: number;
  wins: number;
  /** Sum of player possession-value attributed while on this team. */
  valueSum: number;
}

export interface WarCalibration {
  version: string;
  fittedAt: string;
  /** Wins per DRBL seasonal point (value→WAR multiplier). */
  pointsToWins: number;
  /** Through-origin slope used when intercept is dropped for WAR. */
  throughOriginSlope: number;
  intercept: number;
  provisionalPointsToWins: number;
  train: { n: number; mae: number; rmse: number; corr: number };
  holdout?: { n: number; mae: number; rmse: number; corr: number };
  /** True when holdout beats provisional conversion and slope is positive. */
  calibrated: boolean;
  reason: string;
}

export function teamValueForGame(
  box: DrblBoxScore,
  events: DrblEvent[],
  possessions: DrblPossession[],
  options: AttributeOptions = {}
): Map<string, number> {
  const tmp = new Map();
  attributeGamePlayerValue(box, events, possessions, tmp, options);
  const byTeam = new Map<string, number>();
  for (const row of tmp.values()) {
    byTeam.set(row.teamId, (byTeam.get(row.teamId) ?? 0) + row.totalValue);
  }
  return byTeam;
}

/**
 * Aggregate team wins and attributed value across processed games.
 */
export function buildTeamWarRows(
  games: Array<{
    box: DrblBoxScore;
    events: DrblEvent[];
    possessions: DrblPossession[];
  }>,
  options: AttributeOptions = {}
): TeamWarRow[] {
  const acc = new Map<
    string,
    { games: number; wins: number; valueSum: number }
  >();

  for (const g of games) {
    const values = teamValueForGame(g.box, g.events, g.possessions, options);
    const homeWon = g.box.homeScore > g.box.awayScore;
    const awayWon = g.box.awayScore > g.box.homeScore;

    const touch = (teamId: string, won: boolean) => {
      let row = acc.get(teamId);
      if (!row) {
        row = { games: 0, wins: 0, valueSum: 0 };
        acc.set(teamId, row);
      }
      row.games += 1;
      if (won) row.wins += 1;
      row.valueSum += values.get(teamId) ?? 0;
    };

    touch(g.box.homeTeamId, homeWon);
    touch(g.box.awayTeamId, awayWon);
  }

  return [...acc.entries()].map(([teamId, row]) => ({
    teamId,
    games: row.games,
    wins: row.wins,
    valueSum: row.valueSum,
  }));
}

function corr(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i]! - mx;
    const b = ys[i]! - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const den = Math.sqrt(dx * dy);
  return den > 1e-12 ? num / den : 0;
}

function maeRmse(
  rows: TeamWarRow[],
  predictWins: (r: TeamWarRow) => number
): { n: number; mae: number; rmse: number; corr: number } {
  if (rows.length === 0) return { n: 0, mae: 0, rmse: 0, corr: 0 };
  let abs = 0;
  let sq = 0;
  const preds: number[] = [];
  const actuals: number[] = [];
  for (const row of rows) {
    const yhat = predictWins(row);
    const err = yhat - row.wins;
    abs += Math.abs(err);
    sq += err * err;
    preds.push(yhat);
    actuals.push(row.wins);
  }
  const n = rows.length;
  return {
    n,
    mae: abs / n,
    rmse: Math.sqrt(sq / n),
    corr: corr(preds, actuals),
  };
}

/**
 * OLS: wins ~ intercept + slope * valueSum.
 * Also through-origin slope for WAR = value * β.
 */
export function fitWarRegression(rows: TeamWarRow[]): {
  intercept: number;
  slope: number;
  throughOriginSlope: number;
} {
  const n = rows.length;
  if (n === 0) {
    return {
      intercept: 0,
      slope: PROVISIONAL_WIN_CONVERSION,
      throughOriginSlope: PROVISIONAL_WIN_CONVERSION,
    };
  }

  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumXY = 0;
  let sumX0Y = 0; // for through-origin: β = Σxy / Σx²
  let sumX0X = 0;

  for (const row of rows) {
    const x = row.valueSum;
    const y = row.wins;
    sumX += x;
    sumY += y;
    sumXX += x * x;
    sumXY += x * y;
    sumX0Y += x * y;
    sumX0X += x * x;
  }

  const meanX = sumX / n;
  const meanY = sumY / n;
  const varX = sumXX - n * meanX * meanX;
  const covXY = sumXY - n * meanX * meanY;
  const slope = Math.abs(varX) > 1e-12 ? covXY / varX : 0;
  const intercept = meanY - slope * meanX;
  const throughOriginSlope =
    sumX0X > 1e-12 ? sumX0Y / sumX0X : PROVISIONAL_WIN_CONVERSION;

  return { intercept, slope, throughOriginSlope };
}

function chronologicalGameSplit<T extends { box: { gameDate: string } }>(
  games: T[],
  holdoutFrac: number
): { train: T[]; holdout: T[] } {
  const sorted = games
    .slice()
    .sort((a, b) => a.box.gameDate.localeCompare(b.box.gameDate));
  const cut = Math.floor(sorted.length * (1 - holdoutFrac));
  return { train: sorted.slice(0, cut), holdout: sorted.slice(cut) };
}

/**
 * Calibrate points→wins at team level with chronological holdout.
 */
export function calibrateWar(
  games: Array<{
    box: DrblBoxScore;
    events: DrblEvent[];
    possessions: DrblPossession[];
  }>,
  options: AttributeOptions & {
    holdoutFrac?: number;
    minTeams?: number;
    /** Post-M7: refuse calibrated:true below this game count (default 200). */
    minGamesForCalibration?: number;
  } = {}
): WarCalibration {
  const holdoutFrac = options.holdoutFrac ?? 0.25;
  const minTeams = options.minTeams ?? 8;
  const attrOpts: AttributeOptions = {
    replacementPool: options.replacementPool,
    rolesByPlayer: options.rolesByPlayer,
  };

  const allRows = buildTeamWarRows(games, attrOpts);
  const { train: trainGames, holdout: holdoutGames } = chronologicalGameSplit(
    games,
    holdoutFrac
  );
  const trainRows = buildTeamWarRows(trainGames, attrOpts);
  const holdoutRows =
    holdoutGames.length > 0
      ? buildTeamWarRows(holdoutGames, attrOpts)
      : [];

  const fitRows = trainRows.length >= minTeams ? trainRows : allRows;
  const fitted = fitWarRegression(fitRows);

  const trainMetrics = maeRmse(
    fitRows,
    (r) => r.games * 0.5 + fitted.throughOriginSlope * r.valueSum
  );
  const holdoutMetrics =
    holdoutRows.length >= 4
      ? maeRmse(
          holdoutRows,
          (r) => r.games * 0.5 + fitted.throughOriginSlope * r.valueSum
        )
      : undefined;

  const provisionalHoldout =
    holdoutRows.length >= 4
      ? maeRmse(
          holdoutRows,
          (r) => r.games * 0.5 + r.valueSum * PROVISIONAL_WIN_CONVERSION
        )
      : undefined;

  // Prefer through-origin slope for player WAR (replacement-centered).
  let pointsToWins = fitted.throughOriginSlope;
  if (!Number.isFinite(pointsToWins) || pointsToWins <= 0) {
    pointsToWins = PROVISIONAL_WIN_CONVERSION;
  }
  // Sanity clamp: ~10–80 points per win historically; allow wide band.
  const clampedSlope = Math.max(1 / 80, Math.min(1 / 8, pointsToWins));
  pointsToWins = clampedSlope;

  let calibrated = false;
  let reason = "insufficient holdout";

  // Post-M7: stricter gate — small samples must not claim calibrated:true
  // (M15: 50g unstable; 400g can fail MAE rule). Require adequate games +
  // holdout teams and beat provisional 1/30 on MAE with positive corr.
  const minGamesForCalibration = options.minGamesForCalibration ?? 200;
  const gamesSeen = trainGames.length + holdoutGames.length;

  if (holdoutMetrics && provisionalHoldout) {
    const beatsProvisional =
      holdoutMetrics.mae <= provisionalHoldout.mae * 1.0;
    const positiveSignal =
      fitted.throughOriginSlope > 0 && holdoutMetrics.corr >= 0.35;
    const enoughSample =
      gamesSeen >= minGamesForCalibration && holdoutRows.length >= 6;
    calibrated = beatsProvisional && positiveSignal && enoughSample;
    reason = calibrated
      ? "holdout MAE ≤ provisional, corr≥0.35, and adequate sample"
      : !enoughSample
        ? `insufficient sample for calibration claim (games=${gamesSeen}, holdoutTeams=${holdoutRows.length}) — provisional 1/30`
        : !positiveSignal
          ? "weak/negative holdout signal — keeping provisional conversion"
          : "holdout MAE worse than provisional — keeping provisional conversion";
    if (!calibrated) {
      pointsToWins = PROVISIONAL_WIN_CONVERSION;
    } else {
      pointsToWins = clampedSlope;
    }
  } else if (fitRows.length >= minTeams && fitted.throughOriginSlope > 0) {
    calibrated = false;
    reason = "no holdout — provisional conversion retained";
    pointsToWins = PROVISIONAL_WIN_CONVERSION;
  }

  const round3 = (x: number) => Math.round(x * 1000) / 1000;

  return {
    version: "drbl-war-v1",
    fittedAt: new Date().toISOString(),
    pointsToWins: Math.round(pointsToWins * 1e6) / 1e6,
    throughOriginSlope: Math.round(fitted.throughOriginSlope * 1e6) / 1e6,
    intercept: Math.round(fitted.intercept * 1e6) / 1e6,
    provisionalPointsToWins: PROVISIONAL_WIN_CONVERSION,
    train: {
      n: trainMetrics.n,
      mae: round3(trainMetrics.mae),
      rmse: round3(trainMetrics.rmse),
      corr: round3(trainMetrics.corr),
    },
    holdout: holdoutMetrics
      ? {
          n: holdoutMetrics.n,
          mae: round3(holdoutMetrics.mae),
          rmse: round3(holdoutMetrics.rmse),
          corr: round3(holdoutMetrics.corr),
        }
      : undefined,
    calibrated,
    reason,
  };
}

export function seasonalValueToWar(
  seasonalValue: number,
  pointsToWins: number
): number {
  return seasonalValue * pointsToWins;
}
