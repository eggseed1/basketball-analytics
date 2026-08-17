import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ABILITY_LINEAGE_VERSION,
  CANONICAL_ABILITY_INPUT,
  GenerationMismatchError,
  assertCompatibleGenerations,
  checkPlayerAbilityLineage,
  componentHealth,
  mergeSequentialIntoPublishedPlayer,
  resolveFusedRateRaw,
  resolvePosteriorAbility,
  summarizeDistribution,
} from "../ability-lineage";
import { empiricalBayesRate } from "../leaderboard";

describe("ability-lineage A1/A2", () => {
  it("preserves LN/B/SDV when sequential row has zeros", () => {
    const published = {
      playerId: "1",
      season: "2024-25",
      gameCount: 400,
      artifactGenerationId: "2024-25-g400-x",
      abilityLineageVersion: ABILITY_LINEAGE_VERSION,
      drblLn: 0.4,
      drblB: 0.3,
      sdv100: 0.2,
      shotMaking100: 0.1,
      epvShootMean: 1.1,
      vContMean: 0.9,
      fusedRateRaw: 1.5,
      posteriorAbilityRate: 1.2,
      drbl100: 1.2,
      reliabilityWeight: 0.9,
      priorMean: 0,
      priorEquivalentPossessions: 200,
      drblP: 1.0,
      drblWar: 3.0,
      seasonalImpact: 50,
    };
    const sequential = {
      playerId: "1",
      season: "2024-25",
      gameCount: 400,
      artifactGenerationId: "2024-25-g400-x",
      abilityLineageVersion: ABILITY_LINEAGE_VERSION,
      drblLn: 0,
      drblB: 0,
      sdv100: 0,
      shotMaking100: 0,
      epvShootMean: 0,
      vContMean: 0,
      fusedRateRaw: 2.8,
      posteriorAbilityRate: 2.5,
      drbl100: 2.5,
      drblP: 2.65,
      rawAbilityRate: 2.81,
      seasonalImpact: 94,
      creationValuePer100: 1.1,
      drblWar: 5.0,
      sequentialAttributionVersion: "drbl-seq-attr-v1",
    };

    const m = mergeSequentialIntoPublishedPlayer(published, sequential);
    assert.equal(m.drblLn, 0.4);
    assert.equal(m.drblB, 0.3);
    assert.equal(m.sdv100, 0.2);
    assert.equal(m.fusedRateRaw, 1.5);
    assert.equal(m.drbl100, 1.2);
    assert.equal(m.drblP, 2.65);
    assert.equal(m.publishedAbilityInput, CANONICAL_ABILITY_INPUT);
  });

  it("fails loudly on gameCount generation mismatch", () => {
    assert.throws(
      () =>
        assertCompatibleGenerations(
          {
            playerId: "1",
            season: "2024-25",
            gameCount: 400,
            abilityLineageVersion: ABILITY_LINEAGE_VERSION,
          },
          {
            playerId: "1",
            season: "2024-25",
            gameCount: 1225,
            abilityLineageVersion: ABILITY_LINEAGE_VERSION,
          }
        ),
      GenerationMismatchError
    );
  });

  it("fails loudly on season mismatch", () => {
    assert.throws(
      () =>
        mergeSequentialIntoPublishedPlayer(
          {
            playerId: "1",
            season: "2024-25",
            gameCount: 400,
            abilityLineageVersion: ABILITY_LINEAGE_VERSION,
            drblLn: 1,
          },
          {
            playerId: "1",
            season: "2025-26",
            gameCount: 400,
            abilityLineageVersion: ABILITY_LINEAGE_VERSION,
            drblP: 2,
          }
        ),
      GenerationMismatchError
    );
  });

  it("resolveFusedRateRaw prefers fusedRateRaw over posterior drbl100", () => {
    assert.equal(
      resolveFusedRateRaw({ playerId: "1", fusedRateRaw: 1.5, drbl100: 1.2 }),
      1.5
    );
  });

  it("resolvePosteriorAbility does not double-shrink when lineage present", () => {
    let called = 0;
    const result = resolvePosteriorAbility({
      player: {
        playerId: "1",
        fusedRateRaw: 1.5,
        posteriorAbilityRate: 1.2,
        reliabilityWeight: 0.94,
      },
      fusedRateRaw: 1.5,
      possessions: 3000,
      priorMean: 0,
      priorEquivalentPossessions: 200,
      empiricalBayes: () => {
        called += 1;
        return { posterior: 99, reliability: 0 };
      },
    });
    assert.equal(called, 0);
    assert.equal(result.reusedExisting, true);
    assert.equal(result.posterior, 1.2);
  });

  it("A2: remaster must not treat posterior as fused (double-shrink regression)", () => {
    const fused = 1.5;
    const n = 3000;
    const k = 200;
    const { posterior } = empiricalBayesRate(fused, n, 0, k);
    // Bug path: EB(drbl100) where drbl100 is already posterior
    const doubleShrunk = empiricalBayesRate(posterior, n, 0, k).posterior;
    assert.notEqual(posterior, doubleShrunk);
    // Correct path: resolveFusedRateRaw then EB once (or reuse posterior)
    const resolved = resolveFusedRateRaw({
      playerId: "1",
      fusedRateRaw: fused,
      drbl100: posterior,
      posteriorAbilityRate: posterior,
    });
    assert.equal(resolved, fused);
    const again = resolvePosteriorAbility({
      player: {
        playerId: "1",
        fusedRateRaw: fused,
        posteriorAbilityRate: posterior,
      },
      fusedRateRaw: resolved,
      possessions: n,
      priorMean: 0,
      priorEquivalentPossessions: k,
      empiricalBayes: empiricalBayesRate,
    });
    assert.equal(again.posterior, posterior);
    assert.ok(Math.abs(again.posterior - doubleShrunk) > 1e-6);
  });

  it("A2 checkPlayerAbilityLineage: drbl100 == posterior and EB reconstructs", () => {
    const fused = 2;
    const n = 1800;
    const k = 200;
    const { posterior } = empiricalBayesRate(fused, n, 0, k);
    const row = {
      playerId: "x",
      fusedRateRaw: fused,
      posteriorAbilityRate: posterior,
      drbl100: posterior,
      drblP: 2.5,
      drblLn: 1,
      drblB: 0.5,
      actualPossessions: n,
      priorMean: 0,
      priorEquivalentPossessions: k,
    };
    const check = checkPlayerAbilityLineage(row);
    assert.equal(check.passPublished, true);
    assert.equal(check.passPosterior, true);
  });

  it("componentHealth flags all-zero / collapsed variance", () => {
    const bad = componentHealth("LN", Array(100).fill(0));
    assert.equal(bad.ok, false);
    const good = componentHealth(
      "LN",
      Array.from({ length: 100 }, (_, i) => (i % 2 === 0 ? 0.5 : -0.3))
    );
    assert.equal(good.ok, true);
    const d = summarizeDistribution([1, 2, 3, 4, 5]);
    assert.equal(d.count, 5);
    assert.equal(d.median, 3);
  });
});
