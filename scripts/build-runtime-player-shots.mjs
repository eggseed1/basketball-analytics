/**
 * Bake player-season shot charts into public/ for Cloudflare Static Assets.
 * stats.nba.com works on the build machine but is routinely blocked from Workers.
 *
 * Output: public/runtime/player-shots/{season}/{nbaPlayerId}.json
 *
 *   node scripts/build-runtime-player-shots.mjs
 *   FORCE=1 node scripts/build-runtime-player-shots.mjs   # rebuild existing
 */
import fs from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";

const ROOT = process.cwd();
const OUT_ROOT = path.join(ROOT, "public", "runtime", "player-shots");
const BREF = path.join(
  ROOT,
  "src",
  "data",
  "runtime",
  "bref-advanced-snapshot.json"
);
const ALIASES = path.join(
  ROOT,
  "src",
  "data",
  "runtime",
  "player-id-aliases-snapshot.json"
);

const FORCE = process.env.FORCE === "1";
const MIN_GP = Number(process.env.SHOT_MIN_GP || 15);
const CONCURRENCY = Number(process.env.SHOT_CONCURRENCY || 6);
/** 0 = all seasons present in the BRef snapshot (full CF career coverage). */
const SEASON_LIMIT = Number(process.env.SHOT_SEASON_LIMIT || 0);

const HEADERS = {
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Origin: "https://www.nba.com",
  Referer: "https://www.nba.com/",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "x-nba-stats-origin": "stats",
  "x-nba-stats-token": "true",
};

