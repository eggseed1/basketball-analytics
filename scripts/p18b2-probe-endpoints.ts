import {
  statsNbaFetch,
  getResultSet,
  resultSetToObjects,
} from "../src/data/providers/nba/stats-nba-client";

async function tryEp(name: string, params: Record<string, string>) {
  try {
    const r = await statsNbaFetch(name, params, { ttlMs: 0, retries: 2 });
    const set = getResultSet(r);
    const rows = set ? resultSetToObjects(set) : [];
    console.log(
      JSON.stringify({
        name,
        n: rows.length,
        headers: set?.headers?.slice(0, 15),
        sample: rows[0],
      })
    );
  } catch (e) {
    console.log(JSON.stringify({ name, error: String(e) }));
  }
}

async function main() {
  await tryEp("commonallplayers", {
    LeagueID: "00",
    Season: "1959-60",
    IsOnlyCurrentSeason: "1",
  });
  await tryEp("leaguedashplayerstats", {
    LeagueID: "00",
    Season: "1959-60",
    SeasonType: "Regular Season",
    PerMode: "Totals",
    MeasureType: "Base",
    PlusMinus: "N",
    PaceAdjust: "N",
    Rank: "N",
  });
  await tryEp("commonteamyears", { LeagueID: "00" });
}

main();
