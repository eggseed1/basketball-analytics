/**
 * P18B.3 — probe season-stat endpoints + image HEAD for 1946-51 / media QA.
 */
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const UA = "Mozilla/5.0 (compatible; basketball-analytics/p18b3)";
const H = {
  "User-Agent": UA,
  Referer: "https://www.nba.com/",
  Accept: "application/json",
  "Accept-Language": "en-US,en;q=0.9",
};

async function getJson(url: string) {
  const r = await fetch(url, { headers: H });
  const t = await r.text();
  try {
    return { status: r.status, j: JSON.parse(t) as Record<string, unknown> };
  } catch {
    return { status: r.status, j: null, preview: t.slice(0, 240) };
  }
}

function summarize(j: Record<string, unknown> | null) {
  if (!j) return null;
  const sets = (j.resultSets ?? j.resultSet) as
    | Array<{ name?: string; headers?: string[]; rowSet?: unknown[][] }>
    | { name?: string; headers?: string[]; rowSet?: unknown[][] }
    | undefined;
  const arr = Array.isArray(sets) ? sets : sets ? [sets] : [];
  return arr.map((s) => ({
    name: s?.name,
    rows: s?.rowSet?.length ?? 0,
    headers: (s?.headers ?? []).slice(0, 24),
    sample: s?.rowSet?.[0] ?? null,
  }));
}

async function main() {
  const out: unknown[] = [];
  const seasons = ["1946-47", "1947-48", "1948-49", "1949-50", "1950-51"];

  for (const season of seasons) {
    const dash =
      "https://stats.nba.com/stats/leaguedashplayerstats?" +
      new URLSearchParams({
        College: "",
        Conference: "",
        Country: "",
        DateFrom: "",
        DateTo: "",
        Division: "",
        DraftPick: "",
        DraftYear: "",
        GameScope: "",
        GameSegment: "",
        Height: "",
        LastNGames: "0",
        LeagueID: "00",
        Location: "",
        MeasureType: "Base",
        Month: "0",
        OpponentTeamID: "0",
        Outcome: "",
        PORound: "0",
        PaceAdjust: "N",
        Period: "0",
        PerMode: "Totals",
        PlayerExperience: "",
        PlayerPosition: "",
        PlusMinus: "N",
        Rank: "N",
        Season: season,
        SeasonSegment: "",
        SeasonType: "Regular Season",
        ShotClockRange: "",
        StarterBench: "",
        TeamID: "0",
        VsConference: "",
        VsDivision: "",
        Weight: "",
      }).toString();
    const r = await getJson(dash);
    out.push({ season, endpoint: "leaguedashplayerstats", status: r.status, sets: summarize(r.j) });
    console.log(JSON.stringify({ season, endpoint: "leaguedashplayerstats", status: r.status, rows: (summarize(r.j) ?? [])[0]?.rows ?? 0 }));
    await new Promise((r) => setTimeout(r, 800));
  }

  // career stats for early PERSON_ID
  const career = await getJson(
    "https://stats.nba.com/stats/playercareerstats?LeagueID=00&PerMode=Totals&PlayerID=76001"
  );
  out.push({ endpoint: "playercareerstats", playerId: 76001, status: career.status, sets: summarize(career.j) });
  console.log(JSON.stringify({ endpoint: "playercareerstats", status: career.status, sets: summarize(career.j) }, null, 2));

  const info = await getJson("https://stats.nba.com/stats/commonplayerinfo?PlayerID=76001");
  out.push({ endpoint: "commonplayerinfo", playerId: 76001, status: info.status, sets: summarize(info.j) });

  // image HEAD checks — ESPN vs NBA ID namespace collision
  const imgs = [
    ["espn_dirk", "https://a.espncdn.com/i/headshots/nba/players/full/1717.png"],
    ["nba_as_espn_id_1717", "https://cdn.nba.com/headshots/nba/latest/260x190/1717.png"],
    ["espn_nash", "https://a.espncdn.com/i/headshots/nba/players/full/959.png"],
    ["nba_as_espn_id_959", "https://cdn.nba.com/headshots/nba/latest/260x190/959.png"],
    ["espn_redd", "https://a.espncdn.com/i/headshots/nba/players/full/2072.png"],
    ["nba_as_espn_id_2072", "https://cdn.nba.com/headshots/nba/latest/260x190/2072.png"],
  ] as const;
  for (const [label, url] of imgs) {
    const r = await fetch(url, { method: "HEAD", headers: { "User-Agent": UA } });
    out.push({
      label,
      url,
      status: r.status,
      ct: r.headers.get("content-type"),
      cl: r.headers.get("content-length"),
    });
    console.log(JSON.stringify({ label, status: r.status, cl: r.headers.get("content-length") }));
  }

  mkdirSync("reports/p18b3", { recursive: true });
  writeFileSync(join("reports/p18b3", "_probe_stats.json"), JSON.stringify(out, null, 2));
  console.log("wrote reports/p18b3/_probe_stats.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
