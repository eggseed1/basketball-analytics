import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { DraftNightPick } from "@/data/runtime/draft-night-snapshot";
import {
  buildRookieTracker,
  sortRookieTrackerRows,
  type RookieTrackerRow,
} from "./home-rookie-tracker";

function pick(
  partial: Partial<DraftNightPick> &
    Pick<DraftNightPick, "name" | "overall" | "playerId">
): DraftNightPick {
  return {
    year: 2026,
    round: 1,
    roundPick: partial.overall,
    teamAbbr: "WAS",
    position: "F",
    ...partial,
  };
}

describe("home-rookie-tracker", () => {
  it("keeps blank counting lines when a pick has no games yet", () => {
    const model = buildRookieTracker({
      season: "2026-27",
      draftYear: 2026,
      picks: [
        pick({ playerId: "1", name: "Star Rookie", overall: 1 }),
        pick({
          playerId: "2",
          name: "Bench Rookie",
          overall: 12,
          teamAbbr: "BOS",
        }),
      ],
      seasonLines: [
        {
          playerId: "2",
          playerName: "Bench Rookie",
          teamAbbr: "BOS",
          gamesPlayed: 2,
          minutes: 24,
          points: 16,
          rebounds: 4,
          assists: 2,
        },
      ],
      sort: "ppg",
    });
    assert.equal(model.withGames, 1);
    assert.equal(model.rows[0]?.name, "Bench Rookie");
    assert.equal(model.rows[0]?.ppg, 8);
    const star = model.rows.find((r) => r.name === "Star Rookie");
    assert.ok(star);
    assert.equal(star.ppg, null);
    assert.equal(star.gp, null);
  });

  it("sorts by draft pick when asked", () => {
    const rows: RookieTrackerRow[] = [
      {
        key: "b",
        playerId: "b",
        name: "B",
        teamAbbr: "BOS",
        overall: 5,
        round: 1,
        position: null,
        gp: 3,
        mpg: 20,
        ppg: 12,
        rpg: 4,
        apg: 2,
        war1: null,
        href: null,
      },
      {
        key: "a",
        playerId: "a",
        name: "A",
        teamAbbr: "ATL",
        overall: 1,
        round: 1,
        position: null,
        gp: null,
        mpg: null,
        ppg: null,
        rpg: null,
        apg: null,
        war1: null,
        href: null,
      },
    ];
    assert.deepEqual(
      sortRookieTrackerRows(rows, "pick").map((r) => r.overall),
      [1, 5]
    );
  });
});
