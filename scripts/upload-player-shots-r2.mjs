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

  console.log(`Uploading ${entries.length} files from ${seasons.length} seasons to r2://${BUCKET}`);

  for (let start = 0; start < entries.length; start += BATCH) {
    const batch = entries.slice(start, start + BATCH);
    let ok = false;
    for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
      if (start > 0 || attempt > 1) {
        console.log(`Waiting out the API rate window (${WINDOW_MS / 1000}s)…`);
        await sleep(WINDOW_MS);
      }
      console.log(`Batch ${start + 1}-${start + batch.length}, attempt ${attempt}`);
      ok = await uploadBatch(batch);
    }
    if (!ok) {
      console.error(`Batch starting at ${batch[0].key} failed three times.`);
      process.exit(1);
    }
  }
  console.log("Done.");
}

/** Cloudflare allows 1,200 API calls per 5 minutes across the whole account. */
const BATCH = 1000;
const WINDOW_MS = 5 * 60 * 1000 + 15_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function uploadBatch(batch) {
  const listFile = path.join(os.tmpdir(), `drbl-shots-r2-${Date.now()}.json`);
  await fs.writeFile(listFile, JSON.stringify(batch));
  const result = spawnSync(
    "npx",
    [
      "wrangler", "r2", "bulk", "put", BUCKET,
      "--remote",
      "--force",
      "--filename", listFile,
      "--content-type", "application/json",
      "--concurrency", CONCURRENCY,
    ],
    { stdio: "inherit" }
  );
  await fs.rm(listFile, { force: true });
  return result.status === 0;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
