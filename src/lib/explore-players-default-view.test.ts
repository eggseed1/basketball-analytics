import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_PLAYER_BOARD_VIEWS,
  filterPlayerBoardViewColumns,
  parsePlayerBoardViews,
  serializePlayerBoardViews,
} from "./explore-players-display";
import {
  emptyBoardColumns,
  slimExplorePlayerBoardRow,
  type ExplorePlayerBoardRow,
} from "@/data/queries/explore-players-board-pure";

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
  it("defaults to All when view is omitted", () => {
    assert.deepEqual(parsePlayerBoardViews(null), ["all"]);
    assert.deepEqual(parsePlayerBoardViews(""), ["all"]);
    assert.deepEqual(parsePlayerBoardViews(null), DEFAULT_PLAYER_BOARD_VIEWS);
    assert.equal(serializePlayerBoardViews(["all"]), null);
    assert.equal(serializePlayerBoardViews(["impact"]), "impact");
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

  it("keeps early-season zero counting columns under All (does not collapse to Impact)", () => {
    const early: ExplorePlayerBoardRow = {
      ...baseRow(),
      gamesPlayed: 0,
      minutes: 0,
      points: 0,
      assists: 0,
      rebounds: 0,
      steals: 0,
      blocks: 0,
      turnovers: 0,
      fieldGoalPct: 0,
      threePointPct: 0,
      freeThrowPct: 0,
      darkoDpm: 4.19,
      darkoOff: 4.31,
      darkoDef: -0.13,
      usagePct: undefined,
      hustleDeflections: undefined,
      fieldGoalsAttempted: 0,
    };
    const empty = new Set(emptyBoardColumns([early]));
    assert.equal(empty.has("ppg"), false);
    assert.equal(empty.has("gamesPlayed"), false);
    assert.equal(empty.has("darkoDpm"), false);
    // Truly missing overlays still hide.
    assert.equal(empty.has("hustleDeflections"), true);
    const profile = filterPlayerBoardViewColumns("profile", empty);
    assert.ok(profile.includes("ppg"));
    assert.ok(profile.includes("gamesPlayed"));
  });
});
