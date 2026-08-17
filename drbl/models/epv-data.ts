/**
 * M5 helpers: load possession rows + chronological / multi-season OOF splits.
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import type { DrblBoxScore, DrblEvent, DrblPossession } from "../types";
import type { PossessionEpState } from "./expected-points";
import {
  evaluateEpv,
  fitRidgeCoefficients,
  type EpvCalibrationMetrics,
} from "./epv-model";
import { predictExpectedPointsHeuristic } from "./expected-points";

export interface EpvPossessionRow {
  season: string;
  gameId: string;
  gameDate: string;
  state: PossessionEpState;
  points: number;
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

export async function loadSeasonEpvRows(
  season: string
): Promise<EpvPossessionRow[]> {
  const root = path.join(
    process.cwd(),
    "data",
    "drbl",
    "normalized",
    season
  );
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const rows: EpvPossessionRow[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith("_")) continue;
    const gameDir = path.join(root, entry.name);
    try {
      const [possRaw, boxRaw, eventsRaw, reconcileRaw] = await Promise.all([
        readFile(path.join(gameDir, "possessions.json"), "utf8"),
        readFile(path.join(gameDir, "box.json"), "utf8"),
        readFile(path.join(gameDir, "events.json"), "utf8"),
        readFile(path.join(gameDir, "reconcile.json"), "utf8").catch(
          () => null
        ),
      ]);
      if (reconcileRaw) {
        const reconcile = JSON.parse(reconcileRaw) as {
          quarantined?: boolean;
        };
        if (reconcile.quarantined) continue;
      }
      const possessions = JSON.parse(possRaw) as DrblPossession[];
      const box = JSON.parse(boxRaw) as DrblBoxScore;
      const events = JSON.parse(eventsRaw) as DrblEvent[];
      for (const possession of possessions) {
        rows.push({
          season,
          gameId: possession.gameId,
          gameDate: box.gameDate || "",
          state: stateForPossession(possession, box, events),
          points: possession.points,
        });
      }
    } catch {
      // skip incomplete
    }
  }
  return rows;
}

export async function loadEpvRowsForSeasons(
  seasons: string[]
): Promise<EpvPossessionRow[]> {
  const chunks = await Promise.all(seasons.map((s) => loadSeasonEpvRows(s)));
  return chunks.flat();
}

/** Chronological game holdout within sorted game ids (by date then id). */
export function chronologicalGameSplit(
  rows: EpvPossessionRow[],
  holdoutFrac: number
): { train: EpvPossessionRow[]; holdout: EpvPossessionRow[] } {
  const games = [
    ...new Map(
      rows.map((r) => [r.gameId, r.gameDate] as const)
    ).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]));

  const cut = Math.floor(games.length * (1 - holdoutFrac));
  const holdoutGames = new Set(games.slice(cut).map(([id]) => id));
  return {
    train: rows.filter((r) => !holdoutGames.has(r.gameId)),
    holdout: rows.filter((r) => holdoutGames.has(r.gameId)),
  };
}

/**
 * Rolling-origin: train on earlier seasons, test on later season.
 * Within the test season, optionally keep only the first `testFrac` of games
 * as a pure forward window (rest unused).
 */
export function rollingOriginBySeason(
  rows: EpvPossessionRow[],
  trainSeasons: string[],
  testSeason: string
): { train: EpvPossessionRow[]; holdout: EpvPossessionRow[] } {
  const trainSet = new Set(trainSeasons);
  return {
    train: rows.filter((r) => trainSet.has(r.season)),
    holdout: rows.filter((r) => r.season === testSeason),
  };
}

export function evaluateHeuristic(
  rows: Array<{ state: import("./expected-points").PossessionEpState; points: number }>
): EpvCalibrationMetrics {
  if (rows.length === 0) {
    return { n: 0, mae: 0, rmse: 0, meanPredicted: 0, meanActual: 0 };
  }
  let abs = 0;
  let sq = 0;
  let predSum = 0;
  let actSum = 0;
  for (const row of rows) {
    const pred = predictExpectedPointsHeuristic(row.state);
    const err = pred - row.points;
    abs += Math.abs(err);
    sq += err * err;
    predSum += pred;
    actSum += row.points;
  }
  const n = rows.length;
  return {
    n,
    mae: abs / n,
    rmse: Math.sqrt(sq / n),
    meanPredicted: predSum / n,
    meanActual: actSum / n,
  };
}

export function fitAndCompare(
  train: EpvPossessionRow[],
  holdout: EpvPossessionRow[]
): {
  coefficients: number[];
  ridgeTrain: EpvCalibrationMetrics;
  ridgeHoldout: EpvCalibrationMetrics;
  heuristicHoldout: EpvCalibrationMetrics;
} {
  const coefficients = fitRidgeCoefficients(train);
  return {
    coefficients,
    ridgeTrain: evaluateEpv(train, coefficients),
    ridgeHoldout: evaluateEpv(holdout, coefficients),
    heuristicHoldout: evaluateHeuristic(holdout),
  };
}
