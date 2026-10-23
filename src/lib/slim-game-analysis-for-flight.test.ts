import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { downsampleScoreTimelineForFlight } from "./slim-game-analysis-for-flight";
import type { ScoreTimelinePoint } from "./history/score-flow";

function point(i: number, margin: number): ScoreTimelinePoint {
  return {
    period: 1,
    clock: "12:00",
    elapsedGameTime: i,
    homeScore: Math.max(0, margin),
    awayScore: Math.max(0, -margin),
    margin,
    scoringTeamId: "1",
    scorerId: null,
    points: 2,
    eventIndex: i,
  };
}

describe("downsampleScoreTimelineForFlight", () => {
  it("returns short timelines unchanged", () => {
    const pts = [point(0, 0), point(1, 2), point(2, -1)];
    assert.equal(downsampleScoreTimelineForFlight(pts, 48), pts);
  });

  it("keeps endpoints and margin extrema under the cap", () => {
    const pts = Array.from({ length: 120 }, (_, i) =>
      point(i, i === 40 ? 18 : i === 90 ? -12 : i % 5)
    );
    const out = downsampleScoreTimelineForFlight(pts, 48);
    assert.ok(out.length <= 48);
    assert.equal(out[0], pts[0]);
    assert.equal(out[out.length - 1], pts[pts.length - 1]);
    assert.ok(out.some((p) => p.margin === 18));
    assert.ok(out.some((p) => p.margin === -12));
  });
});
