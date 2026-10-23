import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_PLAYER_BOARD_VIEWS,
  parsePlayerBoardViews,
  serializePlayerBoardViews,
} from "./explore-players-display";
import { slimExplorePlayerBoardRow } from "@/data/queries/explore-players-board-pure";
import type { ExplorePlayerBoardRow } from "@/data/queries/explore-players-board-pure";

function baseRow(): ExplorePlayerBoardRow {
  return {
    playerId: "1",
    playerName: "Test",
    teamId: "13",
    teamName: "Lakers",
    teamAbbreviation: "LAL",
    season: "2026-27",
    gamesPlayed: 10,
    minutes: 300,
    points: 200,
    assists: 50,
    rebounds: 40,
    steals: 10,
    blocks: 5,
    turnovers: 20,
    fieldGoalPct: 0.45,
    threePointPct: 0.35,
    freeThrowPct: 0.8,
    darkoDpm: 2.1,
    darkoOff: 1.5,
    darkoDef: 0.6,
    r1WinEquivalents: 3.2,
    usagePct: 0.28,
    hustleDeflections: 12,
    fieldGoalsAttempted: 150,
  };
}

describe("explore players default view", () => {
  it("defaults to Impact when view is omitted", () => {
    assert.deepEqual(parsePlayerBoardViews(null), ["impact"]);
    assert.deepEqual(parsePlayerBoardViews(""), ["impact"]);
    assert.deepEqual(parsePlayerBoardViews(null), DEFAULT_PLAYER_BOARD_VIEWS);
    assert.equal(serializePlayerBoardViews(["impact"]), null);
    assert.equal(serializePlayerBoardViews(["all"]), "all");
  });

  it("slims impact rows and keeps All column fields", () => {
    const row = baseRow();
    const slim = slimExplorePlayerBoardRow(row, ["impact"], "r1WinEquivalents");
    assert.equal(slim.darkoDpm, 2.1);
    assert.equal(slim.r1WinEquivalents, 3.2);
    assert.equal(slim.usagePct, undefined);
    assert.equal(slim.hustleDeflections, undefined);
    const all = slimExplorePlayerBoardRow(row, ["all"]);
    assert.equal(all.usagePct, 0.28);
    assert.equal(all.hustleDeflections, 12);
    // Non-column extras stay off the All wire payload.
    assert.equal(all.age, undefined);
  });
});
