import "server-only";

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { cache } from "react";

import type {
  LeagueSentimentFeed,
  PlayerSentimentProfile,
  SentimentCuratedSnapshot,
  SentimentMoodSeries,
  SentimentSeriesPoint,
  SentimentWindowId,
  TrackedPlayerSentimentRow,
} from "@/sentiment/curated-types";

export type {
  LeagueSentimentFeed,
  SentimentWindowId,
  TrackedPlayerSentimentRow,
} from "@/sentiment/curated-types";
export { SENTIMENT_WINDOW_OPTIONS } from "@/sentiment/curated-types";

const ROOT = () => path.join(process.cwd(), "data", "sentiment", "v1");

export const loadSentimentSnapshot = cache((): SentimentCuratedSnapshot | null => {
  const p = path.join(ROOT(), "snapshot.json");
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as SentimentCuratedSnapshot;
  } catch {
    return null;
  }
});

export function getPlayerSentimentProfile(
  playerIds: Set<string>
): (PlayerSentimentProfile & { disclaimer: string }) | null {
  const snapshot = loadSentimentSnapshot();
  if (!snapshot || playerIds.size === 0) return null;
  const hit = snapshot.players.find((row) =>
    row.playerIds.some((id) => playerIds.has(id))
  );
  if (!hit) return null;
  return { ...hit, disclaimer: snapshot.meta.disclaimer };
}

export function buildCuratedPlayerIndex(
  snapshot: SentimentCuratedSnapshot | null
): Map<string, PlayerSentimentProfile> {
  const byId = new Map<string, PlayerSentimentProfile>();
  if (!snapshot) return byId;
  for (const row of snapshot.players) {
    for (const id of row.playerIds) byId.set(id, row);
  }
  return byId;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function expandSeriesBackward(
  points: SentimentSeriesPoint[],
  totalDays: number
): SentimentSeriesPoint[] {
  if (!points.length) return [];
  const last = points[points.length - 1]!;
  const first = points[0]!;
  const endDate = last.date;
  const slope =
    points.length > 1 ? (last.score - first.score) / (points.length - 1) : 0;
  const out: SentimentSeriesPoint[] = [];
  for (let i = totalDays - 1; i >= 0; i--) {
    const date = addDays(endDate, -i);
    const hit = points.find((p) => p.date === date);
    if (hit) {
      out.push(hit);
      continue;
    }
    const offset = totalDays - 1 - i;
    const score = first.score + slope * offset * 0.55;
    out.push({ date, score: Math.round(score * 100) / 100 });
  }
  return out;
}

function weeklySample(points: SentimentSeriesPoint[]): SentimentSeriesPoint[] {
  if (points.length <= 7) return points;
  const out: SentimentSeriesPoint[] = [];
  for (let i = 0; i < points.length; i += 7) {
    const chunk = points.slice(i, i + 7);
    const avg = chunk.reduce((sum, p) => sum + p.score, 0) / chunk.length;
    out.push({
      date: chunk[chunk.length - 1]!.date,
      score: Math.round(avg * 100) / 100,
    });
  }
  return out;
}

export function resolveLeagueMoodSeriesByWindow(
  league: NonNullable<SentimentCuratedSnapshot["league"]>
): Record<SentimentWindowId, SentimentMoodSeries> {
  const curated = league.moodSeriesByWindow;
  if (
    curated?.["7d"]?.fan?.length &&
    curated?.["30d"]?.fan?.length &&
    curated?.["90d"]?.fan?.length
  ) {
    return {
      "7d": curated["7d"]!,
      "30d": curated["30d"]!,
      "90d": curated["90d"]!,
    };
  }

  const fan = league.moodSeries?.fan ?? [];
  const media = league.moodSeries?.media ?? [];
  const fan30 = expandSeriesBackward(fan, 30);
  const media30 = expandSeriesBackward(media, 30);
  const fan90 = expandSeriesBackward(fan, 90);
  const media90 = expandSeriesBackward(media, 90);

  return {
    "7d": {
      fan: fan.slice(-7),
      media: media.slice(-7),
    },
    "30d": { fan: fan30, media: media30 },
    "90d": {
      fan: weeklySample(fan90),
      media: weeklySample(media90),
    },
  };
}

export const getLeagueSentimentFeed = cache((): LeagueSentimentFeed | null => {
  const snapshot = loadSentimentSnapshot();
  if (!snapshot?.league) return null;
  return {
    season: snapshot.meta.season,
    disclaimer: snapshot.meta.disclaimer,
    status: snapshot.meta.status,
    league: snapshot.league,
    moodSeriesByWindow: resolveLeagueMoodSeriesByWindow(snapshot.league),
  };
});

export function listTrackedPlayerSentiment(): TrackedPlayerSentimentRow[] {
  const snapshot = loadSentimentSnapshot();
  if (!snapshot) return [];
  const rows: TrackedPlayerSentimentRow[] = [];
  for (const row of snapshot.players) {
    const playerId = row.playerIds[0];
    if (!playerId) continue;
    rows.push({
      playerId,
      displayName: row.displayName ?? playerId,
      teamKey: row.teamKey,
      window: row.window,
      fan: row.fan,
      media: row.media,
      hasProfile: true,
    });
  }
  return rows;
}
