/**
 * Upload the local game archive to R2 so CI deploys can serve it.
 *   data/drbl/raw/games/{nbaGameId}/{boxscore,playbyplay}.json → games/{nbaGameId}/…
 *   public/runtime/play-by-play/{espnGameId}.json               → play-by-play/{espnGameId}.json
 * Both trees are gitignored and CI can't rebuild them (stats.nba.com blocks
 * runners, and the play-by-play bake isn't part of the nightly job).
 *
 *   node scripts/upload-game-archive-r2.mjs
 *   ONLY=play-by-play node scripts/upload-game-archive-r2.mjs
 *   FROM_BATCH=4 node scripts/upload-game-archive-r2.mjs   # resume after a failure
 */
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const RAW_GAMES = path.join(ROOT, "data", "drbl", "raw", "games");
const BAKED_PBP = path.join(ROOT, "public", "runtime", "play-by-play");
const BUCKET = process.env.GAME_ARCHIVE_BUCKET || "drbl-game-archive";
const CONCURRENCY = process.env.GAME_ARCHIVE_R2_CONCURRENCY || "20";
const ONLY = process.env.ONLY || "";
const FROM_BATCH = Math.max(1, Number(process.env.FROM_BATCH || 1));

/** Cloudflare allows 1,200 API calls per 5 minutes across the whole account. */
const BATCH = 1000;
const WINDOW_MS = 5 * 60 * 1000 + 15_000;
const RAW_FILES = ["boxscore.json", "playbyplay.json"];

async function bakedEntries() {
  if (!existsSync(BAKED_PBP)) return [];
  return (await fs.readdir(BAKED_PBP))
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => ({ key: `play-by-play/${name}`, file: path.join(BAKED_PBP, name) }));
}

async function rawEntries() {
  if (!existsSync(RAW_GAMES)) return [];
  const ids = (await fs.readdir(RAW_GAMES)).filter((id) => /^\d{10}$/.test(id));
  // Newest games first, so a partial upload covers the seasons people open most.
  ids.sort((a, b) => b.localeCompare(a));
  const out = [];
  for (const id of ids) {
    for (const name of RAW_FILES) {
      const file = path.join(RAW_GAMES, id, name);
      if (existsSync(file)) out.push({ key: `games/${id}/${name}`, file });
    }
  }
  return out;
}

async function main() {
  const entries = [
    ...(ONLY && ONLY !== "play-by-play" ? [] : await bakedEntries()),
    ...(ONLY && ONLY !== "games" ? [] : await rawEntries()),
  ];
  if (entries.length === 0) {
    console.error("Nothing to upload: no local game archive or baked play-by-play.");
    process.exit(1);
  }
  const batches = Math.ceil(entries.length / BATCH);
  console.log(`Uploading ${entries.length} files in ${batches} batches to r2://${BUCKET}`);

  for (let index = FROM_BATCH - 1; index < batches; index++) {
    const batch = entries.slice(index * BATCH, (index + 1) * BATCH);
    let ok = false;
    for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
      if (index > FROM_BATCH - 1 || attempt > 1) {
        console.log(`Waiting out the API rate window (${WINDOW_MS / 1000}s)…`);
        await sleep(WINDOW_MS);
      }
      console.log(`Batch ${index + 1}/${batches} (${batch[0].key}), attempt ${attempt}`);
      ok = await uploadBatch(batch);
    }
    if (!ok) {
      console.error(`Batch ${index + 1} failed three times. Resume with FROM_BATCH=${index + 1}.`);
      process.exit(1);
    }
  }
  console.log("Done.");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function uploadBatch(batch) {
  const listFile = path.join(os.tmpdir(), `drbl-game-archive-r2-${Date.now()}.json`);
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
