/**
 * Storylines and rating talk measured from topic tags on stored headlines and
 * fan posts. Pure: callers pass scored items and lookups.
 */

import { conversationWeighted, type ScoredIngestItem } from "@/sentiment/ingest-aggregate";
import type {
  SentimentHeadlineExemplar,
  SentimentRatingTalk,
  SentimentStoryline,
  SentimentStorylinePlayer,
} from "@/sentiment/curated-types";

const DAY_MS = 86_400_000;

export const RATING_TOPICS = ["overrated", "underrated"] as const;

/** The day fan posts started getting the overrated / underrated tags at ingest. */
export const RATING_FAN_TAGGED_SINCE = "2026-10-08";

const NOT_STORYLINES = new Set<string>(["general", ...RATING_TOPICS]);

export type StorylineInput = {
  media: ScoredIngestItem[];
  /** Items with player ids, for player rows. */
  fanPlayers: ScoredIngestItem[];
  /** Every fan item once, for topic totals and daily volume. */
  fanAll: ScoredIngestItem[];
  now: Date;
  windowDays: number;
  seriesDays: number;
  name: (playerId: string) => { name: string; teamKey?: string } | undefined;
  /**
   * Headline exemplar for a stored news item, rated toward the player when
   * possible. Return undefined to skip it (say, the title doesn't name the
   * player); the next newest is tried.
   */
  headline: (itemId: string, playerId: string) => SentimentHeadlineExemplar | undefined;
};

type Bucket = { items: ScoredIngestItem[] };

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function within(item: ScoredIngestItem, startMs: number, endMs: number): boolean {
  const t = Date.parse(item.date);
  return t > startMs && t <= endMs;
}

/** Drops leading and trailing days with no data on either side. */
function trimEmptyDays<T extends { fan: number | null; media: number | null }>(days: T[]): T[] {
  const has = (day: T) => day.fan != null || day.media != null;
  const first = days.findIndex(has);
  if (first < 0) return [];
  let last = days.length - 1;
  while (!has(days[last])) last -= 1;
  return days.slice(first, last + 1);
}

/** Mean tone with comment threads down-weighted; blank under `floor` items. */
function tone(items: ScoredIngestItem[], floor: number): number | undefined {
  return items.length >= floor ? round2(conversationWeighted(items).mean) : undefined;
}

function towardPlayer(item: ScoredIngestItem, playerId: string): ScoredIngestItem {
  const own = item.playerScores?.[playerId];
  return own === undefined ? item : { ...item, score: own };
}

function playersFor(
  topic: string,
  media: ScoredIngestItem[],
  fan: ScoredIngestItem[],
  input: StorylineInput,
  limit: number,
  toneFloor: number
): { rows: SentimentStorylinePlayer[]; count: number } {
  const byPlayer = new Map<string, { media: ScoredIngestItem[]; fan: ScoredIngestItem[] }>();
  const add = (side: "media" | "fan", item: ScoredIngestItem) => {
    if (!item.topics.includes(topic)) return;
    for (const id of item.playerIds) {
      const hit = byPlayer.get(id) ?? { media: [], fan: [] };
      hit[side].push(towardPlayer(item, id));
      byPlayer.set(id, hit);
    }
  };
  for (const item of media) add("media", item);
  for (const item of fan) add("fan", item);

  const rows: SentimentStorylinePlayer[] = [];
  for (const [playerId, hit] of byPlayer) {
    const who = input.name(playerId);
    if (!who) continue;
    let headline: SentimentHeadlineExemplar | undefined;
    for (const item of [...hit.media].sort((a, b) => b.date.localeCompare(a.date))) {
      headline = input.headline(item.id, playerId);
      if (headline) break;
    }
    const fanScore = tone(hit.fan, toneFloor);
    const mediaScore = tone(hit.media, toneFloor);
    rows.push({
      playerId,
      displayName: who.name,
      ...(who.teamKey ? { teamKey: who.teamKey } : {}),
      fanCount: hit.fan.length,
      mediaCount: hit.media.length,
      ...(fanScore !== undefined ? { fanScore } : {}),
      ...(mediaScore !== undefined ? { mediaScore } : {}),
      ...(headline ? { headline } : {}),
    });
  }
  rows.sort(
    (a, b) =>
      b.fanCount + b.mediaCount - (a.fanCount + a.mediaCount) || a.displayName.localeCompare(b.displayName)
  );
  return { rows: rows.slice(0, limit), count: byPlayer.size };
}

/**
 * The biggest topics of the window, each with its daily share of the talk,
 * tone on both sides and the players carrying it. Fan and media are counted
 * separately.
 */
