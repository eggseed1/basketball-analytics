/**
 * Prefetch BallDontLie regular-season games into data/cache/games/.
 *
 *   npm run prefetch:1960s
 *   npx tsx --env-file=.env.local scripts/prefetch-historical-games.ts --from 1960 --to 1969
 */
import { createBallDontLieClient } from "../src/data/providers/balldontlie/client";
import {
  cacheExists,
  writeGamesCache,
} from "../src/data/providers/historical/games-cache";
import { listCanonicalSeasons } from "../src/data/providers/historical/season-range";
import { transformBdlGame } from "../src/data/transformers/balldontlie";

function arg(name: string, fallback: number): number {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && process.argv[idx + 1]) {
    return Number(process.argv[idx + 1]);
  }
  return fallback;
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const from = arg("--from", 1960);
  const to = arg("--to", 1969);
  const force = process.argv.includes("--force");

  const client = createBallDontLieClient();
  if (!client) {
    console.error("BALLDONTLIE_API_KEY missing (use --env-file=.env.local)");
    process.exit(1);
  }

  const seasons = listCanonicalSeasons(from, to);
  console.log(`Prefetching ${seasons.length} seasons (${from}-${to})…`);

  const failed: string[] = [];

  for (const season of seasons) {
    const startYear = Number(season.slice(0, 4));
    if (!force && (await cacheExists(season))) {
      console.log(`skip ${season} (cached)`);
      continue;
    }

    process.stdout.write(`fetch ${season}… `);
    try {
      const rows = await client.paginateAll(
        (cursor) =>
          client.getGames({
            seasons: [startYear],
            seasonType: "regular",
            cursor,
          }),
        // Free tier is strict - keep page pacing slow for deep history.
        { maxPages: 80, delayMs: 1200 }
      );
      const games = rows
        .map(transformBdlGame)
        .sort((a, b) => a.gameDate.localeCompare(b.gameDate));
      if (games.length === 0) {
        console.log("0 games (empty)");
        failed.push(season);
      } else {
        await writeGamesCache(season, games);
        console.log(`${games.length} games`);
      }
    } catch (error) {
      console.log("FAILED");
      console.error(error instanceof Error ? error.message : error);
      failed.push(season);
      console.log("Cooling down 45s…");
      await sleep(45_000);
      continue;
    }
    await sleep(5000);
  }

  if (failed.length) {
    console.log(`\nRetrying ${failed.length} failed seasons after 60s…`);
    await sleep(60_000);
    for (const season of failed) {
      if (await cacheExists(season)) {
        console.log(`skip ${season} (cached)`);
        continue;
      }
      const startYear = Number(season.slice(0, 4));
      process.stdout.write(`retry ${season}… `);
      try {
        const rows = await client.paginateAll(
          (cursor) =>
            client.getGames({
              seasons: [startYear],
              seasonType: "regular",
              cursor,
            }),
          { maxPages: 80, delayMs: 1500 }
        );
        const games = rows
          .map(transformBdlGame)
          .sort((a, b) => a.gameDate.localeCompare(b.gameDate));
        await writeGamesCache(season, games);
        console.log(`${games.length} games`);
      } catch (error) {
        console.log("FAILED");
        console.error(error instanceof Error ? error.message : error);
      }
      await sleep(8000);
    }
  }

  console.log("Done. Cache dir: data/cache/games/");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
