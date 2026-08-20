/**
 * P18B.3 — validate commonallplayers season membership + careerstats for BAA IDs.
 */
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const UA = "Mozilla/5.0 (compatible; basketball-analytics/p18b3)";
const H = {
  "User-Agent": UA,
  Referer: "https://www.nba.com/",
  Accept: "application/json",
};

async function getJson(url: string) {
  const r = await fetch(url, { headers: H });
  const t = await r.text();
  try {
    return { status: r.status, j: JSON.parse(t) as any };
  } catch {
    return { status: r.status, j: null, preview: t.slice(0, 200) };
  }
}

function rowsOf(j: any, name?: string) {
  const sets = j?.resultSets ?? [];
  const set = name ? sets.find((s: any) => s.name === name) : sets[0];
  if (!set) return { headers: [] as string[], rows: [] as any[][] };
  return { headers: set.headers as string[], rows: set.rowSet as any[][] };
}

function objectify(headers: string[], row: any[]) {
  const o: Record<string, unknown> = {};
  headers.forEach((h, i) => {
    o[h] = row[i];
  });
  return o;
}

async function main() {
  const seasons = ["1946-47", "1947-48", "1948-49", "1949-50", "1950-51"];
  const out: any = { seasons: {}, careerSamples: [], nbaIds: {} };

  for (const season of seasons) {
    const url =
      "https://stats.nba.com/stats/commonallplayers?" +
      new URLSearchParams({
        LeagueID: "00",
        Season: season,
        IsOnlyCurrentSeason: "1",
      }).toString();
    const r = await getJson(url);
    const { headers, rows } = rowsOf(r.j, "CommonAllPlayers");
    const objs = rows.map((row) => objectify(headers, row));
    // IsOnlyCurrentSeason=1 should already filter; also compute FROM/TO membership
    const startY = Number(season.slice(0, 4));
    const byFromTo = objs.filter((p) => {
      const from = Number(p.FROM_YEAR);
      const to = Number(p.TO_YEAR);
      return Number.isFinite(from) && Number.isFinite(to) && from <= startY && to >= startY;
    });
    const uniqueIds = new Set(objs.map((p) => String(p.PERSON_ID)));
    out.seasons[season] = {
      status: r.status,
      commonallplayers_rows: objs.length,
      unique_person_ids: uniqueIds.size,
      from_to_membership: byFromTo.length,
      sample: objs.slice(0, 3),
      teams: [...new Set(objs.map((p) => `${p.TEAM_ABBREVIATION}|${p.TEAM_CITY} ${p.TEAM_NAME}`))].sort(),
    };
    console.log(
      JSON.stringify({
        season,
        rows: objs.length,
        unique: uniqueIds.size,
        fromTo: byFromTo.length,
        teams: out.seasons[season].teams.length,
      })
    );
    await new Promise((r) => setTimeout(r, 700));
  }

  // Career samples for known early IDs
  const ids = [
    ["76007", "Abramovic"],
    ["76056", "Arizin"],
    ["76060", "Armstrong"],
    ["1717", "possible_wrong_dirk_collision"],
    ["959", "possible_nash_collision"],
    ["2072", "possible_redd_collision"],
  ] as const;
  for (const [id, label] of ids) {
    const r = await getJson(
      `https://stats.nba.com/stats/playercareerstats?LeagueID=00&PerMode=Totals&PlayerID=${id}`
    );
    const { headers, rows } = rowsOf(r.j, "SeasonTotalsRegularSeason");
    const seasonsList = rows.map((row) => objectify(headers, row));
    out.careerSamples.push({
      id,
      label,
      status: r.status,
      seasonCount: seasonsList.length,
      seasons: seasonsList.map((s) => ({
        season: s.SEASON_ID,
        team: s.TEAM_ABBREVIATION,
        gp: s.GP,
        pts: s.PTS,
        reb: s.REB,
        ast: s.AST,
      })),
    });
    console.log(JSON.stringify({ id, label, seasons: seasonsList.length, first: seasonsList[0]?.SEASON_ID, last: seasonsList.at(-1)?.SEASON_ID }));
    await new Promise((r) => setTimeout(r, 700));
  }

  // Resolve Nash/Dirk/Redd NBA PERSON_IDs via commonplayerinfo / search
  for (const [name, espnHint] of [
    ["Steve Nash", "959"],
    ["Dirk Nowitzki", "1717"],
    ["Michael Redd", "2072"],
  ] as const) {
    // use commonallplayers without season filter? Season=2023-24 IsOnlyCurrentSeason=0 returns all historical
    const url =
      "https://stats.nba.com/stats/commonallplayers?" +
      new URLSearchParams({ LeagueID: "00", Season: "2013-14", IsOnlyCurrentSeason: "0" }).toString();
    // only fetch once cached
    if (!out._allPlayers) {
      const r = await getJson(url);
      const { headers, rows } = rowsOf(r.j, "CommonAllPlayers");
      out._allPlayers = rows.map((row) => objectify(headers, row));
      console.log("allPlayers", out._allPlayers.length);
    }
    const hits = (out._allPlayers as any[]).filter(
      (p) => String(p.DISPLAY_FIRST_LAST).toLowerCase() === name.toLowerCase()
    );
    out.nbaIds[name] = hits.map((p) => ({
      PERSON_ID: p.PERSON_ID,
      FROM: p.FROM_YEAR,
      TO: p.TO_YEAR,
      TEAM: p.TEAM_ABBREVIATION,
      espnHint,
    }));
    console.log(JSON.stringify({ name, hits: out.nbaIds[name] }));
  }

  // HEAD check correct NBA IDs
  const knownNba = [
    ["nash_nba", "https://cdn.nba.com/headshots/nba/latest/260x190/947.png"], // guess - will fix from hits
  ];
  void knownNba;

  delete out._allPlayers;
  mkdirSync("reports/p18b3", { recursive: true });
  writeFileSync(join("reports/p18b3", "_probe_commonall.json"), JSON.stringify(out, null, 2));
  console.log("wrote reports/p18b3/_probe_commonall.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
