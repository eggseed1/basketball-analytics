import { NBADataProvider } from "../src/data/providers/nba-data-provider";
import { clearEspnCache } from "../src/data/providers/nba/espn-client";

async function main() {
  clearEspnCache();
  const provider = new NBADataProvider();
  console.log("fetching 2024-25 player seasons…");
  const seasons = await provider.getPlayerSeasons("2024-25");
  console.log("players", seasons.length);

  const top = [...seasons]
    .sort(
      (a, b) => (b.usagePct ?? -Infinity) - (a.usagePct ?? -Infinity)
    )
    .slice(0, 8);
  for (const row of top) {
    console.log(
      row.playerName.padEnd(28),
      (row.teamAbbreviation ?? row.teamName).padEnd(24),
      `USG ${
        row.usagePct != null ? `${(row.usagePct * 100).toFixed(1)}%` : "—"
      }`.padEnd(12),
      `TS ${
        row.trueShootingPct != null
          ? `${(row.trueShootingPct * 100).toFixed(1)}%`
          : "—"
      }`.padEnd(11),
      `MIN ${Math.round(row.minutes)}`,
      row.per != null ? `PER ${row.per.toFixed(1)}` : ""
    );
  }

  const raptor = seasons.find((s) => /LeBron/i.test(s.playerName));
  const sga = seasons.find((s) => /Gilgeous/i.test(s.playerName));
  console.log(
    "LeBron",
    raptor && {
      id: raptor.playerId,
      usg:
        raptor.usagePct != null
          ? `${(raptor.usagePct * 100).toFixed(1)}%`
          : "—",
      ts:
        raptor.trueShootingPct != null
          ? `${(raptor.trueShootingPct * 100).toFixed(1)}%`
          : "—",
      per: raptor.per,
      gp: raptor.gamesPlayed,
      pts: raptor.points,
    }
  );
  console.log(
    "SGA",
    sga && {
      id: sga.playerId,
      usg:
        sga.usagePct != null ? `${(sga.usagePct * 100).toFixed(1)}%` : "—",
      ts:
        sga.trueShootingPct != null
          ? `${(sga.trueShootingPct * 100).toFixed(1)}%`
          : "—",
      efg:
        sga.effectiveFieldGoalPct != null
          ? `${(sga.effectiveFieldGoalPct * 100).toFixed(1)}%`
          : "—",
      gp: sga.gamesPlayed,
      pts: sga.points,
    }
  );

  if (raptor) {
    const shots = await provider.getShots({
      player: raptor.playerId,
      season: "2024-25",
    });
    console.log("LeBron shots", shots.length);
    const log = await provider.getPlayerGameLog(raptor.playerId, "2024-25");
    console.log("LeBron games", log.length);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
