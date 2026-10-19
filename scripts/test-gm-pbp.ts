import assert from "node:assert/strict";
import test from "node:test";

import { boxToPlayByPlay } from "../src/gm/engine/play-by-play";
import { buildCourtEvents } from "../src/lib/games/court-events";
import type { GmBoxScore } from "../src/gm/types";

function line(
  partial: Partial<GmBoxScore["players"][number]> & Pick<GmBoxScore["players"][number], "playerId" | "playerName" | "teamId">
): GmBoxScore["players"][number] {
  return {
    minutes: 30,
    points: 0,
    assists: 0,
    rebounds: 0,
    steals: 0,
    blocks: 0,
    turnovers: 0,
    fgm: 0,
    fga: 0,
    tpm: 0,
    tpa: 0,
    ftm: 0,
    fta: 0,
    plusMinus: 0,
    trueShootingPct: 0,
    usagePct: 0,
    gameScore: 0,
    ...partial,
  };
}

test("a GM box becomes a shot-chart feed with the same counting", () => {
  const box: GmBoxScore = {
    id: "box_test",
    gameId: "g1",
    season: 2027,
    day: 1,
    homeTeamId: "bos",
    awayTeamId: "det",
    homeScore: 11,
    awayScore: 8,
    players: [
      line({
        playerId: "tatum",
        playerName: "Jayson Tatum",
        teamId: "bos",
        points: 8,
        fgm: 3,
        fga: 6,
        tpm: 1,
        tpa: 3,
        ftm: 1,
        fta: 2,
        assists: 1,
        rebounds: 3,
        steals: 1,
        blocks: 1,
        turnovers: 1,
      }),
      line({
        playerId: "white",
        playerName: "Derrick White",
        teamId: "bos",
        points: 3,
        fgm: 1,
        fga: 2,
        tpm: 1,
        tpa: 1,
        assists: 2,
        rebounds: 1,
        turnovers: 1,
      }),
      line({
        playerId: "cade",
        playerName: "Cade Cunningham",
        teamId: "det",
        points: 8,
        fgm: 3,
        fga: 5,
        tpm: 0,
        tpa: 1,
        ftm: 2,
        fta: 2,
        assists: 1,
        rebounds: 2,
        steals: 1,
        blocks: 0,
        turnovers: 2,
      }),
    ],
  };
  const events = boxToPlayByPlay(box);
  const built = buildCourtEvents(events, "BOS", "DET");
  const tally = (side: "home" | "away", stat: "fgm" | "fga" | "tpm" | "tpa" | "ftm" | "fta" | "ast" | "stl" | "blk" | "tov" | "oreb" | "dreb") =>
    built.ticks.filter((tick) => tick.side === side && tick.stat === stat).length;
  assert.equal(tally("home", "fga"), 8);
  assert.equal(tally("home", "fgm"), 4);
  assert.equal(tally("home", "tpa"), 4);
  assert.equal(tally("home", "tpm"), 2);
  assert.equal(tally("home", "fta"), 2);
  assert.equal(tally("home", "ftm"), 1);
  assert.equal(tally("away", "fga"), 5);
  assert.equal(tally("away", "fgm"), 3);
  assert.equal(tally("away", "ftm"), 2);
  assert.ok(built.court.filter((event) => event.kind === "make" || event.kind === "miss").length >= 13);
  const last = built.marks.at(-1);
  assert.equal(last?.home, 11);
  assert.equal(last?.away, 8);
  assert.ok(built.court.some((event) => event.three && event.kind === "make"));
});
