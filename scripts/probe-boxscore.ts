const headers = {
  Accept: "application/json, text/plain, */*",
  Origin: "https://www.nba.com",
  Referer: "https://www.nba.com/",
  "User-Agent":
    "Mozilla/5.0 (compatible; BasketballAnalytics-DRBL/0.1; educational)",
  "x-nba-stats-origin": "stats",
  "x-nba-stats-token": "true",
};

const gid = process.argv[2] ?? "0029600012";

async function tryUrl(label: string, url: string) {
  try {
    const r = await fetch(url, { headers });
    const t = await r.text();
    console.log(label, r.status, t.slice(0, 180).replace(/\n/g, " "));
    if (!r.ok) return;
    const j = JSON.parse(t) as Record<string, unknown>;
    console.log(label, "topKeys", Object.keys(j));
    if (j.game && typeof j.game === "object") {
      console.log(label, "gameKeys", Object.keys(j.game as object));
      const game = j.game as {
        homeTeam?: { players?: unknown[]; score?: number; teamId?: number };
        awayTeam?: { players?: unknown[]; score?: number; teamId?: number };
      };
      console.log(label, {
        home: game.homeTeam?.teamId,
        away: game.awayTeam?.teamId,
        hs: game.homeTeam?.score,
        as: game.awayTeam?.score,
        hp: game.homeTeam?.players?.length,
        ap: game.awayTeam?.players?.length,
      });
    }
    if (Array.isArray(j.resultSets)) {
      console.log(
        label,
        "resultSets",
        (j.resultSets as { name: string; rowSet: unknown[] }[]).map((x) => ({
          name: x.name,
          rows: x.rowSet?.length,
        }))
      );
    }
  } catch (e) {
    console.log(label, "ERR", e);
  }
}

async function main() {
  await tryUrl(
    "v3",
    `https://stats.nba.com/stats/boxscoretraditionalv3?GameID=${gid}&StartPeriod=0&EndPeriod=14`
  );
  await tryUrl(
    "v2",
    `https://stats.nba.com/stats/boxscoretraditionalv2?GameID=${gid}&StartPeriod=0&EndPeriod=14&StartRange=0&EndRange=0&RangeType=0`
  );
  await tryUrl(
    "summary",
    `https://stats.nba.com/stats/boxscoresummaryv2?GameID=${gid}`
  );
}

main();
