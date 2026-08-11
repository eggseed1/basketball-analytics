import { NBADataProvider } from "../src/data/providers/nba-data-provider";
import { clearEspnCache } from "../src/data/providers/nba/espn-client";

async function main() {
  clearEspnCache();
  const provider = new NBADataProvider();
  console.log("fetching 2024-25 player seasons…");
  const seasons = await provider.getPlayerSeasons("2024-25");
  console.log("players", seasons.length);

  const top = [...seasons]
    .sort((a, b) => b.usagePct - a.usagePct)
    .slice(0, 8);
  for (const row of top) {
    console.log(
      row.playerName.padEnd(28),
      row.teamName.padEnd(24),
      `USG ${(row.usagePct * 100).toFixed(1)}%`.padEnd(12),
      `TS ${(row.trueShootingPct * 100).toFixed(1)}%`.padEnd(11),
      `MIN ${Math.round(row.minutes)}`
    );
  }

  const sga = seasons.find((s) => /Gilgeous/i.test(s.playerName));
  console.log(
    "SGA",
    sga && {
      id: sga.playerId,
      usg: `${(sga.usagePct * 100).toFixed(1)}%`,
      ts: `${(sga.trueShootingPct * 100).toFixed(1)}%`,
      efg: `${(sga.effectiveFieldGoalPct * 100).toFixed(1)}%`,
      gp: sga.gamesPlayed,
      pts: sga.points,
    }
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
