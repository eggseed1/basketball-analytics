/**
 * Stored Bluesky and YouTube ids are HMACs keyed by SENTIMENT_ID_KEY, so
 * someone holding a post can't look it up in the public ingest files.
 */
import { createHash, createHmac } from "node:crypto";

import {
  fanPostCutoffDay,
  readIngestItems,
  type FanPostIngestItem,
} from "@/sentiment/ingest-store";

/** Without the key (dry runs and samples only) this falls back to the legacy unkeyed hash. */
export function fanPostId(platformId: string): string {
  const key = process.env.SENTIMENT_ID_KEY;
  if (!key) return legacyFanPostId(platformId);
  return createHmac("sha256", key).update(platformId).digest("hex").slice(0, 16);
}

export function legacyFanPostId(platformId: string): string {
  return createHash("sha1").update(platformId).digest("hex").slice(0, 16);
}

export function requireFanPostKey(): void {
  if (!process.env.SENTIMENT_ID_KEY) {
    throw new Error("SENTIMENT_ID_KEY is not set; fan-post rows are only stored under keyed ids");
  }
}

/**
 * Drops rows older than the retention cutoff and rows already stored under
 * their legacy unkeyed id (rows from before ids were keyed).
 */
export function freshFanPosts(
  source: "bluesky" | "youtube",
  rows: FanPostIngestItem[],
  legacyIdOf: Map<string, string>,
  now: Date
): FanPostIngestItem[] {
  const cutoffDay = fanPostCutoffDay(now);
  const stored = new Set(readIngestItems<FanPostIngestItem>(source).map((row) => row.id));
  return rows.filter((row) => {
    if (row.createdAt.slice(0, 10) < cutoffDay) return false;
    const legacy = legacyIdOf.get(row.id);
    return !(legacy && stored.has(legacy));
  });
}
