import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { projectHomeFindings } from "./home-findings-project";
import type { RecentInsight } from "./recent-insights";

describe("projectHomeFindings", () => {
  it("passes chart payloads through for homepage cards", () => {
    const raw: RecentInsight = {
      id: "a",
      category: "PLAYER · BIG NIGHT",
      headline: "30 in a night",
      description: "Scored 30.",
      context: "vs BOS",
      gameId: "1",
      playerId: "2",
      teamId: "nyk",
      gameDate: "2026-01-01",
      focus: "points",
      line: {
        playerName: "Test",
        teamAbbr: "NYK",
        opponentAbbr: "BOS",
        result: "W",
        minutes: 34,
        points: 30,
        rebounds: 5,
        assists: 4,
        steals: 1,
        blocks: 0,
        fgm: 10,
        fga: 18,
        threePm: 4,
        threePa: 8,
        ftm: 6,
        fta: 6,
      },
      game: {
        away: { teamId: "bos", abbr: "BOS", score: 100, periods: [25, 25, 25, 25] },
        home: { teamId: "nyk", abbr: "NYK", score: 110, periods: [28, 27, 28, 27] },
        flow: {
          path: [
            [0, 0],
            [100, 5],
          ],
          periods: 4,
        },
      },
      hero: { value: "30", label: "PTS" },
      moment: {
        kind: "meters",
        marks: [{ label: "PTS", value: 30, tip: "30 points" }],
      },
      periodPoints: [10, 8, 6, 6],
      contributors: [{ name: "A", value: 20 }],
      trend: [
        { gameDate: "2025-12-28", opponentAbbr: "BOS", points: 20 },
        { gameDate: "2026-01-01", opponentAbbr: "BOS", points: 30 },
      ],
      priority: 1,
      bucket: "player",
    };

    const [out] = projectHomeFindings([raw]);
    assert.equal(out!.headline, "30 in a night");
    assert.ok(out!.game?.flow);
    assert.ok(out!.moment);
    assert.ok(out!.trend?.length);
    assert.ok(out!.periodPoints?.length);
  });
});
