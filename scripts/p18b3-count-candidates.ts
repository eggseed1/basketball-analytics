import {
  statsNbaFetch,
  getResultSet,
  resultSetToObjects,
} from "../src/data/providers/nba/stats-nba-client";

async function main() {
  const r = await statsNbaFetch(
    "commonallplayers",
    { LeagueID: "00", Season: "1950-51", IsOnlyCurrentSeason: "0" },
    { ttlMs: 0, retries: 1 }
  );
  const rows = resultSetToObjects(getResultSet(r)!);
  const ids = new Set<string>();
  for (const row of rows) {
    const from = Number(row.FROM_YEAR);
    const to = Number(row.TO_YEAR);
    if (from <= 1950 && to >= 1946) ids.add(String(row.PERSON_ID));
  }
  console.log("unique_1946_51_candidates", ids.size);
  for (const y of [1946, 1947, 1948, 1949, 1950]) {
    const s = `${y}-${String(y + 1).slice(-2)}`;
    const n = rows.filter(
      (row) => Number(row.FROM_YEAR) <= y && Number(row.TO_YEAR) >= y
    ).length;
    console.log(s, n);
  }
}

main();
