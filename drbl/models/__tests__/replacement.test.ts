import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildReplacementPool,
  roleDistance,
  roleMatchedReplacementResidual,
  replacementExpectedPoints,
  type ReplacementCandidate,
  type RoleVector,
} from "../replacement";
import type { PossessionEpState } from "../expected-points";

function cand(
  id: string,
  role: RoleVector,
  residual: number,
  asOfDate = "2024-12-01"
): ReplacementCandidate {
  return {
    playerId: id,
    playerName: id,
    role,
    meanResidual: residual,
    possessions: 100,
    asOfDate,
  };
}

describe("replacement pool cutoff", () => {
  it("freezes candidates after cutoff date", () => {
    const role: RoleVector = {
      usage: 0.25,
      threeRate: 0.4,
      starterRate: 0.2,
      minutesPerGame: 18,
    };
    const pool = buildReplacementPool(
      [
        cand("a", role, -0.05, "2024-11-01"),
        cand("b", role, -0.04, "2025-06-01"),
        cand("c", role, -0.06, "2024-10-15"),
      ],
      { cutoffDate: "2024-12-01" }
    );
    assert.ok(pool.candidates.every((c) => c.asOfDate <= "2024-12-01"));
    assert.equal(
      pool.candidates.some((c) => c.playerId === "b"),
      false
    );
  });

  it("matches similar roles for R1 residual", () => {
    const target: RoleVector = {
      usage: 0.22,
      threeRate: 0.45,
      starterRate: 0.1,
      minutesPerGame: 16,
    };
    const close: RoleVector = { ...target, usage: 0.21 };
    const far: RoleVector = {
      usage: 0.4,
      threeRate: 0.1,
      starterRate: 1,
      minutesPerGame: 34,
    };
    assert.ok(roleDistance(target, close) < roleDistance(target, far));
    const pool = buildReplacementPool(
      [
        cand("close", close, -0.03),
        cand("far", far, 0.1),
        cand("mid", target, -0.02),
      ],
      { cutoffDate: "2024-12-01" }
    );
    const adj = roleMatchedReplacementResidual(target, pool, 2);
    assert.ok(adj < 0.05);
  });

  it("replacement EP stays near context EP", () => {
    const state: PossessionEpState = {
      period: 2,
      clockSeconds: 400,
      offenseIsHome: true,
      scoreDiff: 0,
    };
    const role: RoleVector = {
      usage: 0.2,
      threeRate: 0.35,
      starterRate: 0,
      minutesPerGame: 14,
    };
    const pool = buildReplacementPool(
      [cand("r1", role, -0.2), cand("r2", role, -0.15)],
      { cutoffDate: "2024-12-01" }
    );
    const ep = replacementExpectedPoints(state, role, pool);
    assert.ok(ep >= 0.7 && ep <= 1.4);
  });
});
