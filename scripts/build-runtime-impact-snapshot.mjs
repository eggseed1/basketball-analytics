/**
 * Bake DARKO + FiveThirtyEight RAPTOR for Cloudflare Workers.
 * Optional `data/impact/raptor.csv` overrides only.
 * Recent seasons without RAPTOR stay empty — use BRef BPM columns instead.
 *
 *   node scripts/build-runtime-impact-snapshot.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "src", "data", "runtime", "impact-overlay-snapshot.json");
const RAPTOR_CSV = path.join(ROOT, "data", "impact", "raptor.csv");
const ESPN_NAME_INDEX = path.join(ROOT, "src", "data", "runtime", "espn-name-index.json");

const RAPTOR_URLS = [
  "https://raw.githubusercontent.com/fivethirtyeight/data/master/nba-raptor/modern_RAPTOR_by_player.csv",
  "https://raw.githubusercontent.com/fivethirtyeight/data/master/nba-raptor/historical_RAPTOR_by_player.csv",
];

const now = new Date();
const currentStart =
  now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
/** Align with BRef window so DARKO percentiles aren't truncated to 2021+. */
const IMPACT_SEASON_WINDOW = Number(process.env.IMPACT_SEASON_WINDOW || 30);
const SEASONS = Array.from({ length: IMPACT_SEASON_WINDOW }, (_, i) => {
  const start = currentStart - 1 - i;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
});

function round(n, digits = 2) {
  if (n == null || !Number.isFinite(Number(n))) return null;
  const f = 10 ** digits;
  return Math.round(Number(n) * f) / f;
}

function canonicalSeason(startYear) {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

function darkoSeasonYear(season) {
  return Number(String(season).slice(0, 4)) + 1;
}

function isCurrentSeason(season) {
  const now = new Date();
  const start =
    now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  return season === canonicalSeason(start);
}

function darkoDataUrl(season) {
  const base =
    "https://www.darko.app/__data.json?x-sveltekit-trailing-slash=1&x-sveltekit-invalidated=01";
  if (isCurrentSeason(season)) return base;
  return `${base}&season=${darkoSeasonYear(season)}`;
}

function hydrateSvelteKitData(data) {
  const hydrated = new Array(data.length);
  function hydrateIndex(i) {
    if (hydrated[i] !== undefined) return hydrated[i];
    const value = data[i];
    if (value == null || typeof value !== "object") {
      hydrated[i] = value;
      return value;
    }
    if (Array.isArray(value)) {
      const arr = [];
      hydrated[i] = arr;
      for (const item of value) {
        arr.push(typeof item === "number" ? hydrateIndex(item) : item);
      }
      return arr;
    }
    const obj = {};
    hydrated[i] = obj;
    for (const [k, v] of Object.entries(value)) {
      obj[k] = typeof v === "number" ? hydrateIndex(v) : v;
    }
    return obj;
  }
  return hydrateIndex(0);
}

function num(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function parseDarkoPlayers(decoded) {
  if (!decoded || typeof decoded !== "object") return [];
  const players = decoded.players;
  if (!Array.isArray(players)) return [];
  const rows = [];
  for (const raw of players) {
    if (!raw || typeof raw !== "object") continue;
    const nbaId = raw.nba_id != null ? String(raw.nba_id) : "";
    if (!nbaId) continue;
    rows.push({
      nbaId,
      name: String(raw.player_name ?? "").trim(),
      dpm: num(raw.dpm),
      oDpm: num(raw.o_dpm),
      dDpm: num(raw.d_dpm),
    });
  }
  return rows;
}

/** Compact: [nbaId, name, dpm, oDpm, dDpm] */
function slimDarko(rows) {
  return rows
    .filter((r) => r.nbaId && r.name)
    .map((r) => [
      r.nbaId,
      r.name,
      round(r.dpm, 2),
      round(r.oDpm, 2),
      round(r.dDpm, 2),
    ]);
}

async function fetchDarkoSeason(season) {
  const url = darkoDataUrl(season);
  let lastError;
  // darko.app flaps under burst traffic — prior bakes silently skipped
  // mid-window seasons (notably 2013-14…2018-19), leaving career DARKO gaps.
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent":
            "Mozilla/5.0 (compatible; BasketballAnalytics/0.1; educational)",
        },
      });
      if (!response.ok) {
        throw new Error(`DARKO HTTP ${response.status}: ${url}`);
      }
      const json = await response.json();
      const node = json.nodes?.find(
        (n) => n?.type === "data" && Array.isArray(n.data)
      );
      if (!node?.data) throw new Error(`DARKO payload missing data node`);
      const decoded = hydrateSvelteKitData(node.data);
      const rows = parseDarkoPlayers(decoded);
      if (!rows.length) throw new Error(`DARKO player table empty`);
      return rows;
    } catch (error) {
      lastError = error;
      const backoffMs = Math.min(8_000, 700 * 2 ** attempt) + Math.floor(Math.random() * 250);
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }
  throw lastError;
}

