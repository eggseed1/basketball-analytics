/**
 * Turn stored ingest items (news headlines, Reddit post titles) into
 * windowed lanes, daily series and exemplars. Pure: no fs, no fetch.
 */

import type {
  CuratedSentimentLane,
  SentimentHeadlineExemplar,
  SentimentLaneOrigin,
  SentimentSeriesPoint,
} from "@/sentiment/curated-types";
import type { SentimentPlatform } from "@/sentiment/types";

export type ScoredIngestItem = {
  id: string;
  date: string;
  score: number;
  topics: string[];
  playerIds: string[];
  teamIds: string[];
  /** Set when one lane blends several platforms (the fan lane). */
  platform?: SentimentPlatform;
  /**
   * Items sharing a conversation (comments under one video) share its weight.
   * Unset means the item is its own conversation.
   */
  conversation?: string;
};

export type LaneBuildOptions = {
  origin: SentimentLaneOrigin;
  platform: SentimentPlatform;
  modelVersion: string;
  now: Date;
  windowDays: number;
  seriesDays: number;
  floor: number;
};

const DAY_MS = 86_400_000;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * A conversation with n items weighs sqrt(n) in total, so 100 comments under
 * one video count about like 10, while 100 separate posts count as 100.
 */
function conversationWeighted(items: ScoredIngestItem[]): { mean: number; weight: number } {
  const sizes = new Map<string, number>();
  for (const item of items) {
    if (item.conversation) sizes.set(item.conversation, (sizes.get(item.conversation) ?? 0) + 1);
  }
  let total = 0;
  let weighted = 0;
  for (const item of items) {
    const w = item.conversation ? 1 / Math.sqrt(sizes.get(item.conversation)!) : 1;
    total += w;
    weighted += w * item.score;
  }
  return { mean: total ? weighted / total : 0, weight: total };
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function polarityFromScore(score: number): CuratedSentimentLane["polarity"] {
  if (score >= 0.2) return "positive";
  if (score <= -0.2) return "negative";
  if (Math.abs(score) < 0.08) return "neutral";
  return "mixed";
}

function inRange(item: ScoredIngestItem, startMs: number, endMs: number): boolean {
  const t = Date.parse(item.date);
  return t > startMs && t <= endMs;
}

export function dailyScoreSeries(
  items: ScoredIngestItem[],
  sinceMs: number,
  untilMs: number
): SentimentSeriesPoint[] {
  const byDay = new Map<string, ScoredIngestItem[]>();
  for (const item of items) {
    if (!inRange(item, sinceMs, untilMs)) continue;
    const key = dayKey(item.date);
    const list = byDay.get(key) ?? [];
    list.push(item);
    byDay.set(key, list);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dayItems]) => ({
      date,
      score: round2(conversationWeighted(dayItems).mean),
      count: dayItems.length,
    }));
}

/**
 * Lane over the trailing window. Returns null below the floor so the UI
 * shows a blank lane, never a neutral one.
 */
export function buildIngestLane(
  items: ScoredIngestItem[],
  options: LaneBuildOptions
): { lane: CuratedSentimentLane; series: SentimentSeriesPoint[] } | null {
  const nowMs = options.now.getTime();
  const windowStartMs = nowMs - options.windowDays * DAY_MS;
  const current = items.filter((item) => inRange(item, windowStartMs, nowMs));
  if (current.length < options.floor) return null;
  const prior = items.filter((item) =>
    inRange(item, windowStartMs - options.windowDays * DAY_MS, windowStartMs)
  );

  const weighted = conversationWeighted(current);
  const score = round2(weighted.mean);
  const priorScore =
    prior.length >= options.floor ? round2(conversationWeighted(prior).mean) : null;
  let direction: CuratedSentimentLane["direction"] = "stable";
  if (priorScore != null) {
    if (score - priorScore >= 0.1) direction = "rising";
    else if (score - priorScore <= -0.1) direction = "falling";
  }

  const topicCounts: Record<string, number> = {};
  for (const item of current) {
    for (const topic of item.topics) {
      if (topic === "general") continue;
      topicCounts[topic] = (topicCounts[topic] ?? 0) + 1;
    }
  }
  const topicTotal = Object.values(topicCounts).reduce((a, b) => a + b, 0);
  const topicBreakdown: Record<string, number> = {};
  for (const [topic, count] of Object.entries(topicCounts)) {
    topicBreakdown[topic] = Math.round((count / topicTotal) * 1000) / 1000;
  }

  const platformCounts: Partial<Record<SentimentPlatform, number>> = {};
  for (const item of current) {
    const platform = item.platform ?? options.platform;
    platformCounts[platform] = (platformCounts[platform] ?? 0) + 1;
  }
  const platformBreakdown: Partial<Record<SentimentPlatform, number>> = {};
  for (const [platform, count] of Object.entries(platformCounts) as [SentimentPlatform, number][]) {
    platformBreakdown[platform] = Math.round((count / current.length) * 1000) / 1000;
  }

  const dates = current.map((item) => dayKey(item.date)).sort();
  return {
    lane: {
      polarity: polarityFromScore(score),
      score,
      direction,
      mentionVolume: current.length,
      coverageConfidence: round2(Math.min(0.95, 0.35 + Math.log10(weighted.weight + 1) * 0.12)),
      platformBreakdown,
      topicBreakdown,
      origin: options.origin,
      asOf: dates[dates.length - 1],
      windowStart: dates[0],
      modelVersion: options.modelVersion,
      priorScore,
    },
    series: dailyScoreSeries(items, nowMs - options.seriesDays * DAY_MS, nowMs),
  };
}

export function groupByEntity(
  items: ScoredIngestItem[],
  key: "playerIds" | "teamIds"
): Map<string, ScoredIngestItem[]> {
  const out = new Map<string, ScoredIngestItem[]>();
  for (const item of items) {
    for (const id of item[key]) {
      const list = out.get(id) ?? [];
      list.push(item);
      out.set(id, list);
    }
  }
  return out;
}

export function latestExemplars<T extends SentimentHeadlineExemplar>(
  rows: T[],
  limit: number
): T[] {
  const seenTitles = new Set<string>();
  return [...rows]
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .filter((row) => {
      const key = row.title.toLowerCase();
      if (seenTitles.has(key)) return false;
      seenTitles.add(key);
      return true;
    })
    .slice(0, limit);
}
