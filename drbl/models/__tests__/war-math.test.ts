import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  calculateAboveReplacementRate,
  calculateSeasonImpactAboveReplacement,
  calculateWAR,
  convertImpactToWins,
  deriveReplacementLevelFromFringe,
  diagnoseWarScale,
  estimatePointsPerWinFromTeamSeasons,
  fitRateCalibrationToTeamNet,
  selectWarInputRate,
  traceWarCalculation,
  WAR_FORMULA_VERSION,
} from "../war-math";
import { warFromImpact } from "../leaderboard";

describe("war-math dimensional identities", () => {
  it("Test A: zero above-replacement ability → WAR 0", () => {
    const r = calculateWAR({
      rawAbilityRate: -2,
      posteriorAbilityRate: -2,
      actualOnCourtPossessions: 5000,
      config: { replacementLevelRate: -2, pointsPerWin: 32 },
    });
    assert.equal(r.aboveReplacementRate, 0);
    assert.equal(r.impactAboveReplacement, 0);
    assert.equal(r.war, 0);
  });

  it("Test B: simple positive player", () => {
    const r = calculateWAR({
      rawAbilityRate: 2,
      posteriorAbilityRate: 2,
      actualOnCourtPossessions: 5000,
      config: { replacementLevelRate: -2, pointsPerWin: 32 },
    });
    assert.equal(r.aboveReplacementRate, 4);
    assert.equal(r.impactAboveReplacement, 200);
    assert.equal(r.war, 6.25);
  });

  it("Test C: MVP-scale synthetic player", () => {
    const r = calculateWAR({
      rawAbilityRate: 6.5,
      posteriorAbilityRate: 6.5,
      actualOnCourtPossessions: 5000,
      config: { replacementLevelRate: -2, pointsPerWin: 32 },
    });
    assert.equal(r.aboveReplacementRate, 8.5);
    assert.equal(r.impactAboveReplacement, 425);
    assert.equal(r.war, 13.28125);
  });

  it("Test D: exposure linearity", () => {
    const a = calculateWAR({
      rawAbilityRate: 4,
      posteriorAbilityRate: 4,
      actualOnCourtPossessions: 2500,
      config: { replacementLevelRate: 0, pointsPerWin: 30 },
    });
    const b = calculateWAR({
      rawAbilityRate: 4,
      posteriorAbilityRate: 4,
      actualOnCourtPossessions: 5000,
      config: { replacementLevelRate: 0, pointsPerWin: 30 },
    });
    assert.equal(b.war, a.war * 2);
  });

  it("Test E: ability linearity", () => {
    const a = calculateWAR({
      rawAbilityRate: 2,
      posteriorAbilityRate: 2,
      actualOnCourtPossessions: 5000,
      config: { replacementLevelRate: 0, pointsPerWin: 30 },
    });
    const b = calculateWAR({
      rawAbilityRate: 4,
      posteriorAbilityRate: 4,
      actualOnCourtPossessions: 5000,
      config: { replacementLevelRate: 0, pointsPerWin: 30 },
    });
    assert.equal(b.impactAboveReplacement, a.impactAboveReplacement * 2);
    assert.equal(b.war, a.war * 2);
  });

  it("Test F: points-per-win inverse relationship", () => {
    const impact = 300;
    assert.equal(convertImpactToWins(impact, 30), 10);
    assert.equal(convertImpactToWins(impact, 60), 5);
  });

  it("Test G: prior independence of exposure helpers", () => {
    const impact = calculateSeasonImpactAboveReplacement(5, 4000);
    // Changing prior must not appear in this helper.
    assert.equal(impact, 200);
    assert.equal(calculateSeasonImpactAboveReplacement(5, 4000), impact);
  });

  it("Test H: unit-equivalence per-100 vs per-possession", () => {
    const per100 = calculateSeasonImpactAboveReplacement(6, 5000);
    const perPoss = 0.06 * 5000;
    assert.equal(per100, 300);
    assert.equal(perPoss, 300);
  });

  it("Test I: ranking/WAR consistency — does not silently use drblP", () => {
    const warInput = selectWarInputRate({
      rawAbilityRate: 2.8,
      posteriorAbilityRate: 1.0,
      source: "raw_realized",
    });
    assert.equal(warInput, 2.8);
    assert.notEqual(warInput, 1.9); // not a random component
  });

  it("replacement identity helper", () => {
    assert.equal(calculateAboveReplacementRate(3, 3), 0);
  });

  it("warFromImpact accepts points/win and legacy wins/point", () => {
    assert.equal(warFromImpact(90, 30), 3);
    assert.equal(warFromImpact(90, 1 / 30), 3);
  });

  it("trace identities hold", () => {
    const t = traceWarCalculation({
      playerId: "1",
      playerName: "Synthetic",
      rawAbilityRate: 6.5,
      posteriorAbilityRate: 5,
      drblP: 6,
      drblLn: 1,
      drblB: 0,
      actualOnCourtPossessions: 5000,
      config: { replacementLevelRate: -2, pointsPerWin: 32 },
    });
    assert.ok(t.identities.aboveReplacementOk);
    assert.ok(t.identities.impactOk);
    assert.ok(t.identities.warOk);
    assert.equal(t.DRBL_WAR, 13.28125);
  });

  it("fringe replacement derivation is empirical", () => {
    const r = deriveReplacementLevelFromFringe([-1, -0.5, 0, 0.5, 1]);
    assert.equal(r, 0);
  });

  it("points-per-win from team differentials", () => {
    const est = estimatePointsPerWinFromTeamSeasons([
      { pointDifferential: 600, wins: 61, games: 82 },
      { pointDifferential: -600, wins: 21, games: 82 },
      { pointDifferential: 300, wins: 51, games: 82 },
    ]);
    assert.ok(est.n >= 2);
    assert.ok(est.pointsPerWin > 20 && est.pointsPerWin < 40);
  });

  it("Phase 22 team-net calibration recovers slope", () => {
    const drbl = [1, 2, 3, 4];
    const net = drbl.map((x) => 2.5 * x);
    const fit = fitRateCalibrationToTeamNet({
      drblTeamPtsPer100: drbl,
      teamNetRating: net,
    });
    assert.ok(Math.abs(fit.throughOriginSlope - 2.5) < 1e-9);
    assert.ok(fit.corr > 0.99);
  });

  it("diagnoses legacy pointsPerWin unit mismatch", () => {
    const flags = diagnoseWarScale({
      legacyPointsPerWinField: 1 / 30,
      warInputRate: 2,
      rawAbilityRate: 2,
      posteriorAbilityRate: 1,
      drblP: 1.5,
      actualOnCourtPossessions: 3000,
      seasonalImpact: 60,
      replacementLevelRate: 0,
      rateCalibrationSlope: 3,
    });
    assert.ok(flags.includes("POINTS_PER_WIN_UNIT_MISMATCH"));
    assert.ok(flags.includes("DRBL_RATE_NOT_TRUE_POINTS_PER_100"));
  });

  it("exports a formula version", () => {
    assert.equal(WAR_FORMULA_VERSION, "3.0.0");
  });
});
