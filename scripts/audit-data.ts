import { NBADataProvider } from "../src/data/providers/nba-data-provider";
import { clearEspnCache } from "../src/data/providers/nba/espn-client";

async function main() {
  clearEspnCache();
  const p = new NBADataProvider();

  const players = await p.getPlayerSeasons("2024-25");
  const zeroDr = players.filter((s) => s.defensiveRating === 0).length;
  const sga = players.find((s) => /Gilgeous/i.test(s.playerName));
  console.log("players", players.length, "zeroDr", zeroDr);
  console.log("SGA ratings", {
    ortg: sga?.offensiveRating.toFixed(1),
    drtg: sga?.defensiveRating.toFixed(1),
    net: sga?.netRating.toFixed(1),
    usg: ((sga?.usagePct ?? 0) * 100).toFixed(1) + "%",
    ts: ((sga?.trueShootingPct ?? 0) * 100).toFixed(1) + "%",
  });

  const games = await p.getGames("2024-25");
  const playoffs = games.filter((g) => g.gameType === "playoff");
  console.log("games", games.length, "playoffs", playoffs.length, {
    firstPlayoff: playoffs[0]?.gameDate,
    lastPlayoff: playoffs.at(-1)?.gameDate,
  });

  const sampleGame = games.find((g) => g.status === "final")?.id;
  if (sampleGame) {
    const shots = await p.getShots({ gameId: sampleGame });
    console.log("shots for", sampleGame, shots.length, {
      made: shots.filter((s) => s.made).length,
      threes: shots.filter((s) => s.shotType === "3PT").length,
    });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
