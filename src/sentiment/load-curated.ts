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

const DAY_MS = 86_400_000;

/** Real points within `days` of the series' own latest date. Nothing is extrapolated. */
function windowSlice(points: SentimentSeriesPoint[], days: number): SentimentSeriesPoint[] {
  if (!points.length) return [];
  const endMs = Date.parse(`${points[points.length - 1]!.date}T12:00:00Z`);
  const startMs = endMs - (days - 1) * DAY_MS;
  return points.filter((point) => Date.parse(`${point.date}T12:00:00Z`) >= startMs);
}

/** Measured daily tone only; a side with no data stays empty. */
export function resolveLeagueMoodSeriesByWindow(
  league: NonNullable<SentimentCuratedSnapshot["league"]>
): Record<SentimentWindowId, SentimentMoodSeries> {
  const fan = (league.fanMood ?? league.redditMood)?.series ?? [];
  const media = league.headlineMood?.series ?? [];
  const slice = (days: number) => ({ fan: windowSlice(fan, days), media: windowSlice(media, days) });
  return { "7d": slice(7), "30d": slice(30), "90d": slice(90) };
}

export function resolveLeagueMoodLanes(
  league: NonNullable<SentimentCuratedSnapshot["league"]>
): LeagueSentimentFeed["moodLanes"] {
  return {
    fan: league.fanMood?.lane ?? league.redditMood?.lane,
    media: league.headlineMood?.lane,
  };
}

export const getLeagueSentimentFeed = cache((): LeagueSentimentFeed | null => {
  const snapshot = loadSentimentSnapshot();
  if (!snapshot?.league) return null;
  return {
    season: snapshot.meta.season,
    disclaimer: snapshot.meta.disclaimer,
    status: snapshot.meta.status,
    snapshotDate: snapshot.meta.snapshotDate ?? null,
    sources: snapshot.meta.sources ?? null,
    league: snapshot.league,
    moodSeriesByWindow: resolveLeagueMoodSeriesByWindow(snapshot.league),
    moodLanes: resolveLeagueMoodLanes(snapshot.league),
    divergences: snapshot.meta.divergences?.rows ?? [],
    topicHeat: snapshot.meta.topicHeat ?? [],
    topicHeatOrigin: snapshot.meta.topicHeatOrigin ?? "headlines",
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
      series: row.series,
      words: row.words,
      headlineCount: row.media?.origin === "headlines" ? row.media.mentionVolume : undefined,
      performance: row.performance,
      hasProfile: true,
      provenance: row.provenance,
    });
  }
  return rows;
}

/** Players in the sentiment snapshot linked to a franchise (ESPN team id). */
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
