import { performance } from "node:perf_hooks";
import { NBADataProvider } from "../src/data/providers/nba-data-provider";
import { clearBrefCache } from "../src/data/providers/nba/bref-scraper";
import { clearStatsNbaCache } from "../src/data/providers/nba/stats-nba-client";

async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t0 = performance.now();
  const value = await fn();
  console.log(label, `${Math.round(performance.now() - t0)}ms`);
  return value;
}

async function main() {
  clearStatsNbaCache();
  clearBrefCache();
  const provider = new NBADataProvider();

  await timed("cold seasons 2024-25", () =>
    provider.getPlayerSeasons("2024-25")
  );
  await timed("warm seasons 2024-25", () =>
    provider.getPlayerSeasons("2024-25")
  );
  await timed("default getPlayerSeasons() 2 seasons", () =>
    provider.getPlayerSeasons()
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