async function loadPriorDarko() {
  try {
    const prior = JSON.parse(await fs.readFile(OUT, "utf8"));
    return prior?.darko && typeof prior.darko === "object" ? prior.darko : {};
  } catch {
    return {};
  }
}

function splitCsvLine(line) {
  const out = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  out.push(current.trim());
  return out;
}

function normalizePlayerName(name) {
  return String(name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** RAPTOR `season` column is the ending calendar year (2024 → 2023-24). */
function canonicalFromRaptorYear(endYear) {
  const y = Number(endYear);
  if (!Number.isFinite(y) || y < 1977) return null;
  const start = y - 1;
  return `${start}-${String(y % 100).padStart(2, "0")}`;
}

function parseCsv(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const idx = (name) => header.indexOf(name);
  const rows = [];
  for (const line of lines.slice(1)) {
    const cols = splitCsvLine(line);
    const obj = {};
    for (let i = 0; i < header.length; i++) {
      obj[header[i]] = cols[i] ?? "";
    }
    rows.push({ cols, idx, obj });
  }
  return rows;
}

async function fetchRaptorRows() {
  const bySeasonPlayer = new Map();
  for (const url of RAPTOR_URLS) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "BasketballAnalytics/0.1" },
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const parsed = parseCsv(await res.text());
      for (const { obj } of parsed) {
        const season = canonicalFromRaptorYear(obj.season);
        const name = String(obj.player_name ?? "").trim();
        const total = Number(obj.raptor_total);
        const mp = Number(obj.mp ?? 0);
        if (
          !season ||
          !name ||
          !Number.isFinite(total) ||
          mp < MIN_IMPACT_MINUTES
        )
          continue;
        const key = `${season}\0${normalizePlayerName(name)}`;
        if (bySeasonPlayer.has(key) && url.includes("historical")) continue;
        bySeasonPlayer.set(key, {
          season,
          name,
          impact: total,
          offensive: Number(obj.raptor_offense),
          defensive: Number(obj.raptor_defense),
          winsAdded: Number(obj.war_total),
        });
      }
      console.log(`[impact-snapshot] RAPTOR ${url.split("/").pop()} → ${parsed.length} rows`);
    } catch (error) {
      console.warn(
        `[impact-snapshot] RAPTOR fetch skipped (${url}): ${
          error instanceof Error ? error.message : error
        }`
      );
    }
  }
  return [...bySeasonPlayer.values()];
}

function loadEspnNameIndex() {
  try {
    const raw = JSON.parse(readFileSync(ESPN_NAME_INDEX, "utf8"));
    return raw?.byName && typeof raw.byName === "object" ? raw.byName : {};
  } catch {
    return {};
  }
}

/** Ignore tiny-sample RAPTOR rows that blow up leaderboards. */
const MIN_IMPACT_MINUTES = Number(process.env.IMPACT_MIN_MINUTES || 400);

/** Compact: [playerId, name, raptor, oRaptor, dRaptor, war] */
function slimImpactRow(row, espnByName) {
  const name = String(row.name ?? "").trim();
  const nameKey = normalizePlayerName(name);
  const playerId =
    row.playerId ||
    espnByName[nameKey] ||
    nameKey.replace(/\s+/g, "-");
  return [
    String(playerId),
    name,
    round(row.impact, 2),
    round(row.offensive, 2),
    round(row.defensive, 2),
    round(row.winsAdded, 2),
  ];
}

async function buildRaptorOverlay() {
  const espnByName = loadEspnNameIndex();
  const raptor = await fetchRaptorRows();

  /** season → normalized name → slim row */
  const bySeason = new Map();

  for (const row of raptor) {
    const key = normalizePlayerName(row.name);
    if (!key) continue;
    if (!bySeason.has(row.season)) bySeason.set(row.season, new Map());
    bySeason.get(row.season).set(key, slimImpactRow(row, espnByName));
  }

  const out = {};
  for (const [season, bucket] of bySeason) {
    out[season] = [...bucket.values()].sort((a, b) => (b[2] ?? 0) - (a[2] ?? 0));
  }
  return out;
}

