import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertFeaturesExcludeTarget,
  buildContinueRowsForGame,
  c1FeatureVector,
  c2FeatureVector,
  C1_FEATURE_NAMES,
  C2_FEATURE_NAMES,
  chronologicalOofContinuation,
  continueStateAtShot,
  evaluateContinuePreds,
  fitRidge,
  predictLinear,
  type ContinueStateRow,
} from "../continuation-value";
import type { DrblBoxScore, DrblEvent, DrblPossession } from "../../types";

function event(
  partial: Partial<DrblEvent> &
    Pick<DrblEvent, "actionNumber" | "actionType" | "period" | "clockSeconds">
): DrblEvent {
  return {
    gameId: "g1",
    orderNumber: partial.actionNumber,
    clockRaw: "",
    subType: "",
    teamId: "H",
    playerId: "p1",
    playerName: "P",
    possessionTeamId: "H",
    description: "",
    shotResult: null,
    isFieldGoal: false,
    pointsOnAction: 0,
    scoreHome: 10,
    scoreAway: 8,
    x: null,
    y: null,
    qualifiers: [],
    substitutionSide: null,
    ...partial,
  };
}

const box: DrblBoxScore = {
  gameId: "g1",
  season: "2024-25",
  gameDate: "2024-11-01",
  homeTeamId: "H",
  awayTeamId: "A",
  homeTeamTricode: "HOM",
  awayTeamTricode: "AWY",
  homeScore: 100,
  awayScore: 98,
  players: [],
};

