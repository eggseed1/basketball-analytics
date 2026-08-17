import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertChronology,
  assertNoOverlap,
  buildDrblEvalV1Splits,
  hashGames,
  type SplitBundle,
  type SplitGame,
} from "../splits";
import {
  loadReservedTestGames,
  ReservedTestAccessError,
} from "../reserved-test";
import {
  assertComparableExperiments,
  ComparisonInvalidError,
  M16C_CANDIDATE_IDS,
  type ExperimentRecord,
} from "../registry";
import {
  fitFusionOof,
  reconstructOofFusedRate,
  type FusionStackRow,
} from "../../models/fusion";
import { pairedBlockBootstrapRmseDiff } from "../metrics";
import { EVALUATION_PROTOCOL_VERSION } from "../protocol";

function fakeGame(
  season: string,
  gameId: string,
  date: string
): SplitGame {
  return { season, gameId, date };
}

describe("m16b evaluation infrastructure", () => {
  it("detects split overlap", () => {
    const g = fakeGame("2024-25", "1", "2024-11-01");
    const bundle: SplitBundle = {
      evaluationProtocolVersion: EVALUATION_PROTOCOL_VERSION,
      design: "test",
      rationale: "test",
      train: [g],
      validation: [g],
      reservedTest: [],
      trainSplitHash: "a",
      validationSplitHash: "b",
      reservedTestSplitHash: "c",
      protocolHash: "d",
    };
    assert.throws(() => assertNoOverlap(bundle), /SPLIT_OVERLAP/);
  });

  it("enforces chronology", () => {
    const bundle: SplitBundle = {
      evaluationProtocolVersion: EVALUATION_PROTOCOL_VERSION,
      design: "test",
      rationale: "test",
      train: [fakeGame("2024-25", "1", "2025-01-01")],
      validation: [fakeGame("2024-25", "2", "2024-12-01")],
      reservedTest: [fakeGame("2025-26", "3", "2025-10-01")],
      trainSplitHash: "a",
      validationSplitHash: "b",
      reservedTestSplitHash: "c",
      protocolHash: "d",
    };
    assert.throws(() => assertChronology(bundle), /CHRONOLOGY/);
  });

  it("builds deterministic non-overlapping chronological splits", async () => {
    const a = await buildDrblEvalV1Splits();
    const b = await buildDrblEvalV1Splits();
    assert.equal(a.trainSplitHash, b.trainSplitHash);
    assert.equal(a.validationSplitHash, b.validationSplitHash);
    assert.equal(a.reservedTestSplitHash, b.reservedTestSplitHash);
    assertNoOverlap(a);
    assertChronology(a);
    assert.ok(a.train.length > 0);
    assert.ok(a.validation.length > 0);
    assert.ok(a.reservedTest.length > 0);
    assert.equal(hashGames(a.train), a.trainSplitHash);
  });

  it("guards reserved test without explicit allow", async () => {
    const bundle = await buildDrblEvalV1Splits();
    await assert.rejects(
      () => loadReservedTestGames(bundle, { allowReservedTest: false }),
      ReservedTestAccessError
    );
  });

  it("serializes OOF provenance and reconstructs fusedRateRaw exactly", () => {
    const rows: FusionStackRow[] = [];
    for (let i = 0; i < 30; i++) {
      rows.push({
        playerId: `p${i}`,
        drblP: i * 0.1,
        drblLn: i * 0.05,
        drblB: i % 2 === 0 ? 0.1 : null,
        targetPer100: i * 0.08,
        possessions: 100 + i,
        asOfDate: `2024-01-${String((i % 28) + 1).padStart(2, "0")}`,
      });
    }
    const fit = fitFusionOof(rows, { lambda: 8, folds: 5 });
    assert.ok(fit.oofProvenance.foldModels.length > 0);
    assert.ok(fit.finalFitWeights);
    assert.notEqual(
      JSON.stringify(fit.finalFitWeights),
      JSON.stringify(fit.oofProvenance.foldModels[0]?.coefficients)
    );
    for (const row of rows) {
      const stored = fit.oofRatingsPer100.get(row.playerId)!;
      const recon = reconstructOofFusedRate(row.playerId, fit.oofProvenance);
      assert.equal(recon, stored);
    }
  });

  it("rejects incomparable experiments", () => {
    const base: ExperimentRecord = {
      experimentId: "A",
      timestamp: "",
      gitCommit: "",
      dirtyStatus: false,
      evaluationProtocolVersion: EVALUATION_PROTOCOL_VERSION,
      trainSplitHash: "t",
      validationSplitHash: "v",
      reservedTestSplitHash: "r",
      modelVersion: "m",
      modelComponents: [],
      targetVersion: "tv",
      fusionVersion: "f",
      posteriorVersion: "p",
      m6Status: "off",
      eligibilityVersion: "e",
      reservedTestAccessed: false,
    };
    assert.throws(
      () =>
        assertComparableExperiments(base, {
          ...base,
          trainSplitHash: "other",
        }),
      ComparisonInvalidError
    );
  });

  it("declares M16c candidates without executing", () => {
    assert.ok(M16C_CANDIDATE_IDS.includes("m16c-p-ln-b"));
    assert.equal(M16C_CANDIDATE_IDS.length, 7);
  });

  it("paired block bootstrap returns finite CI", () => {
    const y = [1, 2, 3, 4, 5, 6];
    const a = [1.1, 2.2, 2.9, 4.1, 4.8, 6.2];
    const b = [0.9, 1.8, 3.1, 3.9, 5.1, 5.9];
    const blocks = ["g1", "g1", "g2", "g2", "g3", "g3"];
    const r = pairedBlockBootstrapRmseDiff(y, a, b, blocks, {
      resamples: 100,
      seed: 1,
    });
    assert.ok(Number.isFinite(r.pointEstimate));
    assert.ok(Number.isFinite(r.ciLow));
    assert.ok(Number.isFinite(r.ciHigh));
  });
});
