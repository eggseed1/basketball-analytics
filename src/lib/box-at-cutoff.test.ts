import assert from "node:assert/strict";
import { test } from "node:test";

import type { PlayerGame } from "@/data/types";
import type { PlayByPlayEvent } from "@/data/types/play-by-play";
import { boxAtCutoff } from "./box-at-cutoff";

let seq = 0;
function play(p: Partial<PlayByPlayEvent> & { description: string }): PlayByPlayEvent {
  seq += 1;
  return {
    id: String(seq),
    gameId: "g1",
    actionNumber: seq,
    orderNumber: seq,
    period: 1,
    clockSeconds: 600 - seq,
    clock: "10:00",
    actionType: "unknown",
    subType: "",
    teamId: "H",
    teamTricode: "HOM",
    playerId: null,
    playerName: null,
    scoreHome: 0,
    scoreAway: 0,
    shotResult: null,
    isFieldGoal: false,
    points: 0,
    ...p,
  };
}

function line(playerId: string, extra: Partial<PlayerGame> = {}): PlayerGame {
  return {
    id: `g1-${playerId}`,
    gameId: "g1",
    playerId,
    playerName: playerId,
    teamId: "H",
    season: "2026-27",
    gameDate: "2026-10-20",
    opponentTeamId: "A",
    isHome: true,
    minutes: 30,
    points: 20,
    assists: 5,
    rebounds: 7,
    steals: 1,
    blocks: 1,
    turnovers: 2,
    fieldGoalsMade: 8,
    fieldGoalsAttempted: 15,
    threePointersMade: 2,
    threePointersAttempted: 5,
    freeThrowsMade: 2,
    freeThrowsAttempted: 2,
    plusMinus: 9,
    trueShootingPct: 0.6,
    gameScore: 15,
    ...extra,
  };
}

const labels = { home: "HOM", away: "AWY" };

const events = [
  play({ description: "Starter makes 26-foot three point jumper (Bench assists)", actionType: "3pt", isFieldGoal: true, shotResult: "Made", playerId: "starter", secondPlayerId: "bench", scoreHome: 3, points: 3 }),
  play({ description: "Other makes free throw 1 of 1", teamId: "A", teamTricode: "AWY", actionType: "freethrow", shotResult: "Made", playerId: "other", scoreHome: 3, scoreAway: 1, points: 1 }),
  play({ description: "Starter defensive rebound", actionType: "rebound", playerId: "starter", scoreHome: 3, scoreAway: 1 }),
  play({ description: "Starter misses 60-foot heave jump shot", actionType: "3pt", isFieldGoal: true, shotResult: "Missed", playerId: "starter", scoreHome: 3, scoreAway: 1 }),
  play({ description: "Starter offensive charge", actionType: "unknown", playerId: "starter", scoreHome: 3, scoreAway: 1 }),
];

const players = [
  line("starter", { startPosition: "S" }),
  line("bench"),
  line("unused"),
  line("out", { didNotPlay: true, statusReason: "Injured", minutes: 0, points: 0 }),
  line("other", { teamId: "A", isHome: false, opponentTeamId: "H", startPosition: "S" }),
];

test("boxAtCutoff counts stats from the plays and blanks minutes and plus/minus", () => {
  const box = boxAtCutoff(players, events, labels)!;
  const starter = box.find((p) => p.playerId === "starter")!;
  assert.equal(starter.points, 3);
  assert.equal(starter.threePointersMade, 1);
  assert.equal(starter.threePointersAttempted, 1, "missed heave left out of attempts");
  assert.equal(starter.fieldGoalsAttempted, 1);
  assert.equal(starter.defensiveRebounds, 1);
  assert.equal(starter.rebounds, 1);
  assert.equal(starter.personalFouls, 1, "offensive charge counts as a foul");
  assert.ok(Number.isNaN(starter.minutes));
  assert.ok(Number.isNaN(starter.plusMinus));
  assert.equal(starter.trueShootingPct, undefined);
  assert.equal(starter.gameScore, undefined);

  const bench = box.find((p) => p.playerId === "bench")!;
  assert.equal(bench.assists, 1);
  assert.equal(bench.didNotPlay, undefined);

  assert.equal(box.find((p) => p.playerId === "other")!.freeThrowsMade, 1);
});

test("boxAtCutoff marks bench players with nothing logged as not in yet", () => {
  const box = boxAtCutoff(players, events, labels)!;
  const unused = box.find((p) => p.playerId === "unused")!;
  assert.equal(unused.didNotPlay, true);
  assert.equal(unused.statusReason, undefined);
  assert.equal(unused.points, 0);

  const out = box.find((p) => p.playerId === "out")!;
  assert.equal(out.statusReason, "Injured");
});

test("boxAtCutoff counts a substitute as in once he enters", () => {
  const sub = play({ description: "Unused enters the game for Starter", playerId: "unused", secondPlayerId: "starter" });
  const box = boxAtCutoff(players, [...events, sub], labels)!;
  assert.equal(box.find((p) => p.playerId === "unused")!.didNotPlay, undefined);
});

test("boxAtCutoff gives up when play credits don't match the box ids", () => {
  const foreign = players.map((p) => ({ ...p, playerId: `nba-${p.playerId}` }));
  assert.equal(boxAtCutoff(foreign, events, labels), null);
});
