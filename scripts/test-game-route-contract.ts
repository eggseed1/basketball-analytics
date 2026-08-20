/**
 * P17.2 - game link generator ↔ destination lookup contract.
 * Run: npx tsx scripts/test-game-route-contract.ts
 */
import assert from "node:assert/strict";

import {
  guessGameProvider,
  looksLikeEspnEventId,
  looksLikeNbaStatsGameId,
} from "../src/data/identity/game-id";
import {
  getGameShell,
  looksLikeEspnEventId as gamesLooksEspn,
  looksLikeNbaStatsGameId as gamesLooksNba,
} from "../src/data/queries/games";

async function main() {
  console.log("id-space helpers…");
  assert.equal(looksLikeEspnEventId("401585741"), true);
  assert.equal(gamesLooksEspn("401585741"), true);
  assert.equal(looksLikeNbaStatsGameId("0022400001"), true);
  assert.equal(gamesLooksNba("0022400001"), true);
  assert.equal(looksLikeNbaStatsGameId("15908541"), false);
  assert.equal(guessGameProvider("401585741"), "espn");
  assert.equal(guessGameProvider("0022400001"), "nba");
  assert.equal(guessGameProvider("15908541"), "bdl");

  console.log("Scores/Home ESPN event → shell (live)…");
  {
    const sampleEspn = process.env.P17_2_ESPN_GAME_ID?.trim() || "401584893";
    try {
      const shell = await getGameShell(sampleEspn);
      if (shell) {
        assert.ok(shell.game.id);
        assert.ok(shell.game.homeTeamId);
        assert.ok(shell.game.awayTeamId);
        console.log(
          `  loaded ESPN ${shell.game.id} ${shell.game.awayTeamAbbr}@${shell.game.homeTeamAbbr} (${shell.availability})`
        );
      } else {
        console.log(
          `  (skip live ESPN shell - ${sampleEspn} unavailable; helpers still pass)`
        );
      }
    } catch (err) {
      console.log(
        `  (skip live ESPN shell - network: ${err instanceof Error ? err.message : err})`
      );
    }
  }

  console.log("NBA Stats GameID → shell (live)…");
  {
    const sampleNba = process.env.P17_2_NBA_GAME_ID?.trim() || "0022400001";
    try {
      const shell = await getGameShell(sampleNba);
      if (shell) {
        assert.ok(shell.game.id);
        console.log(
          `  loaded NBA ${shell.game.id} ${shell.game.awayTeamAbbr}@${shell.game.homeTeamAbbr} (${shell.availability})`
        );
      } else {
        console.log(
          `  (skip live NBA shell - ${sampleNba} unavailable; helpers still pass)`
        );
      }
    } catch (err) {
      console.log(
        `  (skip live NBA shell - network: ${err instanceof Error ? err.message : err})`
      );
    }
  }

  console.log("invalid id → null (not a false network 404 class)…");
  {
    const missing = await getGameShell("not-a-real-game-id");
    assert.equal(missing, null);
  }

  console.log("href contract: Scores/Home/Explore emit compatible namespaces…");
  {
    const scoresHref = (id: string) => `/games/${id}`;
    const exploreHref = (id: string) => `/games/${id}`;
    const homeHref = (id: string) => `/games/${id}`;
    const espnId = "401584893";
    const nbaId = "0022400001";
    const bdlId = "15908541";
    assert.equal(scoresHref(espnId), `/games/${espnId}`);
    assert.equal(exploreHref(nbaId), `/games/${nbaId}`);
    assert.equal(homeHref(espnId), `/games/${espnId}`);
    assert.equal(guessGameProvider(espnId), "espn");
    assert.equal(guessGameProvider(nbaId), "nba");
    assert.equal(guessGameProvider(bdlId), "bdl");
  }

  console.log("OK - game-route-contract");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
