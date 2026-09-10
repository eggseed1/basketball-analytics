/**
 * Bake NBA hustle tracking for Cloudflare Workers (stats.nba.com is flaky on edge).
 *
 *   node scripts/build-runtime-hustle-snapshot.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "src", "data", "runtime", "hustle-overlay-snapshot.json");

const SEASONS = [
  "2020-21",
  "2021-22",
  "2022-23",
  "2023-24",
  "2024-25",
  "2025-26",
];

const NBA_HEADERS = {
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Origin: "https://www.nba.com",
  Referer: "https://www.nba.com/",
  "User-Agent":
    "Mozilla/5.0 (compatible; BasketballAnalytics/0.1; educational)",
  "x-nba-stats-origin": "stats",
  "x-nba-stats-token": "true",
};

function num(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function totalCount(row, field) {
  const raw = num(row[field]);
  if (!raw) return null;
  return Math.round(raw);
}

/** [nbaId, teamId, contested, defl, charges, scrAst, loose, boxOuts, gp] */
function slimRow(row) {
  const gp = num(row.G) || num(row.GP) || 0;
  if (gp <= 0) return null;
  const contested = totalCount(row, "CONTESTED_SHOTS");
  const deflections = totalCount(row, "DEFLECTIONS");
  const charges = totalCount(row, "CHARGES_DRAWN");
  const screens = totalCount(row, "SCREEN_ASSISTS");
  const loose = totalCount(row, "LOOSE_BALLS_RECOVERED");
  const boxOuts = totalCount(row, "BOX_OUTS");
  if (
    contested == null &&
    deflections == null &&
    charges == null &&
    screens == null &&
    loose == null &&
    boxOuts == null
  ) {
    return null;
  }
  return [
    String(row.PLAYER_ID ?? ""),
    String(row.TEAM_ID ?? ""),
    contested,
    deflections,
    charges,
    screens,
    loose,
    boxOuts,
    gp,
  ];
}

async function fetchHustleSeason(season) {
  const params = new URLSearchParams({
    College: "",
    Conference: "",
    Country: "",
    DateFrom: "",
    DateTo: "",
    Division: "",
    DraftPick: "",
    DraftYear: "",
    GameScope: "",
    Height: "",
    LastNGames: "0",
    LeagueID: "00",
    Location: "",
    Month: "0",
    OpponentTeamID: "0",
    Outcome: "",
    PORound: "0",
    PerMode: "Totals",
    PlayerExperience: "",
    PlayerPosition: "",
    Season: season,
    SeasonSegment: "",
    SeasonType: "Regular Season",
    StarterBench: "",
    TeamID: "0",
    VsConference: "",
    VsDivision: "",
    Weight: "",
  });
  const url = `https://stats.nba.com/stats/leaguehustlestatsplayer?${params}`;
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { headers: NBA_HEADERS });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const json = await response.json();
      const set = json.resultSets?.[0] ?? json.resultSet;
      if (!set?.rowSet?.length) throw new Error("empty result set");
      const headers = set.headers;
      const rows = set.rowSet.map((row) => {
        const obj = {};
        headers.forEach((h, i) => {
          obj[h] = row[i] ?? null;
        });
        return obj;
      });
      return rows.map(slimRow).filter(Boolean);
    } catch (error) {
      lastError = error;
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    }
  }
  throw lastError;
}

const seasons = {};
for (const season of SEASONS) {
  try {
    seasons[season] = await fetchHustleSeason(season);
    console.log(
      `[hustle-snapshot] ${season} → ${seasons[season].length} players`
    );
  } catch (error) {
    console.warn(
      `[hustle-snapshot] ${season} skipped: ${
        error instanceof Error ? error.message : error
      }`
    );
  }
}

const payload = {
  version: 1,
  generatedAt: new Date().toISOString(),
  seasons,
};

await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, JSON.stringify(payload));
const gz = gzipSync(Buffer.from(JSON.stringify(payload))).length;
console.log(
  `[hustle-snapshot] wrote → ${OUT} (gzip ~${gz} bytes, seasons=${Object.keys(seasons).length})`
);
