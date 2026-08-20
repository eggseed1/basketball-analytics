import {
  statsNbaFetch,
  getResultSet,
  resultSetToObjects,
} from "../src/data/providers/nba/stats-nba-client";

async function main() {
  const r = await statsNbaFetch(
    "commonallplayers",
    { LeagueID: "00", Season: "1959-60", IsOnlyCurrentSeason: "0" },
    { ttlMs: 0, retries: 2 }
  );
  const set = getResultSet(r);
  const rows = set ? resultSetToObjects(set) : [];
  const inSeason = rows.filter((row) => {
    const from = Number(row.FROM_YEAR);
    const to = Number(row.TO_YEAR);
    return from <= 1959 && to >= 1959;
  });
  console.log(
    JSON.stringify({
      total: rows.length,
      in1959: inSeason.length,
      sample: inSeason.slice(0, 3),
      withTeam: inSeason.filter((r) => Number(r.TEAM_ID) > 0).length,
    })
  );

  // Also try playercareerstats for one player to get season totals
  const id = String(inSeason[0]?.PERSON_ID ?? "");
  if (id) {
    const career = await statsNbaFetch(
      "playercareerstats",
      { PlayerID: id, PerMode: "Totals" },
      { ttlMs: 0, retries: 2 }
    );
    const cset = getResultSet(career, "SeasonTotalsRegularSeason");
    const crows = cset ? resultSetToObjects(cset) : [];
    console.log(
      JSON.stringify({
        playerId: id,
        careerSeasons: crows.length,
        headers: cset?.headers?.slice(0, 20),
        row1959: crows.find((x) => String(x.SEASON_ID).includes("1959")),
      })
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
