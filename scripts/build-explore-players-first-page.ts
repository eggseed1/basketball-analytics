/**
 * Bake the default Explore Players first page for cold MISS.
 *
 * Must read the bundled season-tables peer board (same path as Cloudflare),
 * not live ESPN — the site API often lags opening-night box scores and would
 * freeze a stale first page into the Worker.
 *
 *   node --require ./scripts/lib/stub-server-only.cjs --import tsx scripts/build-explore-players-first-page.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  EXPLORE_PLAYERS_PAGE_SIZE,
  getExplorePlayersBoardView,
} from "../src/data/queries/explore-players-board";
import { getBundledBrefPeerBoard } from "../src/data/runtime/bref-advanced-snapshot";
import { listCanonicalSeasons } from "../src/data/providers/historical/season-range";
import { DEFAULT_PLAYER_BOARD_VIEWS } from "../src/lib/explore-players-display";
import {
  defaultExploreMinimumMinutes,
  defaultExplorePlayersSeason,
  isBundledPeerBoardReady,
} from "../src/lib/player-board-season";

/**
 * Count peer-board rows from the on-disk season-tables snapshot without
 * importing the server-only BRef module (tsx scripts cannot load it).
 */
function seasonTablesPeerRowCount(season: string): number {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs") as typeof import("node:fs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pathMod = require("node:path") as typeof import("node:path");
    const file = pathMod.join(
      process.cwd(),
      "src/data/runtime/season-tables-snapshot.json"
    );
    if (!fs.existsSync(file)) return 0;
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as {
      seasons?: Record<string, { advanced?: unknown[]; perGame?: unknown[] }>;
    };
    const block = raw.seasons?.[season];
    if (!block) return 0;
    return Math.max(block.advanced?.length ?? 0, block.perGame?.length ?? 0);
  } catch {
    return 0;
  }
}

function boardReadySeasons(): string[] {
  return listCanonicalSeasons().filter((season) =>
    isBundledPeerBoardReady(season, seasonTablesPeerRowCount(season))
  );
}

async function main() {
  process.env.SKIP_EXPLORE_FIRST_PAGE = "1";

  const available = listCanonicalSeasons();
  const ready = boardReadySeasons();
  const season = defaultExplorePlayersSeason(available, new Date(), {
    boardReadySeasons: ready,
  });
  const minimumMinutes = defaultExploreMinimumMinutes(season);

  const bundled = getBundledBrefPeerBoard(season);
  if (!isBundledPeerBoardReady(season, bundled.length)) {
    throw new Error(
      `season-tables peer board not ready for ${season} (n=${bundled.length}); refuse ESPN first-page bake`
    );
  }

  console.log(
    `[explore-first-page] baking season=${season} minMinutes=${minimumMinutes} bundled=${bundled.length} ready=${ready.slice(0, 5).join(",")}${ready.length > 5 ? "…" : ""}`
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

  const bakeMaxGp = Math.max(0, ...view.rows.map((r) => r.gamesPlayed ?? 0));
  const tablesMaxGp = Math.max(0, ...bundled.map((r) => r.gamesPlayed ?? 0));
  if (tablesMaxGp > 0 && bakeMaxGp < tablesMaxGp) {
    throw new Error(
      `first-page bake is behind season-tables (bake max GP ${bakeMaxGp} < tables ${tablesMaxGp}); refusing stale ESPN snapshot`
    );
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

  const body = `${JSON.stringify(out)}\n`;
  const dest = path.join(
    process.cwd(),
    "src/data/runtime/explore-players-first-page.json"
  );
  const publicDest = path.join(
    process.cwd(),
    "public/runtime/explore-players-first-page.json"
  );
  writeFileSync(dest, body);
  mkdirSync(path.dirname(publicDest), { recursive: true });
  writeFileSync(publicDest, body);
  console.log(
    `[explore-first-page] wrote ${publicDest} rows=${view.rows.length} total=${view.totalCount} sort=${view.sortKey} maxGp=${bakeMaxGp} (src mirror ${dest})`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
