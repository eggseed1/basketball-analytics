import assert from "node:assert/strict";
import { test } from "node:test";

import type { PlayByPlayEvent } from "@/data/types/play-by-play";
import { computeShotPace } from "@/lib/games/shot-pace";

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

test("averages game-clock seconds from possession start to first FGA", () => {
  const events = [
    play({
      id: "tip",
      actionNumber: 1,
      actionType: "jumpball",
      description: "Jump ball recovered by A",
      teamId: "H",
      teamTricode: "HOM",
      clockSeconds: 720,
      scoreHome: 0,
      scoreAway: 0,
    }),
    play({
      id: "h1",
      actionNumber: 2,
      description: "A makes jump shot",
      isFieldGoal: true,
      shotResult: "Made",
      actionType: "2pt",
      teamId: "H",
      teamTricode: "HOM",
      clockSeconds: 708,
      points: 2,
      scoreHome: 2,
      scoreAway: 0,
    }),
    play({
      id: "a1",
      actionNumber: 3,
      description: "B misses 3pt",
      isFieldGoal: true,
      shotResult: "Missed",
      actionType: "3pt",
      teamId: "A",
      teamTricode: "AWY",
      clockSeconds: 690,
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
      clockSeconds: 688,
      scoreHome: 2,
      scoreAway: 0,
    }),
    play({
      id: "h2",
      actionNumber: 5,
      description: "A misses layup",
      isFieldGoal: true,
      shotResult: "Missed",
      actionType: "2pt",
      teamId: "H",
      teamTricode: "HOM",
      clockSeconds: 680,
      scoreHome: 2,
      scoreAway: 0,
    }),
  ];

  const pace = computeShotPace(events, "HOM", "AWY");
  // Home: tip 720→708 = 12; after DREB 688→680 = 8. Away: after make 708→690 = 18.
  assert.equal(pace.samples, 3);
  assert.equal(pace.homeSamples, 2);
  assert.equal(pace.awaySamples, 1);
  assert.equal(pace.home, 10);
  assert.equal(pace.away, 18);
  assert.equal(pace.averageSeconds, (12 + 18 + 8) / 3);
});

test("excludes possessions that never take a field goal", () => {
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
      id: "tov",
      actionNumber: 2,
      description: "A turnover",
      actionType: "turnover",
      teamId: "H",
      teamTricode: "HOM",
      clockSeconds: 700,
      scoreHome: 0,
      scoreAway: 0,
    }),
    play({
      id: "a1",
      actionNumber: 3,
      description: "B makes 3pt",
      isFieldGoal: true,
      shotResult: "Made",
      actionType: "3pt",
      teamId: "A",
      teamTricode: "AWY",
      clockSeconds: 685,
      points: 3,
      scoreHome: 0,
      scoreAway: 3,
    }),
  ];

  const pace = computeShotPace(events, "HOM", "AWY");
  assert.equal(pace.samples, 1);
  assert.equal(pace.away, 15);
  assert.equal(pace.home, null);
});

test("does not count free throws as the first shot", () => {
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
      id: "ft",
      actionNumber: 2,
      description: "A makes free throw 1 of 2",
      actionType: "freethrow",
      shotResult: "Made",
      teamId: "H",
      teamTricode: "HOM",
      clockSeconds: 710,
      points: 1,
      scoreHome: 1,
      scoreAway: 0,
    }),
    play({
      id: "ft2",
      actionNumber: 3,
      description: "A makes free throw 2 of 2",
      actionType: "freethrow",
      shotResult: "Made",
      teamId: "H",
      teamTricode: "HOM",
      clockSeconds: 710,
      points: 1,
      scoreHome: 2,
      scoreAway: 0,
    }),
    play({
      id: "a1",
      actionNumber: 4,
      description: "B makes jump shot",
      isFieldGoal: true,
      shotResult: "Made",
      actionType: "2pt",
      teamId: "A",
      teamTricode: "AWY",
      clockSeconds: 695,
      points: 2,
      scoreHome: 2,
      scoreAway: 2,
    }),
  ];

  const pace = computeShotPace(events, "HOM", "AWY");
  // Home never took an FGA; away started after last FT at 710 → 695 = 15.
  assert.equal(pace.home, null);
  assert.equal(pace.away, 15);
  assert.equal(pace.samples, 1);
});