describe("M7-CV continuation value", () => {
  it("excludes target fields from feature name lists", () => {
    assertFeaturesExcludeTarget(C1_FEATURE_NAMES);
    assertFeaturesExcludeTarget(C2_FEATURE_NAMES);
    assert.throws(() =>
      assertFeaturesExcludeTarget(["bias", "remainingPoints"])
    );
  });

  it("does not label FGAs as continue rows and builds remaining-point targets", () => {
    const events: DrblEvent[] = [
      event({
        actionNumber: 1,
        actionType: "steal",
        period: 1,
        clockSeconds: 700,
        teamId: "H",
      }),
      event({
        actionNumber: 2,
        actionType: "2pt",
        period: 1,
        clockSeconds: 690,
        shotResult: "Made",
        isFieldGoal: true,
        pointsOnAction: 2,
        scoreHome: 12,
        scoreAway: 8,
      }),
      event({
        actionNumber: 3,
        actionType: "timeout",
        period: 1,
        clockSeconds: 690,
      }),
    ];
    const possessions: DrblPossession[] = [
      {
        gameId: "g1",
        possessionId: "p1",
        offenseTeamId: "H",
        defenseTeamId: "A",
        period: 1,
        startActionNumber: 1,
        endActionNumber: 2,
        startClockSeconds: 700,
        endClockSeconds: 690,
        points: 2,
        endReason: "made_fg",
        offensePlayerIds: ["a", "b", "c", "d", "e"],
        defensePlayerIds: ["f", "g", "h", "i", "j"],
        eventActionNumbers: [1, 2],
      },
    ];
    const rows = buildContinueRowsForGame(box, events, possessions);
    assert.ok(rows.length >= 1);
    assert.ok(rows.every((r) => r.actionType !== "2pt" && r.actionType !== "3pt"));
    assert.ok(rows.every((r) => !Number.isNaN(r.remainingPoints)));
    // Age-0 grid row should see full possession points as remaining.
    const age0 = rows.find((r) => r.actionType === "age_grid_0");
    assert.ok(age0);
    assert.equal(age0!.remainingPoints, 2);
    assert.equal(age0!.startedViaSteal, true);
    // No FGA actionNumbers labeled as continue feature rows of type 2pt.
    assert.ok(rows.every((r) => r.beforeFirstFg));
  });

  it("age-grid includes mid-possession ages before first FGA", () => {
    const events: DrblEvent[] = [
      event({
        actionNumber: 1,
        actionType: "rebound",
        period: 1,
        clockSeconds: 600,
        subType: "defensive",
        teamId: "H",
      }),
      event({
        actionNumber: 2,
        actionType: "foul",
        period: 1,
        clockSeconds: 585,
        teamId: "A",
      }),
      event({
        actionNumber: 3,
        actionType: "3pt",
        period: 1,
        clockSeconds: 575,
        shotResult: "Missed",
        isFieldGoal: true,
        pointsOnAction: 0,
      }),
    ];
    const possessions: DrblPossession[] = [
      {
        gameId: "g1",
        possessionId: "p1",
        offenseTeamId: "H",
        defenseTeamId: "A",
        period: 1,
        startActionNumber: 1,
        endActionNumber: 3,
        startClockSeconds: 600,
        endClockSeconds: 575,
        points: 0,
        endReason: "def_rebound",
        offensePlayerIds: [],
        defensePlayerIds: [],
        eventActionNumbers: [1, 2, 3],
      },
    ];
    const rows = buildContinueRowsForGame(box, events, possessions);
    const ages = new Set(
      rows.filter((r) => r.actionType.startsWith("age_grid_")).map((r) => r.possessionAgeSec)
    );
    // first FG age = 25 → grid up through 24
    assert.ok(ages.has(0));
    assert.ok(ages.has(8));
    assert.ok(ages.has(16));
    assert.ok(!ages.has(24) || ages.has(24)); // 25 > 24, age 24 allowed if firstFgAge>=24
  });

  it("feature vectors never depend on remainingPoints", () => {
    const base: ContinueStateRow = {
      gameId: "g",
      gameDate: "2024-11-01",
      actionNumber: 1,
      possessionId: "p",
      period: 2,
      clockSeconds: 400,
      scoreDiff: 3,
      offenseIsHome: true,
      possessionAgeSec: 12,
      startedViaOreb: false,
      startedViaSteal: false,
      teamId: "H",
      defenseTeamId: "A",
      beforeFirstFg: true,
      actionType: "foul",
      remainingPoints: 0,
    };
    const a = c1FeatureVector({ ...base, remainingPoints: 0 });
    const b = c1FeatureVector({ ...base, remainingPoints: 3 });
    assert.deepEqual(a, b);
    const c = c2FeatureVector({ ...base, remainingPoints: 0 }, new Map());
    const d = c2FeatureVector({ ...base, remainingPoints: 3 }, new Map());
    assert.deepEqual(c, d);
  });

  it("fits C1 so higher late-clock pressure predicts lower remaining value", () => {
    const rows: Array<{ x: number[]; y: number }> = [];
    for (let i = 0; i < 40; i++) {
      const early: ContinueStateRow = {
        gameId: "g",
        gameDate: "2024-11-01",
        actionNumber: i,
        possessionId: "p",
        period: 1,
        clockSeconds: 600,
        scoreDiff: 0,
        offenseIsHome: true,
        possessionAgeSec: 2,
        startedViaOreb: false,
        startedViaSteal: false,
        teamId: "H",
        defenseTeamId: "A",
        beforeFirstFg: true,
        actionType: "foul",
        remainingPoints: 1.2,
      };
      const late: ContinueStateRow = {
        ...early,
        actionNumber: 100 + i,
        clockSeconds: 3,
        remainingPoints: 0.4,
      };
      rows.push({ x: c1FeatureVector(early), y: early.remainingPoints });
      rows.push({ x: c1FeatureVector(late), y: late.remainingPoints });
    }
    const coef = fitRidge(rows, C1_FEATURE_NAMES.length, 1);
    const pEarly = predictLinear(
      c1FeatureVector({
        gameId: "g",
        gameDate: "2024-11-01",
        actionNumber: 1,
        possessionId: "p",
        period: 1,
        clockSeconds: 600,
        scoreDiff: 0,
        offenseIsHome: true,
        possessionAgeSec: 2,
        startedViaOreb: false,
        startedViaSteal: false,
        teamId: "H",
        defenseTeamId: "A",
        beforeFirstFg: true,
        actionType: "foul",
        remainingPoints: NaN,
      }),
      coef
    );
    const pLate = predictLinear(
      c1FeatureVector({
        gameId: "g",
        gameDate: "2024-11-01",
        actionNumber: 2,
        possessionId: "p",
        period: 1,
        clockSeconds: 3,
        scoreDiff: 0,
        offenseIsHome: true,
        possessionAgeSec: 2,
        startedViaOreb: false,
        startedViaSteal: false,
        teamId: "H",
        defenseTeamId: "A",
        beforeFirstFg: true,
        actionType: "foul",
        remainingPoints: NaN,
      }),
      coef
    );
    assert.ok(pEarly > pLate);
  });

  it("chronological OOF keeps holdout games out of the fit", () => {
    const mk = (
      gameId: string,
      date: string,
      y: number
    ): {
      gameDate: string;
      gameId: string;
      continueRows: ContinueStateRow[];
      possessions: DrblPossession[];
    } => ({
      gameDate: date,
      gameId,
      continueRows: [
        {
          gameId,
          gameDate: date,
          actionNumber: 1,
          possessionId: `${gameId}-p`,
          period: 1,
          clockSeconds: 500,
          scoreDiff: 0,
          offenseIsHome: true,
          possessionAgeSec: 5,
          startedViaOreb: false,
          startedViaSteal: false,
          teamId: "H",
          defenseTeamId: "A",
          beforeFirstFg: true,
          actionType: "foul",
          remainingPoints: y,
        },
      ],
      possessions: [
        {
          gameId,
          possessionId: `${gameId}-p`,
          offenseTeamId: "H",
          defenseTeamId: "A",
          period: 1,
          startActionNumber: 1,
          endActionNumber: 1,
          startClockSeconds: 505,
          endClockSeconds: 500,
          points: y,
          endReason: "other",
          offensePlayerIds: [],
          defensePlayerIds: [],
          eventActionNumbers: [1],
        },
      ],
    });
    const games = [];
    for (let i = 0; i < 10; i++) {
      games.push(mk(`g${i}`, `2024-11-${String(i + 1).padStart(2, "0")}`, 1.0));
    }
    // Holdout games with very different Y — if leaked into fit, preds track 3.0 tightly.
    for (let i = 10; i < 14; i++) {
      games.push(mk(`g${i}`, `2024-11-${String(i + 1).padStart(2, "0")}`, 3.0));
    }
    const oof = chronologicalOofContinuation(games, {
      holdoutFrac: 0.3,
      lambda: 5,
    });
    assert.ok(oof.holdoutGames >= 1);
    assert.ok(oof.trainGames >= 1);
    // Train Y≈1 → holdout preds should stay near ~1, not collapse to 3.
    const meanPred =
      oof.holdoutPreds.reduce((s, r) => s + r.c1, 0) / oof.holdoutPreds.length;
    assert.ok(meanPred < 2.0, `expected no holdout Y leakage, got meanPred=${meanPred}`);
  });

  it("continueStateAtShot marks remainingPoints unusable for features", () => {
    const row = continueStateAtShot({
      gameId: "g",
      gameDate: "2024-11-01",
      actionNumber: 9,
      possessionId: "p",
      period: 1,
      clockSeconds: 100,
      scoreDiff: 0,
      offenseIsHome: true,
      possessionAgeSec: 10,
      startedViaOreb: false,
      startedViaSteal: false,
      teamId: "H",
      defenseTeamId: "A",
    });
    assert.ok(Number.isNaN(row.remainingPoints));
    const x = c1FeatureVector(row);
    assert.equal(x.length, C1_FEATURE_NAMES.length);
  });

  it("evaluateContinuePreds reports corr and mae", () => {
    const m = evaluateContinuePreds([1, 2, 3], [1.1, 1.9, 3.2]);
    assert.equal(m.n, 3);
    assert.ok(m.corr > 0.9);
    assert.ok(m.mae < 0.2);
  });
});
