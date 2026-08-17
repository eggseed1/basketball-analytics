import { NBADataProvider } from "../src/data/providers/nba-data-provider";
import { clearBrefCache } from "../src/data/providers/nba/bref-scraper";
import { clearStatsNbaCache } from "../src/data/providers/nba/stats-nba-client";

async function main() {
  clearStatsNbaCache();
  clearBrefCache();
  const provider = new NBADataProvider();
  console.log("fetching 2024-25 player seasons from stats.nba.com + BRef…");
  const seasons = await provider.getPlayerSeasons("2024-25");
  console.log("players", seasons.length);

  const top = [...seasons]
    .sort((a, b) => b.usagePct - a.usagePct)
    .slice(0, 8);
  for (const row of top) {
    console.log(
      row.playerName.padEnd(28),
      (row.teamAbbreviation ?? "").padEnd(4),
      `USG ${(row.usagePct * 100).toFixed(1)}%`.padEnd(12),
      `TS ${(row.trueShootingPct * 100).toFixed(1)}%`.padEnd(11),
      `PER ${row.per.toFixed(1)}`.padEnd(10),
      `WS ${row.winShares.toFixed(1)}`.padEnd(9),
      `BPM ${row.bpm.toFixed(1)}`
    );
  }

  const lebron = seasons.find((s) => /LeBron/i.test(s.playerName));
  console.log(
    "LeBron",
    lebron && {
      id: lebron.playerId,
      usg: `${(lebron.usagePct * 100).toFixed(1)}%`,
      ts: `${(lebron.trueShootingPct * 100).toFixed(1)}%`,
      per: lebron.per,
      ws: lebron.winShares,
      bpm: lebron.bpm,
      vorp: lebron.vorp,
      ortg: lebron.offensiveRating,
      drtg: lebron.defensiveRating,
      astPct: `${(lebron.assistPct * 100).toFixed(1)}%`,
    }
  );

  if (lebron) {
    const shots = await provider.getShots({
      player: lebron.playerId,
      season: "2024-25",
    });
    console.log("LeBron shots", shots.length);
    const log = await provider.getPlayerGameLog(lebron.playerId, "2024-25");
    console.log("LeBron games", log.length);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
