/**
 * P18PERF smoke — P18PERF.0 + P18PERF.1 history budgets.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";

import {
  clearHistoryCareerCaches,
  getHistoryPlayerGames,
} from "../src/data/history/player-career";
import { EXPLORE_PLAYERS_PAGE_SIZE } from "../src/data/queries/explore-players-board";
import { HISTORY_GAMES_PAGE_SIZE } from "../src/lib/history/history-season-page";

function main() {
  assert.ok(
    EXPLORE_PLAYERS_PAGE_SIZE <= 50,
    `directory page size ${EXPLORE_PLAYERS_PAGE_SIZE} exceeds budget 50`
  );
  assert.ok(
    HISTORY_GAMES_PAGE_SIZE <= 50,
    `history game page size ${HISTORY_GAMES_PAGE_SIZE} exceeds budget 50`
  );

  const historyPage = readFileSync(
    path.join(process.cwd(), "src/app/history/[season]/page.tsx"),
    "utf8"
  );
  assert.ok(
    historyPage.includes("HISTORY_GAMES_PAGE_SIZE"),
    "history page must define bounded game page size"
  );
  assert.ok(
    historyPage.includes("toCompactRow"),
    "history page must compact game rows"
  );
  assert.ok(
    historyPage.includes("prefetch={false}"),
    "dense history links must disable prefetch"
  );
  assert.equal(
    /sorted\.map\(\(g\)/.test(historyPage),
    false,
    "must not map full sorted game list into DOM"
  );

  const clientSurface = readFileSync(
    path.join(
      process.cwd(),
      "src/components/players/historical-career-surface.tsx"
    ),
    "utf8"
  );
  assert.equal(
    clientSurface.includes('from "@/data/history/player-career"'),
    false,
    "client surface must not import server player-career loader"
  );

  clearHistoryCareerCaches();
  const t0 = performance.now();
  getHistoryPlayerGames("1717", "2005-06", { limit: 50 });
  const cold = performance.now() - t0;
  const t1 = performance.now();
  getHistoryPlayerGames("1717", "2005-06", { limit: 50 });
  const warm = performance.now() - t1;
  assert.ok(warm < 5, `warm player-games should be <5ms, got ${warm}`);
  assert.ok(
    warm < cold * 0.25 || warm < 2,
    `warm (${warm}) should be much faster than cold (${cold})`
  );

  console.log("p18perf-smoke: ok", {
    explorePageSize: EXPLORE_PLAYERS_PAGE_SIZE,
    historyGamesPageSize: HISTORY_GAMES_PAGE_SIZE,
    coldMs: +cold.toFixed(1),
    warmMs: +warm.toFixed(1),
  });
}

main();
