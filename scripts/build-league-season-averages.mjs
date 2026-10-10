/**
 * NBA league averages per season (per team, per game) from
 * Basketball-Reference. Drives the compare tool's era adjustment.
 * Blank cells stay null, and so does anything from before the NBA tracked
 * that stat for players (see FIRST_TRACKED).
 *
 * Usage: node scripts/build-league-season-averages.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";

const URL = "https://www.basketball-reference.com/leagues/NBA_stats_per_game.html";
const OUT = path.join(
  process.cwd(),
  "src/data/runtime/league-season-averages.json"
);

const COLUMNS = {
  pts: "pts_per_g",
  trb: "trb_per_g",
  orb: "orb_per_g",
  drb: "drb_per_g",
  ast: "ast_per_g",
  stl: "stl_per_g",
  blk: "blk_per_g",
  tov: "tov_per_g",
  pf: "pf_per_g",
  fg: "fg_per_g",
  fga: "fga_per_g",
  fg3: "fg3_per_g",
  fg3a: "fg3a_per_g",
  ft: "ft_per_g",
  fta: "fta_per_g",
  fgPct: "fg_pct",
  fg3Pct: "fg3_pct",
  ftPct: "ft_pct",
  efgPct: "efg_pct",
  tsPct: "ts_pct",
  pace: "pace",
  ortg: "off_rtg",
};

/**
 * First season the NBA tracked each stat for players. BRef's league row has
 * partial counts before then (0.7 steals a team-game in 1970-71), which
 * would wreck any ratio, so earlier values are dropped.
 */
const FIRST_TRACKED = {
  trb: "1950-51",
  orb: "1973-74",
  drb: "1973-74",
  stl: "1973-74",
  blk: "1973-74",
  tov: "1977-78",
  fg3: "1979-80",
  fg3a: "1979-80",
  fg3Pct: "1979-80",
};

function num(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const res = await fetch(URL, {
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
  },
});
if (!res.ok) throw new Error(`BRef ${res.status}`);
const html = await res.text();
const table = html.slice(html.indexOf("<table"), html.indexOf("</table>"));
const body = table.slice(table.indexOf("<tbody"));

// Completed seasons only; the live year's partial averages would shift every night.
const now = new Date();
const currentStartYear = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;

const seasons = {};
for (const tr of body.split("<tr").slice(1)) {
  const cells = Object.fromEntries(
    [...tr.matchAll(/data-stat="([^"]+)"[^>]*>(.*?)<\/t[dh]>/g)].map((m) => [
      m[1],
      m[2].replace(/<[^>]+>/g, ""),
    ])
  );
  const season = cells.season;
  if (!/^\d{4}-\d{2}$/.test(season ?? "") || num(cells.pts_per_g) == null) {
    continue;
  }
  if (Number(season.slice(0, 4)) >= currentStartYear) continue;
  const row = {};
  for (const [key, col] of Object.entries(COLUMNS)) {
    const since = FIRST_TRACKED[key];
    row[key] = since && season < since ? null : num(cells[col]);
  }
  seasons[season] = row;
}

const keys = Object.keys(seasons).sort();
if (keys.length < 70) throw new Error(`Only parsed ${keys.length} seasons`);

const prior = await fs
  .readFile(OUT, "utf8")
  .then((raw) => JSON.parse(raw).seasons)
  .catch(() => null);
if (prior && JSON.stringify(prior) === JSON.stringify(seasons)) {
  console.log(`Unchanged: ${keys.length} seasons (${keys[0]} to ${keys.at(-1)})`);
  process.exit(0);
}

await fs.writeFile(
  OUT,
  `${JSON.stringify(
    {
      source: URL,
      generatedAt: new Date().toISOString().slice(0, 10),
      seasons,
    },
    null,
    1
  )}\n`
);
console.log(`Wrote ${keys.length} seasons (${keys[0]} to ${keys.at(-1)}) to ${OUT}`);
