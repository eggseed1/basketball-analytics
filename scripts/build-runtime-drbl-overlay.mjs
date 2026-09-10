/**
 * Slim DRBL overlay for Cloudflare Workers.
 * Full precomputed artifacts are ~1MB/season and break the 3 MiB Worker budget;
 * this keeps the product fields needed for player/home/percentile surfaces.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

const ROOT = process.cwd();
const PRECOMPUTED = path.join(ROOT, "src", "data", "drbl", "precomputed");
const OUT = path.join(ROOT, "src", "data", "runtime", "drbl-overlay-snapshot.json");

const SEASONS = [
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

const seasons = {};
for (const season of SEASONS) {
  const filePath = path.join(PRECOMPUTED, `${season}.json`);
  try {
    const raw = JSON.parse(await fs.readFile(filePath, "utf8"));
    const players = Array.isArray(raw?.players) ? raw.players : [];
    seasons[season] = players
      .map(slimPlayer)
      .filter((row) => row[0] && Number(row[5]) > 0);
    console.log(
      `[drbl-overlay] ${season} → ${seasons[season].length} players`
    );
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
