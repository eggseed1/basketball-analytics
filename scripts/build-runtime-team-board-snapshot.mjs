/**
 * Bake ESPN by-team raw payloads for Cloudflare Workers.
 * site.web.api often times out from CF egress; runtime maps this snapshot.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

const ROOT = process.cwd();
const OUT = path.join(
  ROOT,
  "src",
  "data",
  "runtime",
  "team-board-snapshot.json"
);
const SITE_WEB = "https://site.web.api.espn.com";

const now = new Date();
const currentStartYear =
  now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
// Six league years — aligns with BRef/DRBL/hustle snapshots for team destinations on CF.
const startYears = [
  currentStartYear - 5,
  currentStartYear - 4,
  currentStartYear - 3,
  currentStartYear - 2,
  currentStartYear - 1,
  currentStartYear,
];

function canonicalSeason(startYear) {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

async function fetchBoard(year) {
  const url =
    `${SITE_WEB}/apis/common/v3/sports/basketball/nba/statistics/byteam` +
    `?region=us&lang=en&contentorigin=espn&season=${year}&seasontype=2`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 DRBL-team-board-snapshot/1.0",
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const payload = await response.json();
  const teams = payload?.teams ?? [];
  if (!Array.isArray(teams) || teams.length === 0) {
    throw new Error("empty teams");
  }
  return {
    teams,
    categories: payload.categories ?? [],
  };
}

const seasons = {};
const failures = [];
for (const startYear of startYears) {
  const season = canonicalSeason(startYear);
  // ESPN season query uses the ending calendar year of the league year.
  const espnYear = startYear + 1;
  try {
    seasons[season] = await fetchBoard(espnYear);
    console.log(
      `[team-board-snapshot] ${season} → ${seasons[season].teams.length} teams`
    );
  } catch (error) {
    failures.push(
      `${season}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

if (Object.keys(seasons).length === 0) {
  try {
    const previous = JSON.parse(await fs.readFile(OUT, "utf8"));
    if (previous?.seasons && Object.keys(previous.seasons).length) {
      console.warn(
        `[team-board-snapshot] refresh failed (${failures.join(" | ")}); retaining prior`
      );
      process.exit(0);
    }
  } catch {
    /* no prior */
  }
  throw new Error(
    `team-board-snapshot failed: ${failures.join(" | ") || "no seasons"}`
  );
}

const payload = {
  version: 1,
  generatedAt: new Date().toISOString(),
  source: "espn-byteam-build-snapshot",
  seasons,
};

await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, JSON.stringify(payload));
const gz = gzipSync(Buffer.from(JSON.stringify(payload))).length;
console.log(
  `[team-board-snapshot] wrote ${Object.keys(seasons).length} seasons → ${OUT} (gzip ${gz} B)`
);
