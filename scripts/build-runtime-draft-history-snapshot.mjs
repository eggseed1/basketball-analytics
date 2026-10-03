/**
 * Bake NBA draft picks (1990 on) for "How they got him" on Cloudflare, where
 * stats.nba.com is routinely blocked. Keeps the prior bake if the fetch fails.
 *
 *   node scripts/build-runtime-draft-history-snapshot.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "src", "data", "runtime", "draft-history-snapshot.json");
const FIRST_YEAR = 1990;

const NBA_HEADERS = {
  Accept: "application/json, text/plain, */*",
  Origin: "https://www.nba.com",
  Referer: "https://www.nba.com/",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "x-nba-stats-origin": "stats",
  "x-nba-stats-token": "true",
};

async function fetchPicks() {
  const res = await fetch("https://stats.nba.com/stats/drafthistory?LeagueID=00", {
    headers: NBA_HEADERS,
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`drafthistory HTTP ${res.status}`);
  const json = await res.json();
  const set = json?.resultSets?.[0];
  if (!set?.headers || !set?.rowSet) throw new Error("drafthistory: no rows");
  const col = (name) => set.headers.indexOf(name);
  const idx = {
    id: col("PERSON_ID"),
    name: col("PLAYER_NAME"),
    year: col("SEASON"),
    round: col("ROUND_NUMBER"),
    roundPick: col("ROUND_PICK"),
    overall: col("OVERALL_PICK"),
    type: col("DRAFT_TYPE"),
    team: col("TEAM_ABBREVIATION"),
  };
  if (Object.values(idx).some((i) => i < 0)) throw new Error("drafthistory: header change");
  const picks = [];
  for (const row of set.rowSet) {
    const year = Number(row[idx.year]);
    if (!Number.isFinite(year) || year < FIRST_YEAR || row[idx.type] !== "Draft") continue;
    picks.push([
      String(row[idx.id]),
      String(row[idx.name]).trim(),
      year,
      Number(row[idx.round]),
      Number(row[idx.roundPick]),
      Number(row[idx.overall]),
      String(row[idx.team]),
    ]);
  }
  return picks.sort((a, b) => a[2] - b[2] || a[5] - b[5]);
}

async function main() {
  let picks;
  try {
    picks = await fetchPicks();
    console.log(`drafthistory: ${picks.length} picks since ${FIRST_YEAR}`);
  } catch (err) {
    console.warn(`drafthistory failed, keeping prior bake: ${err?.message ?? err}`);
    return;
  }
  const payload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: "stats.nba.com/drafthistory",
    columns: ["nbaId", "name", "year", "round", "roundPick", "overall", "teamAbbr"],
    picks,
  };
  await fs.mkdir(path.dirname(OUT), { recursive: true });
  await fs.writeFile(OUT, `${JSON.stringify(payload)}\n`, "utf8");
  console.log(`wrote ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