/** Optional manual overrides — wins over baked public data. */
async function loadRaptorCsvOverrides() {
  if (!existsSync(RAPTOR_CSV)) return [];
  const text = await fs.readFile(RAPTOR_CSV, "utf8");
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const idx = (name) => header.indexOf(name);
  if (idx("player_name") < 0 || idx("season") < 0 || idx("raptor") < 0) {
    throw new Error("raptor.csv missing required columns");
  }

  const rows = [];
  for (const line of lines.slice(1)) {
    const cols = splitCsvLine(line);
    const name = cols[idx("player_name")] ?? "";
    const season = cols[idx("season")] ?? "";
    const raptor = Number(cols[idx("raptor")]);
    if (!name || !season || !Number.isFinite(raptor)) continue;
    const playerIdCol = idx("player_id");
    const nbaId =
      playerIdCol >= 0 && cols[playerIdCol]
        ? cols[playerIdCol]
        : name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    rows.push({
      season,
      row: [
        nbaId,
        name,
        round(raptor, 2),
        round(Number(cols[idx("o_raptor")] ?? ""), 2),
        round(Number(cols[idx("d_raptor")] ?? ""), 2),
        round(
          Number(cols[idx("war")] ?? cols[idx("wins_added")] ?? ""),
          2
        ),
      ],
    });
  }
  return rows;
}

const priorDarko = await loadPriorDarko();
const darko = {};

for (const season of SEASONS) {
  try {
    const rows = await fetchDarkoSeason(season);
    darko[season] = slimDarko(rows);
    console.log(`[impact-snapshot] DARKO ${season} → ${darko[season].length} players`);
  } catch (error) {
    const prior = Array.isArray(priorDarko[season]) ? priorDarko[season] : [];
    if (prior.length > 0) {
      darko[season] = prior;
      console.warn(
        `[impact-snapshot] DARKO ${season} fetch failed — kept prior bake (${prior.length} players): ${
          error instanceof Error ? error.message : error
        }`
      );
    } else {
      console.warn(
        `[impact-snapshot] DARKO ${season} skipped (no prior): ${
          error instanceof Error ? error.message : error
        }`
      );
    }
  }
  // Pace requests so a full 30-season window does not trip darko.app.
  await new Promise((r) => setTimeout(r, 350));
}

const missingDarko = SEASONS.filter(
  (season) => !Array.isArray(darko[season]) || darko[season].length === 0
);
if (missingDarko.length) {
  const msg = `[impact-snapshot] DARKO gaps remain: ${missingDarko.join(", ")}`;
  if (process.env.ALLOW_DARKO_GAPS === "1") {
    console.warn(msg);
  } else {
    console.error(msg);
    console.error(
      "[impact-snapshot] Refuse to publish holes (career boards go blank on CF). Re-run or set ALLOW_DARKO_GAPS=1."
    );
    process.exit(1);
  }
}

const raptor = await buildRaptorOverlay();
for (const [season, rows] of Object.entries(raptor)) {
  if (rows.length) {
    console.log(`[impact-snapshot] RAPTOR ${season} → ${rows.length} players`);
  }
}

const csvOverrides = await loadRaptorCsvOverrides();
for (const { season, row } of csvOverrides) {
  if (!raptor[season]) raptor[season] = [];
  const nameKey = normalizePlayerName(row[1]);
  const idx = raptor[season].findIndex(
    (r) => normalizePlayerName(r[1]) === nameKey || r[0] === row[0]
  );
  if (idx >= 0) raptor[season][idx] = row;
  else raptor[season].push(row);
}
if (csvOverrides.length) {
  console.log(`[impact-snapshot] applied ${csvOverrides.length} raptor.csv override rows`);
}

const payload = {
  version: 1,
  generatedAt: new Date().toISOString(),
  darko,
  raptor,
};

await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, JSON.stringify(payload));
const gz = gzipSync(Buffer.from(JSON.stringify(payload))).length;
console.log(
  `[impact-snapshot] wrote → ${OUT} (gzip ~${gz} bytes, darko seasons=${Object.keys(darko).length}, raptor seasons=${Object.keys(raptor).length})`
);
