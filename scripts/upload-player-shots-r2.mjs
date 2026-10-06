/**
 * Upload the local shot chart bake to R2 so CI deploys serve shot maps.
 * stats.nba.com blocks GitHub runners, so only a machine that can run
 * `npm run shots:sync` can produce public/runtime/player-shots.
 *
 * Keys mirror the static asset paths: {season}/{nbaPlayerId}.json
 *
 *   node scripts/upload-player-shots-r2.mjs
 *   SEASONS=2025-26,2026-27 node scripts/upload-player-shots-r2.mjs
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "public", "runtime", "player-shots");
const BUCKET = process.env.SHOTS_BUCKET || "drbl-player-shots";
const CONCURRENCY = process.env.SHOTS_R2_CONCURRENCY || "20";
const ONLY = new Set(
  (process.env.SEASONS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

async function main() {
  const seasons = (await fs.readdir(SRC, { withFileTypes: true }))
    .filter((d) => d.isDirectory() && /^\d{4}-\d{2}$/.test(d.name))
    .map((d) => d.name)
    .filter((s) => ONLY.size === 0 || ONLY.has(s))
    .sort();

  const entries = [];
  for (const season of seasons) {
    for (const name of await fs.readdir(path.join(SRC, season))) {
      if (!name.endsWith(".json")) continue;
      entries.push({ key: `${season}/${name}`, file: path.join(SRC, season, name) });
    }
  }
  if (entries.length === 0) {
    console.error(`No shot files under ${path.relative(ROOT, SRC)}. Run npm run shots:sync first.`);
    process.exit(1);
  }

  const listFile = path.join(os.tmpdir(), `drbl-shots-r2-${Date.now()}.json`);
  await fs.writeFile(listFile, JSON.stringify(entries));
  console.log(`Uploading ${entries.length} files from ${seasons.length} seasons to r2://${BUCKET}`);

  const result = spawnSync(
    "npx",
    [
      "wrangler", "r2", "bulk", "put", BUCKET,
      "--remote",
      "--filename", listFile,
      "--content-type", "application/json",
      "--concurrency", CONCURRENCY,
    ],
    { stdio: "inherit" }
  );
  await fs.rm(listFile, { force: true });
  process.exit(result.status ?? 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
