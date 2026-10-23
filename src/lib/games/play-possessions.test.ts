import assert from "node:assert/strict";
import { test } from "node:test";

import type { PlayByPlayEvent } from "@/data/types/play-by-play";
import { countPlayPossessions } from "@/lib/games/play-possessions";

function play(
  partial: Partial<PlayByPlayEvent> & Pick<PlayByPlayEvent, "id" | "description">
): PlayByPlayEvent {
  return {
    gameId: "g",
    actionNumber: 1,
    orderNumber: 1,
    period: 1,
    clockSeconds: 600,
    clock: "10:00",
    actionType: "2pt",
    subType: "",
    teamId: "H",
    teamTricode: "HOM",
    playerId: "1",
    playerName: "A",
    scoreHome: 0,
    scoreAway: 0,
    shotResult: null,
    isFieldGoal: false,
    points: 0,
    ...partial,
  };
}

test("counts completed possessions as integers from PBP", () => {
  const events = [
    play({
      id: "tip",
      actionNumber: 1,
      actionType: "jumpball",
      description: "Jump ball",
      teamId: "H",
      teamTricode: "HOM",
      clockSeconds: 720,
    }),
    play({
      id: "h1",
      actionNumber: 2,
      description: "A makes jump shot",
      isFieldGoal: true,
      shotResult: "Made",
      teamId: "H",
      teamTricode: "HOM",
      clockSeconds: 700,
      points: 2,
      scoreHome: 2,
      scoreAway: 0,
    }),
    play({
      id: "a-miss",
      actionNumber: 3,
      description: "B misses 3pt",
      isFieldGoal: true,
      shotResult: "Missed",
      actionType: "3pt",
      teamId: "A",
      teamTricode: "AWY",
      clockSeconds: 680,
      scoreHome: 2,
      scoreAway: 0,
    }),
    play({
      id: "dreb",
      actionNumber: 4,
      description: "A defensive rebound",
      actionType: "rebound",
      teamId: "H",
      teamTricode: "HOM",
      clockSeconds: 678,
      scoreHome: 2,
      scoreAway: 0,
    }),
    play({
      id: "tov",
      actionNumber: 5,
      description: "A turnover",
      actionType: "turnover",
      teamId: "H",
      teamTricode: "HOM",
      clockSeconds: 660,
      scoreHome: 2,
      scoreAway: 0,
    }),
    play({
      id: "a-make",
      actionNumber: 6,
      description: "B makes layup",
      isFieldGoal: true,
      shotResult: "Made",
      teamId: "A",
      teamTricode: "AWY",
      clockSeconds: 650,
      points: 2,
      scoreHome: 2,
      scoreAway: 2,
    }),
  ];

  const counts = countPlayPossessions(events, "HOM", "AWY");
  // Home: make, turnover = 2. Away: miss+dreb ends away trip, then make = 2.
  assert.equal(counts.home, 2);
  assert.equal(counts.away, 2);
  assert.equal(counts.shared, 2);
  assert.ok(Number.isInteger(counts.shared));
});

test("and-1 does not double-count the field-goal possession", () => {
  const events = [
    play({
      id: "tip",
      actionNumber: 1,
      actionType: "jumpball",
      description: "Jump ball",
      teamId: "H",
      teamTricode: "HOM",
      clockSeconds: 720,
    }),
    play({
      id: "h1",
      actionNumber: 2,
      description: "A makes layup",
      isFieldGoal: true,
      shotResult: "Made",
      teamId: "H",
      teamTricode: "HOM",
      clockSeconds: 700,
      points: 2,
      scoreHome: 2,
      scoreAway: 0,
    }),
    play({
      id: "foul",
      actionNumber: 3,
      description: "B shooting foul",
      actionType: "foul",
      teamId: "A",
      teamTricode: "AWY",
      clockSeconds: 700,
      scoreHome: 2,
      scoreAway: 0,
    }),
    play({
      id: "ft",
      actionNumber: 4,
      description: "A makes free throw 1 of 1",
      actionType: "freethrow",
      shotResult: "Made",
      teamId: "H",
      teamTricode: "HOM",
      clockSeconds: 700,
      points: 1,
      scoreHome: 3,
      scoreAway: 0,
    }),
  ];

  const counts = countPlayPossessions(events, "HOM", "AWY");
  assert.equal(counts.home, 1);
  assert.equal(counts.away, 0);
});
