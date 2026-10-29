import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { DraftNightPick } from "@/data/runtime/draft-night-snapshot";
import {
  availableRookieTrackerSorts,
  boardRowsForRookieSort,
  buildRookieTracker,
  defaultRookieTrackerSort,
  rookieRaceLeaderValue,
  rookieRaceShare,
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

function row(
  partial: Partial<RookieTrackerRow> & Pick<RookieTrackerRow, "key" | "name" | "overall">
): RookieTrackerRow {
  return {
    playerId: partial.key,
    teamAbbr: "BOS",
    round: 1,
    position: null,
    gp: null,
    mpg: null,
    points: null,
    rebounds: null,
    assists: null,
    ppg: null,
    rpg: null,
    apg: null,
    war1: null,
    href: null,
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
      sort: "points",
    });
    assert.equal(model.withGames, 1);
    assert.equal(model.rows[0]?.name, "Bench Rookie");
    assert.equal(model.rows[0]?.points, 16);
    assert.equal(model.rows[0]?.ppg, 8);
    const star = model.rows.find((r) => r.name === "Star Rookie");
    assert.ok(star);
    assert.equal(star.points, null);
    assert.equal(star.gp, null);
  });

  it("defaults the race to WAR1 order when present", () => {
    const model = buildRookieTracker({
      season: "2026-27",
      draftYear: 2026,
      picks: [
        pick({ playerId: "1", name: "A", overall: 1 }),
        pick({ playerId: "2", name: "B", overall: 2, teamAbbr: "BOS" }),
      ],
      seasonLines: [
        {
          playerId: "1",
          playerName: "A",
          teamAbbr: "WAS",
          gamesPlayed: 3,
          minutes: 60,
          points: 30,
          rebounds: 9,
          assists: 6,
        },
        {
          playerId: "2",
          playerName: "B",
          teamAbbr: "BOS",
          gamesPlayed: 3,
          minutes: 90,
          points: 45,
          rebounds: 12,
          assists: 9,
        },
      ],
      drblLines: [
        { playerName: "A", war1: 0.4 },
        { playerName: "B", war1: 0.9 },
      ],
    });
    assert.equal(model.rows[0]?.name, "B");
    assert.equal(model.rows[0]?.war1, 0.9);
  });

  it("sorts by draft pick when asked", () => {
    const rows = [
      row({
        key: "b",
        name: "B",
        overall: 5,
        gp: 3,
        points: 36,
        ppg: 12,
      }),
      row({ key: "a", name: "A", overall: 1 }),
    ];
    assert.deepEqual(
      sortRookieTrackerRows(rows, "pick").map((r) => r.overall),
      [1, 5]
    );
  });

  it("scales race bars to the leader", () => {
    const rows = [
      row({ key: "a", name: "A", overall: 1, points: 40, gp: 4 }),
      row({ key: "b", name: "B", overall: 2, points: 20, gp: 4 }),
      row({ key: "c", name: "C", overall: 3 }),
    ];
    const leader = rookieRaceLeaderValue(rows, "points");
    assert.equal(leader, 40);
    assert.equal(rookieRaceShare(rows[0]!, "points", leader), 1);
    assert.equal(rookieRaceShare(rows[1]!, "points", leader), 0.5);
    assert.equal(rookieRaceShare(rows[2]!, "points", leader), null);
  });

  it("defaults sort to points when WAR1 is still blank", () => {
    const rows = [
      row({ key: "a", name: "A", overall: 1, points: 12, gp: 2 }),
      row({ key: "b", name: "B", overall: 2 }),
    ];
    assert.equal(defaultRookieTrackerSort(rows), "points");
    assert.deepEqual(availableRookieTrackerSorts(rows), [
      "points",
      "pick",
    ]);
    assert.equal(
      defaultRookieTrackerSort([
        row({ key: "a", name: "A", overall: 1, war1: 0.2, gp: 2 }),
      ]),
      "war1"
    );
    assert.equal(
      defaultRookieTrackerSort([row({ key: "a", name: "A", overall: 3 })]),
      "pick"
    );
  });

  it("drops blank metric rows from the home board", () => {
    const rows = [
      row({ key: "a", name: "A", overall: 1 }),
      row({ key: "b", name: "B", overall: 2, points: 40, gp: 2 }),
      row({ key: "c", name: "C", overall: 3, points: 20, gp: 2 }),
    ];
    assert.deepEqual(
      boardRowsForRookieSort(rows, "points").map((r) => r.name),
      ["B", "C"]
    );
    assert.deepEqual(
      boardRowsForRookieSort(rows, "war1").map((r) => r.name),
      []
    );
    assert.deepEqual(
      boardRowsForRookieSort(rows, "pick").map((r) => r.overall),
      [1, 2, 3]
    );
  });
});
