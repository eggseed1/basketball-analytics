/**
 * Slim DRBL overlay for Cloudflare Workers.
 * Full precomputed artifacts are ~1MB/season and break the 3 MiB Worker budget;
 * this keeps the product fields needed for player/home/percentile surfaces.
 *
 * Discovers every `precomputed/{season}.json` with enough finals so a nightly
 * 2026-27 bake can ship without editing the hardcoded season list.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

const ROOT = process.cwd();
const PRECOMPUTED = path.join(ROOT, "src", "data", "drbl", "precomputed");
const OUT = path.join(ROOT, "src", "data", "runtime", "drbl-overlay-snapshot.json");
const PUBLISHED_OUT = path.join(
  ROOT,
  "src",
  "data",
  "runtime",
  "drbl-published-seasons.json"
);

/** Floor before a season is product-published / overlay-included. */
const MIN_GAMES = Number(process.env.DRBL_MIN_GAMES ?? "50");

/** Always attempt these (historical seals + current production). */
const SEED_SEASONS = [
  "2020-21",
  "2021-22",
  "2022-23",
  "2023-24",
  "2024-25",
  "2025-26",
];

function round(n, digits) {
  if (n == null || !Number.isFinite(Number(n))) return null;
  const f = 10 ** digits;
  return Math.round(Number(n) * f) / f;
}

/**
 * Compact row:
 * [id, name, teamId, drbl100, rawAbilityRate, possessions, O, D, P, Ln, B, r1Points, war1]
 */
function slimPlayer(p) {
  return [
    String(p.playerId),
    String(p.playerName ?? "").trim(),
    String(p.teamId ?? "").trim(),
    round(p.drbl100, 2),
    round(p.rawAbilityRate, 4),
    Math.round(Number(p.actualPossessions ?? p.possessions ?? 0)),
    round(p.drblO, 2),
    round(p.drblD, 2),
    round(p.drblP, 2),
    round(p.drblLn, 2),
    round(p.drblB, 2),
    p.r1Points != null ? round(p.r1Points, 1) : null,
    p.r1WinEquivalents != null ? round(p.r1WinEquivalents, 2) : null,
  ];
}

async function discoverSeasons() {
  const found = new Set(SEED_SEASONS);
  try {
    const files = await fs.readdir(PRECOMPUTED);
    for (const name of files) {
      const m = /^(\d{4}-\d{2})\.json$/.exec(name);
      if (m) found.add(m[1]);
    }
  } catch {
    /* seed only */
  }
  return [...found].sort();
}

const seasons = {};
const published = {};
for (const season of await discoverSeasons()) {
  const filePath = path.join(PRECOMPUTED, `${season}.json`);
  try {
    const raw = JSON.parse(await fs.readFile(filePath, "utf8"));
    const gamesProcessed = Number(raw?.gamesProcessed) || 0;
    const isSeed = SEED_SEASONS.includes(season);
    if (!isSeed && gamesProcessed < MIN_GAMES) {
      console.log(
        `[drbl-overlay] ${season} skipped — gamesProcessed=${gamesProcessed} < ${MIN_GAMES}`
      );
      continue;
    }
    const players = Array.isArray(raw?.players) ? raw.players : [];
    seasons[season] = players
      .map(slimPlayer)
      .filter((row) => row[0] && Number(row[5]) > 0);
    console.log(
      `[drbl-overlay] ${season} → ${seasons[season].length} players (games=${gamesProcessed})`
    );
    if (gamesProcessed >= MIN_GAMES) {
      published[season] = {
        gamesProcessed,
        players: seasons[season].length,
      };
    }
  } catch (error) {
    console.warn(
      `[drbl-overlay] ${season} skipped: ${
        error instanceof Error ? error.message : error
      }`
    );
  }
}

const payload = {
  version: 2,
  generatedAt: new Date().toISOString(),
  seasons,
};

await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, JSON.stringify(payload));
const gz = gzipSync(Buffer.from(JSON.stringify(payload))).length;
console.log(
  `[drbl-overlay] wrote ${Object.keys(seasons).length} seasons → ${OUT} (gzip ~${gz} bytes)`
);

const publishedPayload = {
  version: 1,
  minGames: MIN_GAMES,
  generatedAt: new Date().toISOString(),
  note: "Runtime-published DRBL seasons from precomputed artifacts (nightly bake).",
  seasons: published,
};
await fs.writeFile(PUBLISHED_OUT, `${JSON.stringify(publishedPayload, null, 2)}\n`);
console.log(
  `[drbl-overlay] published seasons → ${Object.keys(published).join(", ") || "(none)"}`
);