export function buildStorylines(
  input: StorylineInput,
  options: {
    limit: number;
    playerLimit: number;
    minItems: number;
    toneFloor: number;
    /** Fewest items on a day before that side's share is shown. */
    dailyFloor: { fan: number; media: number };
    /** Fewest headlines in the previous window before its share is compared. */
    priorMediaFloor: number;
  }
): SentimentStoryline[] {
  const nowMs = input.now.getTime();
  const startMs = nowMs - input.windowDays * DAY_MS;
  const priorStartMs = startMs - input.windowDays * DAY_MS;
  const seriesStartMs = nowMs - input.seriesDays * DAY_MS;

  const current = (items: ScoredIngestItem[]) => items.filter((item) => within(item, startMs, nowMs));
  const media = current(input.media);
  const fanAll = current(input.fanAll);
  const fanPlayers = current(input.fanPlayers);

  const buckets = new Map<string, { media: Bucket; fan: Bucket }>();
  const tally = (side: "media" | "fan", items: ScoredIngestItem[]) => {
    for (const item of items) {
      for (const topic of new Set(item.topics)) {
        if (NOT_STORYLINES.has(topic)) continue;
        const hit = buckets.get(topic) ?? { media: { items: [] }, fan: { items: [] } };
        hit[side].items.push(item);
        buckets.set(topic, hit);
      }
    }
  };
  tally("media", media);
  tally("fan", fanAll);

  const priorMedia = input.media.filter((item) => within(item, priorStartMs, startMs));
  const shareOf = (items: ScoredIngestItem[], topic: string) =>
    Math.round((items.filter((item) => item.topics.includes(topic)).length / items.length) * 1000) / 1000;

  const days: string[] = [];
  for (let t = seriesStartMs + DAY_MS; t <= nowMs; t += DAY_MS) {
    days.push(new Date(t).toISOString().slice(0, 10));
  }
  const byDay = (items: ScoredIngestItem[]) => {
    const map = new Map<string, ScoredIngestItem[]>();
    for (const item of items) {
      if (!within(item, seriesStartMs, nowMs)) continue;
      const day = item.date.slice(0, 10);
      const list = map.get(day);
      if (list) list.push(item);
      else map.set(day, [item]);
    }
    return map;
  };
  const mediaByDay = byDay(input.media);
  const fanByDay = byDay(input.fanAll);
  const dayShare = (items: ScoredIngestItem[] | undefined, topic: string, floor: number) =>
    items && items.length >= floor ? shareOf(items, topic) : null;

  return [...buckets.entries()]
    .map(([topic, hit]) => ({ topic, hit, total: hit.media.items.length + hit.fan.items.length }))
    .filter((row) => row.total >= options.minItems)
    .sort((a, b) => b.total - a.total || a.topic.localeCompare(b.topic))
    .slice(0, options.limit)
    .map(({ topic, hit }) => {
      const players = playersFor(topic, media, fanPlayers, input, options.playerLimit, options.toneFloor);
      const fanScore = tone(hit.fan.items, options.toneFloor);
      const mediaScore = tone(hit.media.items, options.toneFloor);
      return {
        topic,
        fanCount: hit.fan.items.length,
        mediaCount: hit.media.items.length,
        playerCount: players.count,
        mediaShare: media.length ? shareOf(media, topic) : 0,
        priorMediaShare:
          priorMedia.length >= options.priorMediaFloor ? shareOf(priorMedia, topic) : null,
        ...(fanScore !== undefined ? { fanScore } : {}),
        ...(mediaScore !== undefined ? { mediaScore } : {}),
        daily: trimEmptyDays(
          days.map((date) => ({
            date,
            fan: dayShare(fanByDay.get(date), topic, options.dailyFloor.fan),
            media: dayShare(mediaByDay.get(date), topic, options.dailyFloor.media),
          }))
        ),
        players: players.rows,
      };
    });
}

/** Who gets called overrated or underrated, over a longer window since the tags are rare. */
export function buildRatingTalk(
  input: StorylineInput,
  options: { playerLimit: number; toneFloor: number }
): SentimentRatingTalk {
  const nowMs = input.now.getTime();
  const startMs = nowMs - input.windowDays * DAY_MS;
  const current = (items: ScoredIngestItem[]) => items.filter((item) => within(item, startMs, nowMs));
  const media = current(input.media);
  const fanAll = current(input.fanAll);
  const fanPlayers = current(input.fanPlayers);
  const side = (topic: (typeof RATING_TOPICS)[number]) => ({
    fanCount: fanAll.filter((item) => item.topics.includes(topic)).length,
    mediaCount: media.filter((item) => item.topics.includes(topic)).length,
    players: playersFor(topic, media, fanPlayers, input, options.playerLimit, options.toneFloor).rows,
  });
  return {
    windowDays: input.windowDays,
    fanTaggedSince: RATING_FAN_TAGGED_SINCE,
    overrated: side("overrated"),
    underrated: side("underrated"),
  };
}
