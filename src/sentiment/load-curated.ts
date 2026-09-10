import "server-only";

import { cache } from "react";

import bundledSentiment from "@/data/runtime/sentiment-snapshot.json";
import type {
  LeagueSentimentFeed,
  PlayerSentimentProfile,
  SentimentCuratedSnapshot,
  SentimentMoodSeries,
  SentimentSeriesPoint,
  SentimentWindowId,
  TeamSentimentProfile,
  TrackedPlayerSentimentRow,
} from "@/sentiment/curated-types";

export type {
  LeagueSentimentFeed,
  SentimentWindowId,
  TrackedPlayerSentimentRow,
} from "@/sentiment/curated-types";
export { SENTIMENT_WINDOW_OPTIONS } from "@/sentiment/curated-types";

export const loadSentimentSnapshot = cache((): SentimentCuratedSnapshot | null => {
  // Cloudflare Workers: static import only — node:fs is empty on CF.
  const snapshot = bundledSentiment as unknown as SentimentCuratedSnapshot;
  if (!snapshot?.meta || !Array.isArray(snapshot.players)) return null;
  return snapshot;
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
    divergences: snapshot.meta.divergences?.rows ?? [],
    topicHeat: snapshot.meta.topicHeat ?? [],
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
      provenance: row.provenance,
    });
  }
  return rows;
}

/** Players in the curated snapshot linked to a franchise (ESPN team id). */
export function listTeamSentimentPlayers(
  teamId: string
): TrackedPlayerSentimentRow[] {
  const id = String(teamId ?? "").trim();
  if (!id) return [];
  return listTrackedPlayerSentiment().filter(
    (row) => row.teamKey != null && String(row.teamKey) === id
  );
}

export function getTeamSentimentProfile(
  teamId: string
): (TeamSentimentProfile & { disclaimer: string }) | null {
  const snapshot = loadSentimentSnapshot();
  if (!snapshot?.teams?.length) return null;
  const id = String(teamId ?? "").trim();
  if (!id) return null;
  const hit = snapshot.teams.find(
    (row) =>
      row.teamKey === id ||
      row.teamIds.some((candidate) => String(candidate) === id)
  );
  if (!hit) return null;
  return { ...hit, disclaimer: snapshot.meta.disclaimer };
}

export function listTeamSentimentProfiles(): TeamSentimentProfile[] {
  const snapshot = loadSentimentSnapshot();
  return snapshot?.teams ?? [];
}

export function getSentimentSnapshotHealth(): {
  available: boolean;
  season: string | null;
  status: string | null;
  playerCount: number;
  teamCount: number;
  observationBatchCount: number;
  movers: { risers: number; fallers: number };
  divergences: number;
  topics: number;
  byProvenance: Record<string, number>;
  teamSources: Record<string, number>;
} {
  const snapshot = loadSentimentSnapshot();
  if (!snapshot) {
    return {
      available: false,
      season: null,
      status: null,
      playerCount: 0,
      teamCount: 0,
      observationBatchCount: 0,
      movers: { risers: 0, fallers: 0 },
      divergences: 0,
      topics: 0,
      byProvenance: {},
      teamSources: {},
    };
  }
  const byProvenance: Record<string, number> = {};
  for (const row of snapshot.players) {
    const key = row.provenance ?? "unknown";
    byProvenance[key] = (byProvenance[key] ?? 0) + 1;
  }
  const teamSources: Record<string, number> = {};
  for (const row of snapshot.teams ?? []) {
    const key = row.source ?? "unknown";
    teamSources[key] = (teamSources[key] ?? 0) + 1;
  }
  return {
    available: true,
    season: snapshot.meta.season ?? null,
    status: snapshot.meta.status ?? null,
    playerCount: snapshot.players.length,
    teamCount: snapshot.teams?.length ?? snapshot.meta.teamProfileCount ?? 0,
    observationBatchCount: snapshot.meta.observationBatchCount ?? 0,
    movers: {
      risers: snapshot.meta.movers?.risers.length ?? 0,
      fallers: snapshot.meta.movers?.fallers.length ?? 0,
    },
    divergences: snapshot.meta.divergences?.rows.length ?? 0,
    topics: snapshot.meta.topicHeat?.length ?? 0,
    byProvenance,
    teamSources,
  };
}
