/**
 * Compare IsOnlyCurrentSeason vs careerstats-derived membership for one early season.
 * Also probe LeagueID 01 and historical roster endpoints.
 */
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import {
  statsNbaFetch,
  getResultSet,
  resultSetToObjects,
} from "../src/data/providers/nba/stats-nba-client";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const out: Record<string, unknown> = {};

  for (const leagueId of ["00", "01"]) {
    for (const season of ["1946-47", "1949-50", "1950-51"]) {
      for (const only of ["0", "1"]) {
        try {
          const r = await statsNbaFetch(
            "commonallplayers",
            { LeagueID: leagueId, Season: season, IsOnlyCurrentSeason: only },
            { ttlMs: 0, retries: 1 }
          );
          const set = getResultSet(r);
          const rows = set ? resultSetToObjects(set) : [];
          const year = Number(season.slice(0, 4));
          const fromTo = rows.filter((row) => {
            const from = Number(row.FROM_YEAR);
            const to = Number(row.TO_YEAR);
            return from <= year && to >= year;
          });
          const key = `cap_L${leagueId}_S${season}_only${only}`;
          out[key] = {
            total: rows.length,
            fromTo: fromTo.length,
            withTeam: rows.filter((r) => Number(r.TEAM_ID) > 0).length,
            sample: rows.slice(0, 2),
          };
          console.log(JSON.stringify({ key, total: rows.length, fromTo: fromTo.length }));
        } catch (e) {
          out[`cap_L${leagueId}_S${season}_only${only}`] = { error: String(e) };
          console.log("err", leagueId, season, only, e);
        }
        await sleep(700);
      }
    }
  }

  // Sample career extract for 20 players from 1946-47 FROM/TO
  const all = await statsNbaFetch(
    "commonallplayers",
    { LeagueID: "00", Season: "1946-47", IsOnlyCurrentSeason: "0" },
    { ttlMs: 0, retries: 1 }
  );
  const allRows = resultSetToObjects(getResultSet(all)!);
  const candidates = allRows.filter((row) => {
    const from = Number(row.FROM_YEAR);
    const to = Number(row.TO_YEAR);
    return from <= 1946 && to >= 1946;
  });
  const sampleIds = candidates.slice(0, 25).map((r) => String(r.PERSON_ID));
  const careerHits: Record<string, unknown>[] = [];
  for (const id of sampleIds) {
    const r = await statsNbaFetch(
      "playercareerstats",
      { LeagueID: "00", PerMode: "Totals", PlayerID: id },
      { ttlMs: 0, retries: 1 }
    );
    const set = getResultSet(r, "SeasonTotalsRegularSeason");
    const seasons = set ? resultSetToObjects(set) : [];
    const early = seasons.filter((s) =>
      ["1946-47", "1947-48", "1948-49", "1949-50", "1950-51"].includes(String(s.SEASON_ID))
    );
    careerHits.push({
      id,
      name: candidates.find((c) => String(c.PERSON_ID) === id)?.DISPLAY_FIRST_LAST,
      careerSeasons: seasons.length,
      earlySeasons: early.map((s) => ({
        season: s.SEASON_ID,
        team: s.TEAM_ABBREVIATION,
        gp: s.GP,
        pts: s.PTS,
      })),
    });
    await sleep(600);
  }
  out.careerSample = careerHits;
  const with194647 = careerHits.filter((h) =>
    (h.earlySeasons as any[]).some((s) => s.season === "1946-47")
  ).length;
  out.careerSampleHitRate_1946_47 = `${with194647}/${careerHits.length}`;

  mkdirSync("reports/p18b3", { recursive: true });
  writeFileSync(join("reports/p18b3", "_probe_membership.json"), JSON.stringify(out, null, 2));
  console.log("hitRate", out.careerSampleHitRate_1946_47);
  console.log("wrote _probe_membership.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
