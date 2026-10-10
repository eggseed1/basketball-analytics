/**
 * Append-only monthly JSONL stores for automated sentiment ingest.
 * Node-only (scripts + sentiment:build); the Worker reads the built snapshot.
 *
 * News rows keep the headline and link so the UI can cite exemplars.
 * Bluesky and YouTube rows keep keyed-hash ids, counts and scores only, and
 * are deleted once they are older than FAN_POST_RETENTION_DAYS. Reddit keeps
 * no per-post rows at all, only daily averages per player, team and league.
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

export const INGEST_ROOT = path.join(process.cwd(), "data", "sentiment", "ingest", "v1");

export type NewsIngestItem = {
  id: string;
  url: string;
  title: string;
  outlet: string;
  feedId: string;
  publishedAt: string;
  fetchedAt: string;
  score: number;
  hits: string[];
  topics: string[];
  /** False for other-sport items that ride along in general feeds. */
  nba: boolean;
  playerIds: string[];
  teamIds: string[];
  modelVersion: string;
  /** Reporters credited in the headline or summary (names only; summary text is not kept). */
  reporters?: { name: string; outlet?: string }[];
};

/**
 * One day's Reddit tone for one player, team or the whole league, built from
 * post titles seen in the 24 hours before a run. Post ids, links, titles,
 * authors and vote counts are discarded after scoring.
 */
export type RedditDailyItem = {
  /** `${date}|${scope}|${entityId}`; a second run on the same day is skipped. */
  id: string;
  date: string;
  scope: "player" | "team" | "league";
  /** ESPN player or team id; "nba" for the league row. */
  entityId: string;
  posts: number;
  meanScore: number;
  topicCounts: Record<string, number>;
  modelVersion: string;
};

/**
 * A Bluesky post or YouTube comment. The id is a keyed hash of the platform
 * id, and no text, handle or author is kept.
 */
export type FanPostIngestItem = {
  id: string;
  platform: "bluesky" | "youtube";
  /** Search query id (Bluesky) or channel id (YouTube). */
  source: string;
  /** YouTube only: hash of the video id, so comments under one video share weight. */
  thread?: string;
  createdAt: string;
  fetchedAt: string;
  /** Bluesky only; YouTube API stats may not be kept past 30 days. */
  likes?: number;
  score: number;
  topics: string[];
  playerIds: string[];
  teamIds: string[];
  modelVersion: string;
  /** Model tone toward each named player, rated at ingest; players left out keep `score`. */
  playerTones?: Record<string, -1 | 0 | 1>;
  toneModelVersion?: string;
};

/**
 * A language model's rating of one stored headline's tone toward one player it
 * names. Kept apart from the headline rows so older headlines can be rated later.
 */
export type HeadlineToneItem = {
  /** `${store}:${rowId}:${playerId}` */
  id: string;
  store: "news" | "fanblogs";
  rowId: string;
  playerId: string;
  publishedAt: string;
  tone: -1 | 0 | 1;
  modelVersion: string;
  ratedAt: string;
};

/**
 * news: national outlets. fanblogs: team fan blogs (same row shape as news).
 * headline-tones: model ratings for rows in those two stores.
 */
export type IngestSource =
  | "news"
  | "reddit"
  | "fanblogs"
  | "bluesky"
  | "youtube"
  | "headline-tones";

function sourceDir(source: IngestSource): string {
  return path.join(INGEST_ROOT, source);
}

export function readIngestItems<T extends { id: string }>(source: IngestSource): T[] {
  const dir = sourceDir(source);
  if (!existsSync(dir)) return [];
  const rows: T[] = [];
  const seen = new Set<string>();
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".jsonl")).sort()) {
    const body = readFileSync(path.join(dir, file), "utf8");
    for (const line of body.split("\n")) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line) as T;
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        rows.push(row);
      } catch {
        // tolerate a torn final line from an interrupted run
      }
    }
  }
  return rows;
}

/** The privacy page promises per-post rows are gone within 30 days. */
export const FAN_POST_RETENTION_DAYS = 29;

export const FAN_POST_SOURCES = ["bluesky", "youtube"] as const;

/** First UTC day still kept as rows; earlier days live only in the history files. */
export function fanPostCutoffDay(now: Date): string {
  return new Date(now.getTime() - FAN_POST_RETENTION_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** Rewrites a store keeping only rows that pass `keep`; returns how many were dropped. */
export function pruneIngestItems<T extends { id: string }>(
  source: IngestSource,
  keep: (row: T) => boolean
): number {
  const dir = sourceDir(source);
  if (!existsSync(dir)) return 0;
  let dropped = 0;
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".jsonl"))) {
    const filePath = path.join(dir, file);
    const kept: string[] = [];
    for (const line of readFileSync(filePath, "utf8").split("\n")) {
      if (!line.trim()) continue;
      let row: T;
      try {
        row = JSON.parse(line) as T;
      } catch {
        dropped += 1;
        continue;
      }
      if (keep(row)) kept.push(line);
      else dropped += 1;
    }
    if (kept.length) writeFileSync(filePath, `${kept.join("\n")}\n`);
    else rmSync(filePath);
  }
  return dropped;
}

/** Appends rows not already stored; returns how many were new. */
export function appendIngestItems<T extends { id: string }>(
  source: IngestSource,
  rows: T[],
  dateOf: (row: T) => string
): number {
  const existing = new Set(readIngestItems<T>(source).map((row) => row.id));
  const dir = sourceDir(source);
  mkdirSync(dir, { recursive: true });
  const byMonth = new Map<string, string[]>();
  for (const row of rows) {
    if (existing.has(row.id)) continue;
    existing.add(row.id);
    const month = dateOf(row).slice(0, 7);
    const lines = byMonth.get(month) ?? [];
    lines.push(JSON.stringify(row));
    byMonth.set(month, lines);
  }
  let added = 0;
  for (const [month, lines] of byMonth) {
    appendFileSync(path.join(dir, `${month}.jsonl`), `${lines.join("\n")}\n`);
    added += lines.length;
  }
  return added;
}
