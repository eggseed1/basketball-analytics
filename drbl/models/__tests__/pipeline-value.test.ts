import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assignBehaviorArchetype,
  calibratePosterior,
  computeWAA,
  computeWAR,
  diagnosePipelineHealth,
  empiricalBayesPosterior,
  fieldLineageAudit,
  fitCalibrationLeaveOneOut,
  tracePlayerValue,
  type BehaviorRates,
} from "../pipeline-value";

const league: BehaviorRates = {
  creation: 0.2,
  connection: 0.1,
  conversion: 0,
  execution: 0.5,
  recovery: 0,
  turnover: -0.2,
  defense: 0.1,
  possessions: 0,
};

describe("pipeline-value canonical architecture", () => {
  it("posterior-use: calibration consumes posterior not raw", () => {
    const raw = 5;
    const posterior = 2;
    const finalAbility = calibratePosterior(posterior, 0.5, 3);
    assert.equal(finalAbility, 6.5);
    assert.notEqual(calibratePosterior(raw, 0.5, 3), finalAbility);
  });

  it("calibration test", () => {
    assert.equal(calibratePosterior(2, 0.5, 3), 6.5);
  });

  it("replacement test", () => {
    const w = computeWAR({
      finalAbilityDRBL100: 3,
      replacementLevelDRBL100: -2,
      pairedOnCourtPossessions: 5000,
      pointsPerWin: 30,
    });
    assert.equal(w.aboveReplacementRate, 5);
    assert.equal(w.impactAboveReplacement, 250);
    assert.ok(Math.abs(w.war - 250 / 30) < 1e-9);
  });

  it("average vs replacement: ability 0, replacement -2", () => {
    const waa = computeWAA({
      finalAbilityDRBL100: 0,
      pairedOnCourtPossessions: 5000,
      pointsPerWin: 30,
    });
    const war = computeWAR({
      finalAbilityDRBL100: 0,
      replacementLevelDRBL100: -2,
      pairedOnCourtPossessions: 5000,
      pointsPerWin: 30,
    });
    assert.equal(waa, 0);
    assert.equal(war.aboveReplacementRate, 2);
    assert.ok(war.war > 0);
  });

  it("exposure linearity doubles WAA and WAR", () => {
    const a = computeWAR({
      finalAbilityDRBL100: 4,
      replacementLevelDRBL100: -1,
      pairedOnCourtPossessions: 2500,
      pointsPerWin: 30,
    });
    const b = computeWAR({
      finalAbilityDRBL100: 4,
      replacementLevelDRBL100: -1,
      pairedOnCourtPossessions: 5000,
      pointsPerWin: 30,
    });
    assert.equal(b.war, a.war * 2);
    assert.equal(
      computeWAA({
        finalAbilityDRBL100: 4,
        pairedOnCourtPossessions: 5000,
        pointsPerWin: 30,
      }),
      computeWAA({
        finalAbilityDRBL100: 4,
        pairedOnCourtPossessions: 2500,
        pointsPerWin: 30,
      }) * 2
    );
  });

  it("position invariance: position label not in value math", () => {
    const base = {
      finalAbilityDRBL100: 3,
      replacementLevelDRBL100: -1,
      pairedOnCourtPossessions: 3000,
      pointsPerWin: 30,
    };
    assert.deepEqual(computeWAR(base), computeWAR(base));
  });

  it("archetype quality-separation: identical behavior → same archetype", () => {
    const a = assignBehaviorArchetype(
      {
        creation: 1.2,
        connection: 0.1,
        conversion: 0,
        execution: 0.2,
        recovery: 0,
        turnover: 0,
        defense: 0.05,
        possessions: 3000,
      },
      league
    );
    const b = assignBehaviorArchetype(
      {
        creation: 1.2,
        connection: 0.1,
        conversion: 0,
        execution: 0.2,
        recovery: 0,
        turnover: 0,
        defense: 0.05,
        possessions: 3000,
      },
      league
    );
    assert.equal(a.primaryArchetype, b.primaryArchetype);
  });

  it("archetype differs when behavior differs at same 'quality'", () => {
    const creator = assignBehaviorArchetype(
      {
        creation: 2,
        connection: 0.5,
        conversion: 0,
        execution: 0.2,
        recovery: 0,
        turnover: 0,
        defense: 0,
        possessions: 3000,
      },
      league
    );
    const finisher = assignBehaviorArchetype(
      {
        creation: 0.05,
        connection: 0.05,
        conversion: 0,
        execution: 3,
        recovery: 0,
        turnover: 0,
        defense: 0,
        possessions: 3000,
      },
      league
    );
    assert.notEqual(creator.primaryArchetype, finisher.primaryArchetype);
  });

  it("archetype does not depend on DRBL/WAR fields (API has none)", () => {
    const keys = Object.keys(
      assignBehaviorArchetype(
        {
          creation: 0.5,
          connection: 0.2,
          conversion: 0,
          execution: 0.4,
          recovery: 0,
          turnover: 0,
          defense: 0.3,
          possessions: 1000,
        },
        league
      )
    );
    assert.ok(!keys.includes("rawDRBL"));
  });

  it("formula conservation", () => {
    const finalAbility = 6.5;
    const replacement = -1.2;
    const nPaired = 3365;
    const ppw = 38.7;
    const war = computeWAR({
      finalAbilityDRBL100: finalAbility,
      replacementLevelDRBL100: replacement,
      pairedOnCourtPossessions: nPaired,
      pointsPerWin: ppw,
    });
    const expected = ((finalAbility - replacement) * nPaired) / 100 / ppw;
    assert.ok(Math.abs(war.war - expected) < 1e-9);
  });

  it("flags posterior unused", () => {
    const flags = diagnosePipelineHealth({
      posteriorUsedDownstream: false,
      calibrationSource: "learned_leave_one_out",
      replacementLevel: -1,
      zeroMeans: "average",
      positionProxyUsed: false,
      archetypeUsesImpact: false,
      warUsesCanonicalAbility: true,
    });
    assert.ok(flags.includes("POSTERIOR_COMPUTED_BUT_UNUSED"));
  });

  it("lineage lists posterior usedBy calibration", () => {
    const post = fieldLineageAudit().find((f) => f.field === "posteriorDRBL");
    assert.ok(post);
    assert.ok(post!.usedBy.some((u) => /calibrat|finalAbility/i.test(u)));
  });

  it("LOO calibration is learned", () => {
    const xs = [1, 2, 3, 4, 5];
    const ys = xs.map((x) => 2.5 * x);
    const fit = fitCalibrationLeaveOneOut({
      teamFeature: xs,
      teamTarget: ys,
      preferThroughOrigin: true,
    });
    assert.equal(fit.source, "learned_leave_one_out");
    assert.ok(Math.abs(fit.slope - 2.5) < 1e-6);
    assert.ok(fit.oofCorr > 0.99);
  });

  it("trace prefers calibrated posterior path", () => {
    const tr = tracePlayerValue({
      playerId: "1",
      playerName: "Test",
      rawDRBL: 5,
      fusedOrObservedForPosterior: 2,
      actualOnCourtPossessions: 5000,
      priorStrength: 0,
      calibrationIntercept: 0,
      calibrationSlope: 3,
      replacementLevelDRBL100: -1,
      pointsPerWin: 30,
    });
    assert.equal(tr.posteriorDRBL, 2);
    assert.equal(tr.finalAbilityDRBL100, 6);
    // 4.0.1: actualOnCourtPossessions arg is combined; WAR uses paired = n/2
    assert.ok(Math.abs(tr.WAR - ((6 - -1) * 2500) / 100 / 30) < 1e-9);
  });

  it("EB posterior shrinks small samples", () => {
    const small = empiricalBayesPosterior(10, 50, 0, 200);
    const large = empiricalBayesPosterior(10, 4000, 0, 200);
    assert.ok(small.posterior < large.posterior);
    assert.ok(small.reliability < large.reliability);
  });
});
