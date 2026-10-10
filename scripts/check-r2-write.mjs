#!/usr/bin/env node
/**
 * Prove the CI Cloudflare token can still write to the R2 archive buckets.
 *
 * The season-close archive step only runs June 25-30, so a token that lost
 * (or never had) R2 write access would otherwise surface on the one week it
 * matters. This writes a tiny object under _ci/ in each bucket once a week
 * (first run on Mondays, or always with FORCE=1) and turns the run red on any
 * failure.
 *
 *   node scripts/check-r2-write.mjs
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const BUCKETS = [
  process.env.GAMELOGS_BUCKET || "drbl-player-game-logs",
  process.env.SHOTS_BUCKET || "drbl-player-shots",
  process.env.GAME_ARCHIVE_BUCKET || "drbl-game-archive",
];

const now = new Date();
if (!process.env.FORCE && (now.getUTCDay() !== 1 || now.getUTCHours() >= 14)) {
  console.log("[r2-write] runs on the first Monday run; skipping");
  process.exit(0);
}
if (!process.env.CLOUDFLARE_API_TOKEN) {
  console.error("::error title=R2 write probe::CLOUDFLARE_API_TOKEN is empty");
  process.exit(1);
}

const probe = path.join(os.tmpdir(), `drbl-r2-probe-${Date.now()}.txt`);
await fs.writeFile(probe, `${now.toISOString()}\n`);
const failed = [];
for (const bucket of BUCKETS) {
  const put = spawnSync(
    "npx",
    ["wrangler", "r2", "object", "put", `${bucket}/_ci/write-probe.txt`, "--remote", "--file", probe],
    { stdio: "inherit" }
  );
  console.log(`[r2-write] ${bucket}: ${put.status === 0 ? "ok" : `failed (exit ${put.status})`}`);
  if (put.status !== 0) failed.push(bucket);
}
await fs.rm(probe, { force: true });

if (failed.length) {
  console.error(
    `::error title=R2 write access missing::CLOUDFLARE_API_TOKEN could not write to ${failed.join(", ")}; the June 25-30 season archive to R2 will fail until the token gets R2 edit permission`
  );
  process.exit(1);
}
