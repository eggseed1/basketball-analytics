import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { EPV_FEATURE_NAMES } from "../epv-model";
import {
  EPV_COEFFS_PATH,
  clearEpvCoefficientCache,
  loadEpvCoefficients,
  predictExpectedPoints,
  predictExpectedPointsHeuristic,
  requireEpvModel,
  type PossessionEpState,
} from "../expected-points";

const state: PossessionEpState = { period: 4, clockSeconds: 3, offenseIsHome: false, scoreDiff: -12 };

describe("expected-points coefficients", () => {
  afterEach(() => clearEpvCoefficientCache());

  it("loads the tracked fitted coefficients", async () => {
    const coeffs = await loadEpvCoefficients();
    assert.ok(coeffs);
    assert.equal(coeffs.length, EPV_FEATURE_NAMES.length);
    const artifact = JSON.parse(await readFile(path.join(process.cwd(), EPV_COEFFS_PATH), "utf8")) as {
      featureNames: string[];
    };
    assert.deepEqual(artifact.featureNames, [...EPV_FEATURE_NAMES]);
  });

  it("predicts from the coefficients once required, not from the prior", async () => {
    await requireEpvModel();
    assert.notEqual(predictExpectedPoints(state), predictExpectedPointsHeuristic(state));
  });
});
