/**
 * P18PERF.0 — server data-path timings (no Next HTML render).
 * Measures read/parse/lookup for hot loaders used by representative routes.
 */
import { performance } from "node:perf_hooks";
import { mkdirSync, writeFileSync, statSync, existsSync } from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "reports", "p18perf0");
mkdirSync(OUT, { recursive: true });

function ms(n: number) {
  return Math.round(n * 10) / 10;
}

async function time<T>(
  label: string,
  fn: () => T | Promise<T>
): Promise<{ label: string; ms: number; meta?: string }> {
  const t0 = performance.now();
  const result = await fn();
  const elapsed = performance.now() - t0;
  let meta = "";
  if (Array.isArray(result)) meta = `rows=${result.length}`;
  else if (result && typeof result === "object") {
    const o = result as Record<string, unknown>;
    if (Array.isArray(o.rows)) meta = `rows=${o.rows.length}`;
    else if ("length" in o) meta = `len=${String(o.length)}`;
  }
  console.log(`${label}: ${ms(elapsed)}ms ${meta}`);
  return { label, ms: ms(elapsed), meta };
}

async function main() {
  const rows: { label: string; ms: number; meta?: string }[] = [];

  // Dynamic imports so cold module costs are included per section.
  {
    const { clearPlayerUniverseCaches, getMasterPlayerRegistry, getSeasonPlayerUniverse } =
      await import("../src/data/history/player-universe");
    clearPlayerUniverseCaches();
    rows.push(
      await time("master-registry-cold", () => getMasterPlayerRegistry())
    );
    rows.push(
      await time("master-registry-warm", () => getMasterPlayerRegistry())
    );
    rows.push(
      await time("season-universe-2024-25-cold", () =>
        getSeasonPlayerUniverse("2024-25")
      )
    );
    rows.push(
      await time("season-universe-2005-06", () =>
        getSeasonPlayerUniverse("2005-06")
      )
    );
  }

  {
    const mod = await import("../src/data/history/player-career");
    rows.push(
      await time("player-seasons-index-cold", () =>
        mod.getHistoryPlayerSeasons()
      )
    );
    rows.push(
      await time("career-summaries-cold", () =>
        mod.getHistoryCareerSummaries()
      )
    );
    rows.push(
      await time("history-player-games-dirk-2005-06", () =>
        mod.getHistoryPlayerGames("1717", "2005-06", { limit: 100 })
      )
    );
    rows.push(
      await time("history-player-games-dirk-2005-06-repeat", () =>
        mod.getHistoryPlayerGames("1717", "2005-06", { limit: 100 })
      )
    );
  }

  {
    const { getHistoricalProductGame, getHistoricalGameSummaries } =
      await import("../src/data/history/product");
    const sumPath = path.join(
      process.cwd(),
      "data/drbl/history/drbl-history-v1/2005-06/game-summaries.json"
    );
    if (existsSync(sumPath)) {
      rows.push({
        label: "artifact-size-game-summaries-2005-06",
        ms: 0,
        meta: `bytes=${statSync(sumPath).size}`,
      });
    }
    rows.push(
      await time("game-summaries-2005-06", () =>
        getHistoricalGameSummaries("2005-06")
      )
    );
    rows.push(
      await time("product-game-0020500001", () =>
        getHistoricalProductGame("0020500001", "2005-06")
      )
    );
  }

  {
    const { loadRawArchiveShotEvents } = await import(
      "../src/data/history/raw-archive-shots"
    );
    rows.push(
      await time("raw-pbp-shots-0020500001", () =>
        loadRawArchiveShotEvents("0020500001")
      )
    );
    rows.push(
      await time("raw-pbp-shots-0020500001-repeat", () =>
        loadRawArchiveShotEvents("0020500001")
      )
    );
  }

  {
    const { searchMasterPlayers } = await import(
      "../src/data/history/player-universe"
    );
    rows.push(
      await time("search-master-Knueppel", () =>
        searchMasterPlayers("Knueppel", 20)
      )
    );
  }

  {
    const { getExplorePlayersBoardView } = await import(
      "../src/data/queries/explore-players-board"
    );
    rows.push(
      await time("explore-board-2024-25-page1", () =>
        getExplorePlayersBoardView({
          filters: { season: "2024-25" },
          page: 1,
        })
      )
    );
    rows.push(
      await time("explore-board-2005-06-page1", () =>
        getExplorePlayersBoardView({
          filters: { season: "2005-06" },
          page: 1,
        })
      )
    );
  }

  const csv = [
    "label,ms,meta",
    ...rows.map(
      (r) =>
        `${r.label},${r.ms},"${(r.meta ?? "").replace(/"/g, '""')}"`
    ),
  ].join("\n");
  writeFileSync(path.join(OUT, "04_server_timing_baseline.csv"), csv + "\n");
  writeFileSync(
    path.join(OUT, "server_timing_baseline.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2)
  );
  console.log("Wrote 04_server_timing_baseline.csv");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
