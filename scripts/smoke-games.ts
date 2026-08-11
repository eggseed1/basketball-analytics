import { NBADataProvider } from "../src/data/providers/nba-data-provider";
import { applyGameFilters } from "../src/data/queries/filter-utils";
import { clearEspnCache } from "../src/data/providers/nba/espn-client";

async function main() {
  clearEspnCache();
  const provider = new NBADataProvider();
  console.log("loading 2024-25 games…");
  const games = await provider.getGames("2024-25");
  console.log("games", games.length);
  const filtered = applyGameFilters(games, { season: "2024-25" });
  console.log("final with scores", filtered.length);
  console.log(
    "sample",
    filtered.slice(0, 3).map((g) => ({
      date: g.gameDate,
      matchup: `${g.awayTeamAbbr}@${g.homeTeamAbbr}`,
      score: `${g.awayScore}-${g.homeScore}`,
      total: g.totalPoints,
      margin: g.margin,
    }))
  );

  const sampleId = filtered[10]?.id ?? filtered[0]?.id;
  if (!sampleId) return;
  const box = await provider.getGameBoxScore(sampleId);
  console.log("boxscore", {
    id: sampleId,
    players: box?.players.length,
    top: box?.players
      .slice()
      .sort((a, b) => b.points - a.points)
      .slice(0, 3)
      .map((p) => `${p.playerName} ${p.points}`),
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
