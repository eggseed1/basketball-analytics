/**
 * Run: npx tsx --test src/content/history/landmark-games.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { Game } from "@/data/types/game";
import { getRuntimeSnapshotGames } from "@/data/runtime/game-snapshot";
import {
  LANDMARK_GAME_SPECS,
  resolveLandmarkGames,
} from "./landmark-games";

function game(partial: Partial<Game> & Pick<Game, "id" | "season" | "gameDate">): Game {
  return {
    homeTeamId: "1",
    awayTeamId: "2",
    homeScore: 0,
    awayScore: 0,
    gameType: "playoff",
    status: "final",
    ...partial,
  };
}

test("omits a landmark when the archive score does not match", () => {
  const cards = resolveLandmarkGames([
    game({
      id: "wrong",
      season: "2021-22",
      gameDate: "2022-06-17",
      awayTeamAbbr: "GS",
      homeTeamAbbr: "BOS",
      awayScore: 103,
      homeScore: 91,
    }),
  ]);
  assert.equal(cards.length, 0);
});

test("labels a four-win close from the series in the archive", () => {
  const series = [
    ["2023-06-02", "a", "MIA", 93, "DEN", 104],
    ["2023-06-05", "b", "MIA", 111, "DEN", 108],
    ["2023-06-08", "c", "DEN", 109, "MIA", 94],
    ["2023-06-10", "d", "DEN", 108, "MIA", 95],
    ["2023-06-13", "e", "MIA", 89, "DEN", 94],
  ] as const;
  const cards = resolveLandmarkGames(
    series.map(([date, id, away, awayScore, home, homeScore]) =>
      game({
        id,
        season: "2022-23",
        gameDate: date,
        awayTeamAbbr: away,
        homeTeamAbbr: home,
        awayTeamName: away === "DEN" ? "Denver Nuggets" : "Miami Heat",
        homeTeamName: home === "DEN" ? "Denver Nuggets" : "Miami Heat",
        awayScore,
        homeScore,
      })
    )
  );
  const hit = cards.find((card) => card.id === "finals-2023-close");
  assert.ok(hit);
  assert.equal(hit.gameId, "e");
  assert.equal(hit.blurb, "Denver Nuggets closed the Finals in five.");
  assert.match(hit.gameHref, /^\/games\/e\?/);
});

test("current schedule snapshot resolves every landmark game spec", () => {
  const cards = resolveLandmarkGames(getRuntimeSnapshotGames());
  assert.deepEqual(
    cards.map((card) => card.id),
    LANDMARK_GAME_SPECS.map((spec) => spec.id)
  );
  for (const card of cards) {
    assert.match(card.gameId, /^\d+$/);
    assert.match(card.blurb, /closed the Finals in/);
  }
});
