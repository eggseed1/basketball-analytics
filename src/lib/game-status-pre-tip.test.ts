import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isPreTipPresentation } from "./game-status";

describe("isPreTipPresentation", () => {
  it("keeps scheduled games before tip-off on the pre-tip board", () => {
    assert.equal(
      isPreTipPresentation({
        status: "scheduled",
        tipOffAt: "2099-01-01T00:00:00Z",
        period: 0,
        homeScore: 0,
        awayScore: 0,
      }),
      true
    );
  });

  it("opens Game Lab when tip-off has passed even if status is still scheduled", () => {
    assert.equal(
      isPreTipPresentation({
        status: "scheduled",
        tipOffAt: "2020-01-01T00:00:00Z",
        period: 0,
        homeScore: 0,
        awayScore: 0,
      }),
      false
    );
  });

  it("opens Game Lab when scores or period show the game has started", () => {
    assert.equal(
      isPreTipPresentation({
        status: "scheduled",
        tipOffAt: "2099-01-01T00:00:00Z",
        period: 1,
        homeScore: 0,
        awayScore: 0,
      }),
      false
    );
    assert.equal(
      isPreTipPresentation({
        status: "pregame",
        tipOffAt: "2099-01-01T00:00:00Z",
        period: 0,
        homeScore: 2,
        awayScore: 0,
      }),
      false
    );
  });

  it("stays off the pre-tip board for live and final statuses", () => {
    assert.equal(
      isPreTipPresentation({ status: "period_break", tipOffAt: null }),
      false
    );
    assert.equal(
      isPreTipPresentation({ status: "final", tipOffAt: null }),
      false
    );
  });
});
