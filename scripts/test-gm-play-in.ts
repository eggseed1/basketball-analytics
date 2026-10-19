import assert from "node:assert/strict";

import {
  applyPlayInResult,
  playInDone,
  playInOpenGames,
  playoffSeeds,
} from "../src/gm/engine/play-in";
import type { GmPlayInBoard } from "../src/gm/types";

const board: GmPlayInBoard = {
  conferences: [
    {
      conf: "East",
      sevenId: "bos",
      eightId: "nyk",
      nineId: "phi",
      tenId: "mia",
    },
    {
      conf: "West",
      sevenId: "den",
      eightId: "min",
      nineId: "lal",
      tenId: "gsw",
    },
  ],
};

const night1 = playInOpenGames(board);
assert.equal(night1.length, 4);
assert.equal(night1.filter((game) => game.slot === "last").length, 0);

let next = board;
for (const game of night1) {
  const homeWon = game.homeId === "bos" || game.homeId === "den" || game.homeId === "phi" || game.homeId === "lal";
  next = applyPlayInResult(next, game, homeWon);
}
assert.equal(playInDone(next), false);
const east = next.conferences[0]!;
assert.equal(east.sevenSeedId, "bos");
assert.equal(east.sevenLoserId, "nyk");
assert.equal(east.nineWinnerId, "phi");

const night2 = playInOpenGames(next);
assert.equal(night2.length, 2);
assert.equal(night2[0]!.homeId, "nyk");
assert.equal(night2[0]!.awayId, "phi");
next = applyPlayInResult(next, night2[0]!, false);
next = applyPlayInResult(next, night2[1]!, true);
assert.equal(playInDone(next), true);
assert.equal(next.conferences[0]!.eightSeedId, "phi");
assert.equal(next.conferences[1]!.eightSeedId, "min");

const seeds = playoffSeeds(
  {
    teams: [
      { id: "bos", conference: "East" },
      { id: "nyk", conference: "East" },
      { id: "phi", conference: "East" },
      { id: "mia", conference: "East" },
      { id: "cle", conference: "East" },
      { id: "orl", conference: "East" },
      { id: "mil", conference: "East" },
      { id: "ind", conference: "East" },
      { id: "atl", conference: "East" },
      { id: "chi", conference: "East" },
    ] as never,
    standings: Object.fromEntries(
      ["cle", "orl", "mil", "ind", "atl", "chi", "bos", "nyk", "phi", "mia"].map(
        (id, index) => [
          id,
          { teamId: id, wins: 60 - index, losses: 22 + index, confWins: 0, confLosses: 0, pointsFor: 0, pointsAgainst: 0 },
        ]
      )
    ),
  },
  next
);
assert.deepEqual(seeds.East.slice(0, 6), ["cle", "orl", "mil", "ind", "atl", "chi"]);
assert.equal(seeds.East[6], "bos");
assert.equal(seeds.East[7], "phi");
assert.equal(seeds.East.includes("nyk"), false);

console.log("play-in ok");
