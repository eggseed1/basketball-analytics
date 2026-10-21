import assert from "node:assert/strict";
import { test } from "node:test";

import type { PlayByPlayEvent } from "@/data/types/play-by-play";
import {
  countTaggedPlays,
  playEventMatchesFilter,
  tagPlayContexts,
} from "@/lib/games/play-filters";

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
    teamId: "home",
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

test("tags paint mid and three from located spots", () => {
  const events = [
    play({
      id: "rim",
      description: "A makes layup",
      isFieldGoal: true,
      shotResult: "Made",
      actionType: "2pt",
      locX: 0,
      locY: 2,
      points: 2,
    }),
    play({
      id: "mid",
      description: "A misses 15-foot jumper",
      isFieldGoal: true,
      shotResult: "Missed",
      actionType: "2pt",
      locX: 5,
      locY: 15,
    }),
    play({
      id: "three",
      description: "A makes 25-foot three point jumper",
      isFieldGoal: true,
      shotResult: "Made",
      actionType: "3pt",
      locX: 0,
      locY: 25,
      points: 3,
    }),
  ];
  const tags = tagPlayContexts(events, "HOM", "AWY");
  assert.equal(playEventMatchesFilter(events[0]!, "paint", tags), true);
  assert.equal(playEventMatchesFilter(events[1]!, "mid", tags), true);
  assert.equal(playEventMatchesFilter(events[2]!, "three", tags), true);
  assert.equal(countTaggedPlays(tags, "paint"), 1);
});

test("tags fast break from running wording", () => {
  const events = [
    play({
      id: "fb",
      description: "A makes running layup",
      isFieldGoal: true,
      shotResult: "Made",
      points: 2,
      locX: 0,
      locY: 2,
    }),
  ];
  const tags = tagPlayContexts(events, "HOM", "AWY");
  assert.equal(tags.get("fb")?.has("fastBreak"), true);
});

test("tags second chance after offensive rebound", () => {
  const events = [
    play({
      id: "miss",
      description: "A misses jumper",
      isFieldGoal: true,
      shotResult: "Missed",
      locX: 3,
      locY: 10,
    }),
    play({
      id: "oreb",
      description: "A offensive rebound",
      actionType: "rebound",
    }),
    play({
      id: "putback",
      description: "A makes tip shot",
      isFieldGoal: true,
      shotResult: "Made",
      points: 2,
      locX: 0,
      locY: 1,
    }),
  ];
  const tags = tagPlayContexts(events, "HOM", "AWY");
  assert.equal(tags.get("putback")?.has("secondChance"), true);
  assert.equal(tags.get("miss")?.has("secondChance") ?? false, false);
});

test("tags off turnovers after the other team turns it over", () => {
  const events = [
    play({
      id: "tov",
      description: "B turnover",
      actionType: "turnover",
      teamId: "away",
      teamTricode: "AWY",
    }),
    play({
      id: "score",
      description: "A makes layup",
      isFieldGoal: true,
      shotResult: "Made",
      points: 2,
      locX: 0,
      locY: 2,
    }),
  ];
  const tags = tagPlayContexts(events, "HOM", "AWY");
  assert.equal(tags.get("score")?.has("offTurnover"), true);
});

test("tags last 5 seconds from the game clock", () => {
  const events = [
    play({
      id: "buzzer",
      description: "A makes 26-foot three point jumper",
      isFieldGoal: true,
      shotResult: "Made",
      actionType: "3pt",
      clockSeconds: 0,
      clock: "0:00",
      points: 3,
      locX: 22,
      locY: 5,
    }),
  ];
  const tags = tagPlayContexts(events, "HOM", "AWY");
  assert.equal(tags.get("buzzer")?.has("lastSecond"), true);
});
