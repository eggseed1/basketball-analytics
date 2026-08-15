/**
 * Player career explorer helpers — notable games dimensions stay transparent.
 * Run: npx tsx scripts/test-player-career-explorer.ts
 */
import assert from "node:assert/strict";

import { pickNotableGames } from "../src/components/players/player-notable-games";
import { askDrblHref } from "../src/components/players/player-ask-links";
import type { PlayerGame } from "../src/data/types";

function game(
  partial: Partial<PlayerGame> & Pick<PlayerGame, "id" | "points">
): PlayerGame {
  return {
    gameId: partial.gameId ?? `g-${partial.id}`,
    playerId: "p1",
    teamId: "lal",
    season: "2024-25",
    gameDate: partial.gameDate ?? "2024-11-01",
    opponentTeamId: "bos",
    isHome: true,
    minutes: partial.minutes ?? 32,
    assists: partial.assists ?? 5,
    rebounds: partial.rebounds ?? 7,
    steals: partial.steals ?? 1,
    blocks: partial.blocks ?? 0,
    turnovers: 2,
    fieldGoalsMade: 10,
    fieldGoalsAttempted: 20,
    threePointersMade: 2,
    threePointersAttempted: 6,
    freeThrowsMade: 4,
    freeThrowsAttempted: 5,
    plusMinus: partial.plusMinus ?? 0,
    ...partial,
  };
}

const games = [
  game({ id: "1", points: 40, assists: 2, rebounds: 3, plusMinus: 4 }),
  game({ id: "2", points: 28, assists: 12, rebounds: 11, plusMinus: 2 }),
  game({ id: "3", points: 12, assists: 1, rebounds: 2, plusMinus: 22 }),
  game({ id: "4", points: 8, assists: 0, rebounds: 1, plusMinus: -5 }),
];

const notables = pickNotableGames(games, 22);
assert.ok(notables.length >= 3);
assert.equal(notables.find((n) => n.kind === "highest_scoring")?.game.id, "1");
assert.equal(notables.find((n) => n.kind === "all_around")?.game.id, "2");
assert.equal(notables.find((n) => n.kind === "plus_minus")?.game.id, "3");
assert.ok(
  !notables.some((n) => n.label.toLowerCase().includes("game score"))
);
assert.equal(pickNotableGames([game({ id: "1", points: 20 })]).length, 0);

const href = askDrblHref("What was LeBron James's peak production?", "1966");
assert.equal(
  href,
  "/ask?q=What+was+LeBron+James%27s+peak+production%3F&playerId=1966"
);

console.log("test-player-career-explorer: all assertions passed");
