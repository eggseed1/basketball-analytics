import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { PlayByPlayEvent } from "@/data/types/play-by-play";
import { playByPlayIsFresher } from "@/components/games/use-live-game-play-by-play";

function play(
  period: number,
  clockSeconds: number,
  overrides: Partial<PlayByPlayEvent> = {}
): PlayByPlayEvent {
  const minutes = Math.floor(clockSeconds / 60);
  const seconds = clockSeconds % 60;
  return {
    id: `${period}-${clockSeconds}`,
    gameId: "g",
    actionNumber: 1,
    orderNumber: 1,
    period,
    clockSeconds,
    clock: `${minutes}:${String(seconds).padStart(2, "0")}`,
    actionType: "2pt",
    subType: "",
    description: "shot",
    teamId: "H",
    teamTricode: "HOM",
    playerId: null,
    playerName: null,
    scoreHome: 0,
    scoreAway: 0,
    ...overrides,
  } as PlayByPlayEvent;
}

describe("playByPlayIsFresher", () => {
  it("prefers the feed that reaches further into the game", () => {
    const early = [play(2, 11 * 60 + 17)];
    const later = [play(2, 11 * 60 + 17), play(2, 0)];
    assert.equal(playByPlayIsFresher(later, early), true);
    assert.equal(playByPlayIsFresher(early, later), false);
  });
});
