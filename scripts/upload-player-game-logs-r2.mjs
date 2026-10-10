/**
 * Upload the local player game log bake to R2 so CI deploys serve past seasons.
 * public/runtime/player-game-logs is gitignored and CI only rebakes the current
 * season, so older seasons exist only on a machine that ran `npm run gamelogs:sync`.
 *
 * Keys mirror the static asset paths: manifest.json and {season}/{nbaPlayerId}.json
 *
 *   node scripts/upload-player-game-logs-r2.mjs
 *   SEASONS=2025-26 node scripts/upload-player-game-logs-r2.mjs
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "public", "runtime", "player-game-logs");
const BUCKET = process.env.GAMELOGS_BUCKET || "drbl-player-game-logs";
const CONCURRENCY = process.env.GAMELOGS_R2_CONCURRENCY || "20";
const ONLY = new Set(
  (process.env.SEASONS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

/** Cloudflare allows 1,200 API calls per 5 minutes across the whole account. */
const BATCH = 1000;
const WINDOW_MS = 5 * 60 * 1000 + 15_000;

async function main() {
  const seasons = (await fs.readdir(SRC, { withFileTypes: true }))
    .filter((d) => d.isDirectory() && /^\d{4}-\d{2}$/.test(d.name))
    .map((d) => d.name)
    .filter((s) => ONLY.size === 0 || ONLY.has(s))
    .sort((a, b) => b.localeCompare(a));

  const entries = [];
  for (const season of seasons) {
    for (const name of await fs.readdir(path.join(SRC, season))) {
      if (!name.endsWith(".json")) continue;
      entries.push({ key: `${season}/${name}`, file: path.join(SRC, season, name) });
    }
  }
  if (entries.length === 0) {
    console.error(`No game log files under ${path.relative(ROOT, SRC)}. Run npm run gamelogs:sync first.`);
    process.exit(1);
  }
  // Last, so the season list never points at logs that haven't landed yet.
  const manifest = await mergedManifest();
  if (manifest) entries.push({ key: "manifest.json", file: manifest });

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

/**
 * A partial bake (CI holds only the current season) must not replace the
 * bucket's season list, so the local manifest is unioned with the one in R2.
 * Returns null, and the manifest is left alone, when R2's copy can't be read.
 */
async function mergedManifest() {
  const local = JSON.parse(await fs.readFile(path.join(SRC, "manifest.json"), "utf8"));
  const remoteFile = path.join(os.tmpdir(), `drbl-gamelogs-manifest-${Date.now()}.json`);
  const got = spawnSync(
    "npx",
    ["wrangler", "r2", "object", "get", `${BUCKET}/manifest.json`, "--remote", "--file", remoteFile],
    { stdio: "inherit" }
  );
  let remote;
  try {
    if (got.status !== 0) throw new Error(`wrangler exited ${got.status}`);
    remote = JSON.parse(await fs.readFile(remoteFile, "utf8"));
  } catch (error) {
    console.warn(`Could not read r2://${BUCKET}/manifest.json (${error.message}); leaving it unchanged.`);
    return null;
  } finally {
    await fs.rm(remoteFile, { force: true });
  }
  const newestFirst = (list) => [...new Set(list)].sort((a, b) => b.localeCompare(a));
  const merged = {
    ...remote,
    ...local,
    seasons: newestFirst([...(remote.seasons ?? []), ...(local.seasons ?? [])]),
    seasonCounts: { ...(remote.seasonCounts ?? {}), ...(local.seasonCounts ?? {}) },
    usableSeasons: newestFirst([...(remote.usableSeasons ?? []), ...(local.usableSeasons ?? [])]),
  };
  const out = path.join(os.tmpdir(), `drbl-gamelogs-manifest-merged-${Date.now()}.json`);
  await fs.writeFile(out, JSON.stringify(merged));
  console.log(`Manifest seasons: ${merged.usableSeasons.join(", ")}`);
  return out;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function uploadBatch(batch) {
  const listFile = path.join(os.tmpdir(), `drbl-gamelogs-r2-${Date.now()}.json`);
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
