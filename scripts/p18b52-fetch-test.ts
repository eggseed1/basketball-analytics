async function main() {
  const url =
    "https://stats.nba.com/stats/commonallplayers?LeagueID=00&Season=2025-26&IsOnlyCurrentSeason=1";
  console.log("fetching...");
  const r = await fetch(url, {
    headers: {
      Accept: "application/json",
      Origin: "https://www.nba.com",
      Referer: "https://www.nba.com/",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "x-nba-stats-origin": "stats",
      "x-nba-stats-token": "true",
    },
    signal: AbortSignal.timeout(25000),
  });
  console.log("status", r.status);
  const text = await r.text();
  console.log("len", text.length);
  const j = JSON.parse(text);
  const set = j.resultSets?.[0];
  console.log("rows", set?.rowSet?.length);
  const idx = set.headers.indexOf("PERSON_ID");
  const nameIdx = set.headers.indexOf("DISPLAY_FIRST_LAST");
  for (const id of ["1642851", "1631255", "1642396", "1642066"]) {
    const row = set.rowSet.find((x: any[]) => String(x[idx]) === id);
    console.log(id, row ? row[nameIdx] : "MISSING");
  }
}

main().catch((e) => {
  console.error("ERR", e);
  process.exit(1);
});