function canonicalSeason(startYear) {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

function seasonsFromBref(bref, limit) {
  const seasons = Object.keys(bref.seasons || {})
    .filter((season) => (bref.seasons[season]?.advanced || []).length > 0)
    .sort((a, b) => b.localeCompare(a));
  if (Number.isFinite(limit) && limit > 0) return seasons.slice(0, limit);
  return seasons;
}

function normalizeName(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function nameKeys(name) {
  const n = normalizeName(name);
  if (!n) return [];
  const stripped = n
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return stripped && stripped !== n ? [n, stripped] : [n];
}

function zoneFromRow(row) {
  const basic = String(row.SHOT_ZONE_BASIC ?? "").trim();
  if (basic) return basic;
  const range = String(row.SHOT_ZONE_RANGE ?? "").trim();
  return range || "Unknown";
}

function parseShots(payload, nbaId, season) {
  const set =
    payload?.resultSets?.find((r) => r.name === "Shot_Chart_Detail") ??
    payload?.resultSets?.[0];
  if (!set?.headers || !Array.isArray(set.rowSet)) return [];
  const idx = Object.fromEntries(set.headers.map((h, i) => [h, i]));
  const shots = [];
  for (const row of set.rowSet) {
    const locX = Number(row[idx.LOC_X]);
    const locY = Number(row[idx.LOC_Y]);
    if (!Number.isFinite(locX) || !Number.isFinite(locY)) continue;
    const made =
      String(row[idx.SHOT_MADE_FLAG]) === "1" ||
      Number(row[idx.SHOT_MADE_FLAG]) === 1;
    const zone = zoneFromRow(
      Object.fromEntries(set.headers.map((h, i) => [h, row[i]]))
    );
    const isThree =
      zone.toLowerCase().includes("three") ||
      String(row[idx.SHOT_TYPE] ?? "").includes("3");
    shots.push({
      gameId: String(row[idx.GAME_ID] ?? ""),
      eventId: String(row[idx.GAME_EVENT_ID] ?? shots.length),
      x: locX / 10,
      y: locY / 10,
      made,
      shotValue: isThree ? 3 : 2,
      period: Number(row[idx.PERIOD]) || 0,
      clock: `${row[idx.MINUTES_REMAINING] ?? 0}:${String(
        row[idx.SECONDS_REMAINING] ?? 0
      ).padStart(2, "0")}`,
      zone,
    });
  }
  return shots;
}

async function fetchShotChart(nbaId, season) {
  const url = new URL("https://stats.nba.com/stats/shotchartdetail");
  const params = {
    AheadBehind: "",
    ClutchTime: "",
    ContextMeasure: "FGA",
    DateFrom: "",
    DateTo: "",
    EndPeriod: 10,
    EndRange: 28800,
    GameID: "",
    GameSegment: "",
    LastNGames: 0,
    LeagueID: "00",
    Location: "",
    Month: 0,
    OpponentTeamID: 0,
    Outcome: "",
    Period: 0,
    PlayerID: nbaId,
    PlayerPosition: "",
    PointDiff: "",
    Position: "",
    RangeType: 0,
    Season: season,
    SeasonSegment: "",
    SeasonType: "Regular Season",
    ShotClockRange: "",
    StartPeriod: 1,
    StartRange: 0,
    TeamID: 0,
    VsConference: "",
    VsDivision: "",
  };
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url, {
    headers: HEADERS,
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function mapPool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker())
  );
  return results;
}

const bref = JSON.parse(await fs.readFile(BREF, "utf8"));
const aliasFile = JSON.parse(await fs.readFile(ALIASES, "utf8"));
const nbaByEspn = new Map();
const nbaByName = new Map();
const espnByName = new Map();
for (const a of aliasFile.aliases || []) {
  if (!a?.nbaPlayerId || !a?.playerName) continue;
  const nbaId = String(a.nbaPlayerId);
  const espnId = a.espnPlayerId ? String(a.espnPlayerId) : null;
  if (espnId) nbaByEspn.set(espnId, nbaId);
  for (const key of nameKeys(a.playerName)) {
    if (!nbaByName.has(key)) nbaByName.set(key, nbaId);
    if (espnId && !espnByName.has(key)) espnByName.set(key, espnId);
  }
}

const seasons = seasonsFromBref(bref, SEASON_LIMIT);

let written = 0;
let skipped = 0;
let failed = 0;

for (const season of seasons) {
  const advanced = bref.seasons[season].advanced || [];
  const targets = [];
  const seen = new Set();
  for (const row of advanced) {
    if ((row.gp ?? 0) < MIN_GP) continue;
    const keys = nameKeys(row.n);
    const espnId =
      (row.e ? String(row.e) : null) ||
      keys.map((k) => espnByName.get(k)).find(Boolean) ||
      null;
    const nbaId =
      (espnId ? nbaByEspn.get(espnId) : null) ||
      keys.map((k) => nbaByName.get(k)).find(Boolean) ||
      null;
    if (!nbaId || seen.has(nbaId)) continue;
    seen.add(nbaId);
    targets.push({
      nbaId,
      espnId: espnId && espnId !== nbaId ? espnId : null,
      name: row.n,
      gp: row.gp,
    });
  }

  const seasonDir = path.join(OUT_ROOT, season);
  await fs.mkdir(seasonDir, { recursive: true });
  console.log(
    `[player-shots] ${season}: ${targets.length} players (gp>=${MIN_GP})`
  );

  await mapPool(targets, CONCURRENCY, async (target) => {
    const dest = path.join(seasonDir, `${target.nbaId}.json`);
    if (!FORCE && existsSync(dest)) {
      skipped += 1;
      return;
    }
    try {
      const payload = await fetchShotChart(target.nbaId, season);
      const shots = parseShots(payload, target.nbaId, season);
      if (!shots.length) {
        failed += 1;
        return;
      }
      const index = {
        playerId: target.nbaId,
        season,
        boxFga: shots.length,
        shotEvents: shots.length,
        coordinateShots: shots.length,
        coverage: 1,
        shots,
        source: "stats.nba.com/shotchartdetail",
        generatedAt: new Date().toISOString(),
      };
      const body = JSON.stringify(index);
      await fs.writeFile(dest, body);
      if (target.espnId && target.espnId !== target.nbaId) {
        await fs.writeFile(
          path.join(seasonDir, `${target.espnId}.json`),
          body
        );
      }
      written += 1;
      if (written % 25 === 0) {
        console.log(`[player-shots] wrote ${written}…`);
      }
    } catch (error) {
      failed += 1;
      if (failed <= 8) {
        console.warn(
          `[player-shots] fail ${target.name} (${target.nbaId}) ${season}: ${
            error instanceof Error ? error.message : error
          }`
        );
      }
    }
  });
}

const manifest = {
  version: 1,
  generatedAt: new Date().toISOString(),
  seasons,
  written,
  skipped,
  failed,
  minGp: MIN_GP,
};
await fs.mkdir(OUT_ROOT, { recursive: true });
await fs.writeFile(
  path.join(OUT_ROOT, "manifest.json"),
  JSON.stringify(manifest, null, 2)
);

console.log(
  `[player-shots] done written=${written} skipped=${skipped} failed=${failed} → ${OUT_ROOT}`
);
