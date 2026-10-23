/**
 * Bake the default Explore Players first page for cold MISS.
 *
 *   DATA_PROVIDER=nba npx tsx scripts/build-explore-players-first-page.ts
 */
import { writeFileSync } from "node:fs";
import path from "node:path";

import {
  EXPLORE_PLAYERS_PAGE_SIZE,
  getExplorePlayersBoardView,
} from "../src/data/queries/explore-players-board";
import { listCanonicalSeasons } from "../src/data/providers/historical/season-range";
import { DEFAULT_PLAYER_BOARD_VIEWS } from "../src/lib/explore-players-display";
import {
  defaultExploreMinimumMinutes,
  defaultExplorePlayersSeason,
  isBundledPeerBoardReady,
} from "../src/lib/player-board-season";

async function boardReadySeasons(): Promise<string[]> {
  try {
    const { getBundledBrefPeerBoard } = await import(
      "../src/data/runtime/bref-advanced-snapshot"
    );
    return listCanonicalSeasons().filter((season) =>
      isBundledPeerBoardReady(season, getBundledBrefPeerBoard(season).length)
    );
  } catch {
    return [];
  }
}

async function main() {
  // Rebuild must not short-circuit on the previous bake.
  process.env.SKIP_EXPLORE_FIRST_PAGE = "1";

  const available = listCanonicalSeasons();
  const ready = await boardReadySeasons();
  const season = defaultExplorePlayersSeason(available, new Date(), {
    boardReadySeasons: ready,
  });
  const minimumMinutes = defaultExploreMinimumMinutes(season);

  console.log(
    `[explore-first-page] baking season=${season} minMinutes=${minimumMinutes}`
  );

  const view = await getExplorePlayersBoardView({
    filters: { season, minimumMinutes },
    page: 1,
    pageSize: EXPLORE_PLAYERS_PAGE_SIZE,
    boardViews: [...DEFAULT_PLAYER_BOARD_VIEWS],
    includeContext: false,
  });

  if (!view.rows.length) {
    throw new Error(`empty first page for ${season}`);
  }

  const out = {
    version: 1,
    generatedAt: new Date().toISOString(),
    key: {
      season,
      minimumMinutes,
      sortKey: view.sortKey,
      sortDir: view.sortDir,
      pageSize: view.pageSize,
      rate: "perGame" as const,
      boardViews: [...DEFAULT_PLAYER_BOARD_VIEWS],
    },
    view,
  };

  const dest = path.join(
    process.cwd(),
    "src/data/runtime/explore-players-first-page.json"
  );
  writeFileSync(dest, `${JSON.stringify(out)}\n`);
  console.log(
    `[explore-first-page] wrote ${dest} rows=${view.rows.length} total=${view.totalCount} sort=${view.sortKey}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
