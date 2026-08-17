/**
 * Fit M5 EPV coefficients with chronological / multi-season OOF.
 *
 *   npm run drbl:epv -- --season 2024-25
 *   npm run drbl:epv -- --seasons 2024-25,2025-26 --mode rolling
 *   npm run drbl:epv -- --season 2024-25 --holdout-frac 0.2
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { EPV_FEATURE_NAMES } from "../drbl/models/epv-model";
import {
  chronologicalGameSplit,
  fitAndCompare,
  loadEpvRowsForSeasons,
  rollingOriginBySeason,
} from "../drbl/models/epv-data";
import type { EpvModelArtifact } from "../drbl/models/expected-points";
import type { EpvCalibrationMetrics } from "../drbl/models/epv-model";

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function roundMetrics(m: EpvCalibrationMetrics): EpvCalibrationMetrics {
  return {
    n: m.n,
    mae: Math.round(m.mae * 1000) / 1000,
    rmse: Math.round(m.rmse * 1000) / 1000,
    meanPredicted: Math.round(m.meanPredicted * 1000) / 1000,
    meanActual: Math.round(m.meanActual * 1000) / 1000,
  };
}

async function main() {
  const seasonsArg = arg("seasons");
  const season = arg("season") ?? "2024-25";
  const seasons = seasonsArg
    ? seasonsArg.split(",").map((s) => s.trim()).filter(Boolean)
    : [season];
  const mode = arg("mode") ?? (seasons.length > 1 ? "rolling" : "chrono");
  const holdoutFrac = arg("holdout-frac")
    ? Number(arg("holdout-frac"))
    : 0.2;

  console.log(`Loading possessions for ${seasons.join(", ")} (mode=${mode})…`);
  const rows = await loadEpvRowsForSeasons(seasons);
  if (rows.length < 50) {
    throw new Error(
      `Need normalized possessions under data/drbl/normalized/{season} (found ${rows.length}). Run drbl:phase-a first.`
    );
  }

  let train;
  let holdout;
  if (mode === "rolling" && seasons.length >= 2) {
    const testSeason = seasons[seasons.length - 1]!;
    const trainSeasons = seasons.slice(0, -1);
    ({ train, holdout } = rollingOriginBySeason(rows, trainSeasons, testSeason));
    // If test season empty, fall back to chrono on all rows.
    if (holdout.length < 20 || train.length < 50) {
      ({ train, holdout } = chronologicalGameSplit(rows, holdoutFrac));
    }
  } else {
    ({ train, holdout } = chronologicalGameSplit(rows, holdoutFrac));
  }

  const compared = fitAndCompare(train, holdout);
  const trainMetrics = roundMetrics(compared.ridgeTrain);
  const holdoutMetrics = roundMetrics(compared.ridgeHoldout);
  const heuristicMetrics = roundMetrics(compared.heuristicHoldout);

  const artifact: EpvModelArtifact & {
    heuristicHoldout: EpvCalibrationMetrics;
    mode: string;
  } = {
    version: "epv-ridge-v1",
    fittedAt: new Date().toISOString(),
    featureNames: [...EPV_FEATURE_NAMES],
    coefficients: compared.coefficients.map((c) => Math.round(c * 1e6) / 1e6),
    train: trainMetrics,
    holdout: holdoutMetrics,
    heuristicHoldout: heuristicMetrics,
    seasons,
    mode,
  };

  const outDir = path.join(process.cwd(), "data", "drbl", "models");
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "epv-coeffs.json");
  await writeFile(outPath, JSON.stringify(artifact, null, 2), "utf8");

  const ridgeBetter =
    holdoutMetrics.mae <= heuristicMetrics.mae ? "ridge" : "heuristic";

  console.log({
    seasons,
    mode,
    trainPossessions: train.length,
    holdoutPossessions: holdout.length,
    ridge: { train: trainMetrics, holdout: holdoutMetrics },
    heuristicHoldout: heuristicMetrics,
    winnerOnHoldoutMae: ridgeBetter,
    maeLift:
      Math.round((heuristicMetrics.mae - holdoutMetrics.mae) * 1000) / 1000,
    outPath,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
