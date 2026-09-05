/**
 * Bake playerId → draft year for explore board draftClass filters on Cloudflare.
 * Dual-indexes NBA PERSON_ID and ESPN athlete ids (via aliases + bio keys).
 *
 *   node scripts/build-runtime-draft-year-snapshot.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "src", "data", "runtime", "draft-year-snapshot.json");
const ALIASES = path.join(ROOT, "data", "impact", "player-id-aliases.json");
const BIO = path.join(ROOT, "src", "data", "runtime", "player-bio-snapshot.json");

const NBA_HEADERS = {
  Accept: "application/json, text/plain, */*",
  Origin: "https://www.nba.com",
  Referer: "https://www.nba.com/",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "x-nba-stats-origin": "stats",
  "x-nba-stats-token": "true",
};

function setYear(map, id, year) {
  const key = String(id ?? "").trim();
  if (!key || !Number.isFinite(year) || year < 1947 || year > 2100) return;
  map[key] = year;
}

function yearFromDraftInfo(raw) {
  const text = String(raw ?? "").trim();
  if (!text || /^undrafted$/i.test(text) || /^udfa$/i.test(text)) return null;
  const m =
    /^(\d{4})\b/.exec(text) ||
    /^Year:\s*(\d{4})/i.exec(text);
  if (!m) return null;
  const year = Number(m[1]);
  return Number.isFinite(year) && year >= 1947 ? year : null;
}

async function fetchDraftHistory() {
  const url =
    "https://stats.nba.com/stats/drafthistory?LeagueID=00";
  const res = await fetch(url, {
    headers: NBA_HEADERS,
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`drafthistory HTTP ${res.status}`);
  const json = await res.json();
  const set = json?.resultSets?.[0] ?? json?.resultSet;
  if (!set?.headers || !set?.rowSet) return {};
  const headers = set.headers.map((h) => String(h));
  const personIdx = headers.indexOf("PERSON_ID");
  const seasonIdx = headers.indexOf("SEASON");
  if (personIdx < 0 || seasonIdx < 0) return {};
  const years = {};
  for (const row of set.rowSet) {
    const id = String(row[personIdx] ?? "").trim();
    const year = Number(row[seasonIdx]);
    setYear(years, id, year);
  }
  return years;
}

async function main() {
  const years = {};

  // Preserve prior bake if live drafthistory flakes during deploy.
  try {
    const prior = JSON.parse(await fs.readFile(OUT, "utf8"));
    Object.assign(years, prior.years ?? {});
    console.log(`prior bake: ${Object.keys(prior.years ?? {}).length} keys`);
  } catch {
    /* first run */
  }

  try {
    const fromNba = await fetchDraftHistory();
    Object.assign(years, fromNba);
    console.log(`drafthistory: ${Object.keys(fromNba).length} NBA ids`);
  } catch (err) {
    console.warn(`drafthistory failed: ${err?.message ?? err}`);
  }

  try {
    const bio = JSON.parse(await fs.readFile(BIO, "utf8"));
    let fromBio = 0;
    for (const [id, compact] of Object.entries(bio.players ?? {})) {
      const year = yearFromDraftInfo(compact?.d);
      if (year == null) continue;
      if (years[id] == null) fromBio += 1;
      setYear(years, id, year);
    }
    console.log(`bio draftInfo: +${fromBio} new / ${Object.keys(bio.players ?? {}).length} bios`);
  } catch (err) {
    console.warn(`bio merge skipped: ${err?.message ?? err}`);
  }

  try {
    const aliasesFile = JSON.parse(await fs.readFile(ALIASES, "utf8"));
    let dual = 0;
    for (const row of aliasesFile.aliases ?? []) {
      const nba = String(row.nbaPlayerId ?? "").trim();
      const espn = String(row.espnPlayerId ?? "").trim();
      if (!nba || !espn) continue;
      const year = years[nba] ?? years[espn];
      if (year == null) continue;
      const before = years[espn] != null && years[nba] != null;
      setYear(years, nba, year);
      setYear(years, espn, year);
      setYear(years, `espn:${espn}`, year);
      if (!before) dual += 1;
    }
    console.log(`aliases dual-key: touched ${dual}`);
  } catch (err) {
    console.warn(`aliases merge skipped: ${err?.message ?? err}`);
  }

  const payload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    count: Object.keys(years).length,
    years,
  };

  await fs.mkdir(path.dirname(OUT), { recursive: true });
  await fs.writeFile(OUT, `${JSON.stringify(payload)}\n`, "utf8");
  console.log(`wrote ${OUT} (${payload.count} keys)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
