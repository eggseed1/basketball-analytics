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
      homeTeam: Record<string, unknown>;
      awayTeam: Record<string, unknown>;
    };
  };
  const h = j.boxScoreTraditional.homeTeam;
  console.log("home.score", h.score);
  console.log("home.statistics", h.statistics);
  console.log(
    "starters",
    JSON.stringify(h.starters, null, 2)?.slice(0, 800)
  );
  const players = h.players as Record<string, unknown>[];
  console.log(
    "with position",
    players.filter((p) => p.position).map((p) => ({
      id: p.personId,
      pos: p.position,
      name: p.nameI,
    }))
  );
}

main();
