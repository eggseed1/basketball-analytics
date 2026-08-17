/**
 * DRBL-Core / M5 expected possession value.
 * Prefer fitted ridge coefficients when present; else hand-tuned prior.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  EPV_FEATURE_NAMES,
  predictFromCoefficients,
  type EpvCalibrationMetrics,
} from "./epv-model";

export interface PossessionEpState {
  period: number;
  /** Seconds remaining in the period at possession start. */
  clockSeconds: number;
  /** Offense is home team. */
  offenseIsHome: boolean;
  /** Score differential from offense perspective (offense − defense). */
  scoreDiff: number;
}

/** League-average points per possession prior (modern NBA). */
export const LEAGUE_PPP_PRIOR = 1.08;

export interface EpvModelArtifact {
  version: string;
  fittedAt: string;
  featureNames: string[];
  coefficients: number[];
  train: EpvCalibrationMetrics;
  holdout?: EpvCalibrationMetrics;
  heuristicHoldout?: EpvCalibrationMetrics;
  seasons?: string[];
  mode?: string;
}

let cachedCoeffs: number[] | null | undefined;

export function clearEpvCoefficientCache(): void {
  cachedCoeffs = undefined;
}

export async function loadEpvCoefficients(): Promise<number[] | null> {
  if (cachedCoeffs !== undefined) return cachedCoeffs;
  const file = path.join(
    process.cwd(),
    "data",
    "drbl",
    "models",
    "epv-coeffs.json"
  );
  try {
    const raw = await readFile(file, "utf8");
    const artifact = JSON.parse(raw) as EpvModelArtifact;
    if (
      Array.isArray(artifact.coefficients) &&
      artifact.coefficients.length === EPV_FEATURE_NAMES.length
    ) {
      cachedCoeffs = artifact.coefficients;
      return cachedCoeffs;
    }
  } catch {
    // fall through
  }
  cachedCoeffs = null;
  return null;
}

/** Sync path used by attribution — uses cache or heuristic prior. */
export function predictExpectedPoints(state: PossessionEpState): number {
  if (cachedCoeffs && cachedCoeffs.length === EPV_FEATURE_NAMES.length) {
    return predictFromCoefficients(state, cachedCoeffs);
  }
  return predictExpectedPointsHeuristic(state);
}

/**
 * Hand-tuned baseline (leakage-safe). Used until M5 fit artifact exists.
 */
export function predictExpectedPointsHeuristic(
  state: PossessionEpState
): number {
  let ep = LEAGUE_PPP_PRIOR;

  if (state.offenseIsHome) ep += 0.015;

  if (state.clockSeconds <= 4) ep -= 0.12;
  else if (state.clockSeconds <= 8) ep -= 0.04;

  const absDiff = Math.abs(state.scoreDiff);
  if (state.period >= 4 && absDiff >= 20) ep -= 0.03;

  if (state.scoreDiff <= -10) ep += 0.01;

  return clamp(ep, 0.75, 1.35);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Eagerly warm coefficient cache (call from season compute). */
export async function warmEpvModel(): Promise<boolean> {
  const coeffs = await loadEpvCoefficients();
  return coeffs != null;
}
