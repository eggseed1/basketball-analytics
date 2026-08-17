const headers = {
  Accept: "application/json",
  Origin: "https://www.nba.com",
  Referer: "https://www.nba.com/",
  "User-Agent": "Mozilla/5.0",
  "x-nba-stats-origin": "stats",
  "x-nba-stats-token": "true",
};

async function main() {
  const r = await fetch(
    "https://stats.nba.com/stats/boxscoretraditionalv3?GameID=0029600012&StartPeriod=0&EndPeriod=14",
    { headers }
  );
  const j = (await r.json()) as {
    boxScoreTraditional: {
      gameId: string;
      homeTeam: Record<string, unknown>;
      awayTeam: Record<string, unknown>;
    };
  };
  const b = j.boxScoreTraditional;
  console.log("keys", Object.keys(b));
  console.log("home", Object.keys(b.homeTeam || {}));
  console.log("away", Object.keys(b.awayTeam || {}));
  const players = (b.homeTeam.players as Record<string, unknown>[]) ?? [];
  console.log("nPlayers", players.length);
  console.log("player0keys", players[0] && Object.keys(players[0]));
  console.log(
    JSON.stringify(
      {
        gameId: b.gameId,
        homeId: b.homeTeam.teamId,
        awayId: b.awayTeam.teamId,
        hs: b.homeTeam.score,
        as: b.awayTeam.score,
        sample: players[0],
      },
      null,
      2
    )
  );
}

main();
