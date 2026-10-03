/**
 * Append-only monthly JSONL stores for automated sentiment ingest.
 * Node-only (scripts + sentiment:build); the Worker reads the built snapshot.
 *
 * News rows keep the headline and link so the UI can cite exemplars.
 * Reddit rows keep ids, counts and scores only (S0: exemplar ids, not raw posts).
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
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

export type RedditIngestItem = {
  id: string;
  subreddit: string;
  permalink: string;
  createdAt: string;
  fetchedAt: string;
  upvotes: number;
  comments: number;
  score: number;
  topics: string[];
  playerIds: string[];
  teamIds: string[];
  modelVersion: string;
};

export type IngestSource = "news" | "reddit";

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
