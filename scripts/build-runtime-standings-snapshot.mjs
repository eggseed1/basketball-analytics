/**
 * Bake ESPN conference standings for Cloudflare Workers.
 * cdn.espn.com/core/nba/standings is preferred at runtime; this is the build-time safety net.
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
  "standings-snapshot.json"
);
const CDN = "https://cdn.espn.com/core/nba/standings";
const SITE = "https://site.api.espn.com/apis/v2/sports/basketball/nba/standings";

const now = new Date();
const currentStartYear =
  now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
const startYears = [
  currentStartYear - 2,
  currentStartYear - 1,
  currentStartYear,
];

function canonicalSeason(startYear) {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

function conferenceFromChild(child) {
  const abbr = String(child?.abbreviation ?? "").toLowerCase();
  const name = String(child?.name ?? "").toLowerCase();
  if (abbr === "west" || name.includes("west")) return "West";
  return "East";
}

function num(map, key) {
  const raw = map.get(key)?.value;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim()) {
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }
  const display = map.get(key)?.displayValue;
  if (display && display !== "-" && display !== "—") {
    const n = Number(display);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function display(map, key) {
  return map.get(key)?.displayValue ?? "-";
}

function transformEntry(entry, conference, rank) {
  const stats = new Map((entry.stats ?? []).map((s) => [s.name, s]));
  return {
    teamId: String(entry.team.id),
    abbreviation: entry.team.abbreviation,
    displayName: entry.team.displayName,
    conference,
    rank,
    wins: num(stats, "wins"),
    losses: num(stats, "losses"),
    winPct: num(stats, "winPercent"),
    gamesBehind: num(stats, "gamesBehind"),
    differential: num(stats, "differential"),
    ppg: num(stats, "avgPointsFor"),
    oppPpg: num(stats, "avgPointsAgainst"),
    streak: display(stats, "streak"),
    homeRecord: display(stats, "Home"),
    roadRecord: display(stats, "Road"),
    lastTen: display(stats, "Last Ten Games"),
    playoffSeed: num(stats, "playoffSeed") || null,
  };
}

function buildLeagueStandings(season, children) {
  const conferences = [];
  for (const child of children ?? []) {
    const conference = conferenceFromChild(child);
    const entries = child.standings?.entries ?? [];
    const rows = entries
      .map((entry) => transformEntry(entry, conference, 0))
      .sort((a, b) => {
        const seedA = a.playoffSeed && a.playoffSeed > 0 ? a.playoffSeed : 99;
        const seedB = b.playoffSeed && b.playoffSeed > 0 ? b.playoffSeed : 99;
        if (seedA !== seedB) return seedA - seedB;
        if (b.winPct !== a.winPct) return b.winPct - a.winPct;
        if (b.wins !== a.wins) return b.wins - a.wins;
        return a.losses - b.losses;
      })
      .map((row, index) => ({ ...row, rank: index + 1 }));
    conferences.push({ conference, rows });
  }
  conferences.sort((a, b) => a.conference.localeCompare(b.conference));
  return { season, conferences };
}

async function fetchSeason(season, espnYear) {
  const headers = {
    Accept: "application/json",
    "User-Agent": "Mozilla/5.0 DRBL-standings-snapshot/1.0",
  };
  try {
    const cdnRes = await fetch(`${CDN}?xhr=1&season=${espnYear}`, {
      headers,
      signal: AbortSignal.timeout(20000),
    });
    if (cdnRes.ok) {
      const payload = await cdnRes.json();
      const groups = payload?.content?.standings?.groups ?? [];
      if (groups.length) return buildLeagueStandings(season, groups);
    }
  } catch {
    /* fall through */
  }

  const siteRes = await fetch(`${SITE}?season=${espnYear}`, {
    headers,
    signal: AbortSignal.timeout(20000),
  });
  if (!siteRes.ok) {
    throw new Error(`site HTTP ${siteRes.status}`);
  }
  const payload = await siteRes.json();
  const children = payload?.children ?? [];
  if (!children.length) throw new Error("empty children");
  return buildLeagueStandings(season, children);
}

const seasons = {};
const failures = [];
for (const startYear of startYears) {
  const season = canonicalSeason(startYear);
  const espnYear = startYear + 1;
  try {
    seasons[season] = await fetchSeason(season, espnYear);
    const rows = seasons[season].conferences.reduce(
      (n, c) => n + c.rows.length,
      0
    );
    console.log(`[standings-snapshot] ${season} → ${rows} rows`);
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
        `[standings-snapshot] refresh failed (${failures.join(" | ")}); retaining prior`
      );
      process.exit(0);
    }
  } catch {
    /* no prior */
  }
  throw new Error(
    `standings-snapshot failed: ${failures.join(" | ") || "no seasons"}`
  );
}

const payload = {
  version: 1,
  generatedAt: new Date().toISOString(),
  source: "espn-standings-build-snapshot",
  seasons,
};

await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, JSON.stringify(payload));
const gz = gzipSync(Buffer.from(JSON.stringify(payload))).length;
console.log(
  `[standings-snapshot] wrote ${Object.keys(seasons).length} seasons → ${OUT} (gzip ${gz} B)`
);
