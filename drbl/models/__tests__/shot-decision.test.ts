import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  decisionStateFromEvent,
  epvShoot,
  shotDecisionValue,
  shotMakingResidual,
  fitMakeRidge,
  predictMakeProb,
  makeFeatureVector,
  fitBucketBaseline,
  type ShotDecisionRow,
} from "../shot-decision";
import type { DrblBoxScore, DrblEvent } from "../../types";

function baseRow(partial: Partial<ShotDecisionRow> = {}): ShotDecisionRow {
  return {
    gameId: "g1",
    gameDate: "2024-11-01",
    actionNumber: 1,
    possessionId: "p1",
    playerId: "player",
    playerName: "Player",
    teamId: "home",
    defenseTeamId: "away",
    offensePlayerIds: ["player", "a", "b", "c", "d"],
    defensePlayerIds: ["e", "f", "g", "h", "i"],
    period: 2,
    clockSeconds: 400,
    scoreDiff: 0,
    offenseIsHome: true,
    isThree: false,
    distanceFeet: 10,
    pointValue: 2,
    made: 0,
    observedShotPoints: 0,
    possessionPoints: 0,
    nextOffensePossessionPoints: null,
    ...partial,
  };
}

describe("M6 shot decision", () => {
  it("reverses made-shot score for pre-decision state", () => {
    const box: DrblBoxScore = {
      gameId: "g",
      season: "2024-25",
      gameDate: "2024-11-01",
      homeTeamId: "H",
      awayTeamId: "A",
      homeTeamTricode: "HOM",
      awayTeamTricode: "AWY",
      homeScore: 50,
      awayScore: 48,
      players: [],
    };
    const event: DrblEvent = {
      gameId: "g",
      actionNumber: 10,
      orderNumber: 10,
      period: 2,
      clockSeconds: 300,
      clockRaw: "",
      actionType: "2pt",
      subType: "",
      teamId: "H",
      playerId: "p",
      playerName: "p",
      possessionTeamId: "H",
      description: "",
      shotResult: "Made",
      isFieldGoal: true,
      pointsOnAction: 2,
      scoreHome: 50,
      scoreAway: 48,
      x: 0,
      y: 50,
      qualifiers: [],
      substitutionSide: null,
    };
    const state = decisionStateFromEvent(event, box);
    // Pre-make home score should be 48, diff 0.
    assert.equal(state.scoreDiff, 0);
  });

  it("allows negative SDV on a make and positive SDV on a miss", () => {
    // Contested midrange expected value low vs possession EPV ~1.1
    const shootBad = epvShoot(0.3, 2); // 0.6
    const cont = 1.1;
    const sdvMakeBad = shotDecisionValue(shootBad, cont);
    assert.ok(sdvMakeBad < 0);
    // Even if made, SDV (decision) stays negative — making is separate.
    const making = shotMakingResidual(2, shootBad);
    assert.ok(making > 0);

    const shootGood = epvShoot(0.4, 3); // 1.2
    const sdvMissGood = shotDecisionValue(shootGood, cont);
    assert.ok(sdvMissGood > 0);
    const makingMiss = shotMakingResidual(0, shootGood);
    assert.ok(makingMiss < 0);
  });

  it("fits a make model that prefers threes with distance signal", () => {
    const ctx = {
      playerPriorMake: 0.4,
      playerPriorAttempts: 50,
      teamPriorMake: 0.45,
      oppPriorAllow: 0.45,
      lineupOffensePriorMake: 0.45,
      lineupDefensePriorAllow: 0.45,
    };
    const rows: Array<{ x: number[]; y: number }> = [];
    for (let i = 0; i < 40; i++) {
      const three = baseRow({
        isThree: true,
        pointValue: 3,
        distanceFeet: 24,
        made: 1,
      });
      const mid = baseRow({
        isThree: false,
        pointValue: 2,
        distanceFeet: 18,
        made: 0,
      });
      rows.push({
        x: makeFeatureVector(three, ctx),
        y: 1,
      });
      rows.push({
        x: makeFeatureVector(mid, ctx),
        y: 0,
      });
    }
    const coef = fitMakeRidge(rows, 1);
    const pThree = predictMakeProb(
      makeFeatureVector(
        baseRow({ isThree: true, pointValue: 3, distanceFeet: 24 }),
        ctx
      ),
      coef
    );
    const pMid = predictMakeProb(
      makeFeatureVector(
        baseRow({ isThree: false, pointValue: 2, distanceFeet: 18 }),
        ctx
      ),
      coef
    );
    assert.ok(pThree > pMid);
  });

  it("builds bucket baseline from training rows only", () => {
    const rows = [
      baseRow({ isThree: true, pointValue: 3, distanceFeet: 25, made: 1 }),
      baseRow({ isThree: true, pointValue: 3, distanceFeet: 25, made: 0 }),
      baseRow({ isThree: false, distanceFeet: 4, made: 1 }),
      baseRow({ isThree: false, distanceFeet: 4, made: 1 }),
    ];
    const buckets = fitBucketBaseline(rows);
    assert.ok((buckets.get("three") ?? 0) === 0.5);
    assert.ok((buckets.get("rim") ?? 0) === 1);
  });
});
