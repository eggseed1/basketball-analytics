/**
 * Smoke-test historical + impact HTTP-facing services (no Next server required).
 *
 *   npx tsx scripts/smoke-historical.ts
 */
import { clearDarkoCache, fetchDarkoRatings } from "../src/data/providers/impact/darko-client";
import { loadLebronRatings } from "../src/data/providers/impact/lebron-store";
import { HistoricalNbaService } from "../src/data/providers/historical/historical-nba-service";
import { listCanonicalSeasons } from "../src/data/providers/historical/season-range";

async function main() {
  const service = new HistoricalNbaService();
  const status = service.getStatus();
  console.log("status", status);

  const seasons = listCanonicalSeasons();
  console.log(`seasons ${seasons[0]} → ${seasons[seasons.length - 1]} (${seasons.length})`);

  clearDarkoCache();
  const darko = await fetchDarkoRatings({ force: true });
  console.log(`DARKO players: ${darko.length}; top: ${darko[0]?.playerName} ${darko[0]?.impact}`);

  const lebron = await loadLebronRatings("2024-25");
  console.log(`LEBRON rows (2024-25): ${lebron.length}; top: ${lebron[0]?.playerName} ${lebron[0]?.impact}`);

  const season = "2024-25";
  const players = await service.getPlayerSeasons(season);
  const withBoth = players.filter((p) => p.darkoDpm != null && p.lebron != null);
  console.log(
    `Player seasons ${season}: ${players.length}; with DARKO+LEBRON join: ${withBoth.length}`
  );

  if (status.ballDontLieConfigured) {
    const games = await service.getGames({ season: "1969-70", maxPages: 2 });
    console.log(`1969-70 games (2 pages): ${games.length}`);
    if (games[0]) {
      console.log("sample game", games[0]);
    }
  } else {
    console.log("Skipping BallDontLie game pull - set BALLDONTLIE_API_KEY to exercise 1960s games.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
