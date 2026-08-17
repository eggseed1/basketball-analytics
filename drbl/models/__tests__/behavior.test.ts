import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  fitBehaviorRidge,
  predictBehaviorPer100,
  shotDistanceFeet,
  type BehaviorPlayerRow,
  type BehaviorFeatureVector,
} from "../behavior";
import { fusePlayerRating, estimatorDisagreement } from "../fusion";

function features(
  partial: Partial<BehaviorFeatureVector> = {}
): BehaviorFeatureVector {
  return {
    usage: 0.3,
    threeRate: 0.35,
    assistPer100: 10,
    tovPer100: 8,
    stlPer100: 1.5,
    blkPer100: 1,
    ftRate: 0.2,
    rimRate: 0.25,
    gravityProxy: 0.35,
    ...partial,
  };
}

function row(
  id: string,
  f: BehaviorFeatureVector,
  targetPer100: number
): BehaviorPlayerRow {
  return {
    playerId: id,
    playerName: id,
    teamId: "t1",
    possessions: 200,
    features: f,
    targetPer100,
    asOfDate: "2024-12-01",
    missingXyRate: 0.1,
  };
}

describe("behavior model", () => {
  it("parses shot distance from tenths-of-a-foot coords", () => {
    const d = shotDistanceFeet(0, 80);
    assert.ok(d != null && Math.abs(d - 8) < 1e-6);
  });

  it("recovers a positive assist signal", () => {
    const rows: BehaviorPlayerRow[] = [];
    for (let i = 0; i < 40; i++) {
      rows.push(
        row(
          `hi${i}`,
          features({ assistPer100: 20 + (i % 3), usage: 0.45 }),
          3 + (i % 2) * 0.2
        )
      );
      rows.push(
        row(
          `lo${i}`,
          features({ assistPer100: 4 + (i % 2), usage: 0.2 }),
          -1 + (i % 2) * 0.1
        )
      );
    }
    const fitted = fitBehaviorRidge(rows, { lambda: 5 });
    const assistIdx = 2; // assistPer100 in BEHAVIOR_FEATURE_KEYS
    assert.ok(
      (fitted.coefficients[assistIdx] ?? 0) > 0.1,
      `expected positive assist coef, got ${fitted.coefficients[assistIdx]}`
    );
    const hi = predictBehaviorPer100(
      features({ assistPer100: 22, usage: 0.45 }),
      fitted
    );
    const lo = predictBehaviorPer100(
      features({ assistPer100: 4, usage: 0.2 }),
      fitted
    );
    assert.ok(hi > lo);
  });

  it("reports estimator disagreement without collapsing", () => {
    const sd = estimatorDisagreement(2, 0, -1);
    assert.ok(sd > 1);
  });
});

describe("fusion with B", () => {
  it("includes B when present and redistributes when absent", () => {
    const withB = fusePlayerRating({
      drblP: 2,
      drblLn: 0,
      drblB: 4,
      possessions: 500,
    });
    const withoutB = fusePlayerRating({
      drblP: 2,
      drblLn: 0,
      possessions: 500,
    });
    assert.ok(withB > withoutB);
  });
});
