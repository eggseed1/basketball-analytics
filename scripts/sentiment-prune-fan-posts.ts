/**
 * Deletes Bluesky and YouTube rows from before the retention cutoff. Runs
 * after sentiment:build, which keeps those days' daily fan points in the
 * per-player history files.
 *
 *   npx tsx scripts/sentiment-prune-fan-posts.ts [--dry-run]
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import type { SentimentHistoryFile } from "@/sentiment/game-reaction";
import {
  FAN_POST_SOURCES,
  fanPostCutoffDay,
  pruneIngestItems,
  readIngestItems,
  type FanPostIngestItem,
} from "@/sentiment/ingest-store";

const HISTORY_DIR = path.join(process.cwd(), "public", "runtime", "sentiment-history");
/** Older history means sentiment:build didn't run this time, so the days about to go aren't saved yet. */
const MAX_HISTORY_AGE_MS = 6 * 3_600_000;

function latestHistoryBuild(): number | null {
  if (!existsSync(HISTORY_DIR)) return null;
  const name = readdirSync(HISTORY_DIR).find((f) => f.endsWith(".json"));
  if (!name) return null;
  const file = JSON.parse(readFileSync(path.join(HISTORY_DIR, name), "utf8")) as SentimentHistoryFile;
  const builtAt = Date.parse(file.builtAt);
  return Number.isFinite(builtAt) ? builtAt : null;
}

function main() {
  const dryRun = process.argv.includes("--dry-run");
  const now = new Date();
  const cutoffDay = fanPostCutoffDay(now);
  const builtAt = latestHistoryBuild();
  if (builtAt === null || now.getTime() - builtAt > MAX_HISTORY_AGE_MS) {
    throw new Error("sentiment history is stale or missing; run sentiment:build before pruning");
  }
  const keep = (row: FanPostIngestItem) => row.createdAt.slice(0, 10) >= cutoffDay;
  for (const source of FAN_POST_SOURCES) {
    const dropped = dryRun
      ? readIngestItems<FanPostIngestItem>(source).filter((row) => !keep(row)).length
      : pruneIngestItems<FanPostIngestItem>(source, keep);
    console.log(`sentiment:prune ${source} cutoff=${cutoffDay} ${dryRun ? "would drop" : "dropped"}=${dropped}`);
  }
}

main();
