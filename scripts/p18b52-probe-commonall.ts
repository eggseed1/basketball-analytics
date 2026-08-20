import {
  statsNbaFetch,
  getResultSet,
  resultSetToObjects,
} from "../src/data/providers/nba/stats-nba-client";

const FIXTURES = ["1642851", "1631255", "1642396", "1642066"];

async function probe(season: string, onlyCurrent: "0" | "1") {
  const r = await statsNbaFetch(
    "commonallplayers",
    {
      LeagueID: "00",
      Season: season,
      IsOnlyCurrentSeason: onlyCurrent,
    },
    { ttlMs: 0, retries: 1 }
  );
  const rows = resultSetToObjects(getResultSet(r)!);
  const hits = rows.filter((x) =>
    FIXTURES.includes(String(x.PERSON_ID))
  );
  console.log(
    JSON.stringify({
      season,
      onlyCurrent,
      rows: rows.length,
      keys: Object.keys(rows[0] ?? {}),
      sample: rows[0],
      fixtures: hits.map((x) => ({
        id: x.PERSON_ID,
        name: x.DISPLAY_FIRST_LAST,
        team: x.TEAM_ID,
        teamAbbr: x.TEAM_ABBREVIATION,
        roster: x.ROSTERSTATUS,
        from: x.FROM_YEAR,
        to: x.TO_YEAR,
      })),
    })
  );
}

async function main() {
  for (const s of ["2023-24", "2024-25", "2025-26"]) {
    try {
      await probe(s, "1");
    } catch (e) {
      console.log(JSON.stringify({ season: s, err: String(e) }));
    }
  }
  try {
    await probe("2025-26", "0");
  } catch (e) {
    console.log(JSON.stringify({ season: "2025-26-all", err: String(e) }));
  }
}

main();
