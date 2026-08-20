/**
 * Probe 1946-51 season sources + known player IDs for media QA.
 */
import {
  statsNbaFetch,
  getResultSet,
  resultSetToObjects,
} from "../src/data/providers/nba/stats-nba-client";
import { getMasterPlayerRegistry } from "../src/data/history/player-universe";

const SEASONS = [
  "1946-47",
  "1947-48",
  "1948-49",
  "1949-50",
  "1950-51",
];

async function leaders(season: string) {
  try {
    const r = await statsNbaFetch(
      "leagueleaders",
      {
        LeagueID: "00",
        PerMode: "Totals",
        Scope: "S",
        Season: season,
        SeasonType: "Regular Season",
        StatCategory: "PTS",
      },
      { ttlMs: 0, retries: 2 }
    );
    const set = getResultSet(r);
    const rows = set ? resultSetToObjects(set) : [];
    return { season, endpoint: "leagueleaders", n: rows.length, sample: rows[0] };
  } catch (e) {
    return { season, endpoint: "leagueleaders", error: String(e) };
  }
}

async function allPlayers(season: string) {
  try {
    const year = Number(season.slice(0, 4));
    const r = await statsNbaFetch(
      "commonallplayers",
      { LeagueID: "00", Season: season, IsOnlyCurrentSeason: "0" },
      { ttlMs: 0, retries: 2 }
    );
    const set = getResultSet(r);
    const rows = set ? resultSetToObjects(set) : [];
    const inSeason = rows.filter((row) => {
      const from = Number(row.FROM_YEAR);
      const to = Number(row.TO_YEAR);
      return from <= year && to >= year;
    });
    return {
      season,
      endpoint: "commonallplayers",
      total: rows.length,
      inSeason: inSeason.length,
      sample: inSeason[0],
    };
  } catch (e) {
    return { season, endpoint: "commonallplayers", error: String(e) };
  }
}

async function main() {
  console.log("BDL_KEY", process.env.BALLDONTLIE_API_KEY ? "yes" : "no");
  for (const s of SEASONS) {
    console.log(JSON.stringify(await leaders(s)));
    await new Promise((r) => setTimeout(r, 800));
    console.log(JSON.stringify(await allPlayers(s)));
    await new Promise((r) => setTimeout(r, 800));
  }

  const master = getMasterPlayerRegistry();
  const names = ["Steve Nash", "Dirk Nowitzki", "Michael Redd"];
  for (const name of names) {
    const hits = master.filter(
      (p) => p.displayName.toLowerCase() === name.toLowerCase()
    );
    console.log(
      JSON.stringify({
        name,
        hits: hits.map((h) => ({
          id: h.playerId,
          span: `${h.firstSeason}→${h.lastSeason}`,
        })),
      })
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
