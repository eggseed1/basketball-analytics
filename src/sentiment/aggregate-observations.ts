/**
 * Observation → aggregate rollup (S1 ingest scaffold).
 * Observations are raw rows before windowed fan/media lanes exist.
 * See data/sentiment/observations/v1/README.md
 */

import type { SentimentObservation } from "@/sentiment/types";
import type {
  CuratedSentimentLane,
  PlayerSentimentProfile,
  SentimentSeriesPoint,
  TeamSentimentProfile,
} from "@/sentiment/curated-types";
import { resolveTeamBrand } from "@/lib/nba-brand";

export type SentimentObservationBatch = {
  batchId: string;
  collectedAt: string;
  modelVersion: string;
  observations: SentimentObservation[];
};

function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function polarityFromScore(score: number): CuratedSentimentLane["polarity"] {
  if (score >= 0.2) return "positive";
  if (score <= -0.2) return "negative";
  if (Math.abs(score) < 0.08) return "neutral";
  return "mixed";
}

function directionFromSeries(
  points: SentimentSeriesPoint[]
): CuratedSentimentLane["direction"] {
  if (points.length < 2) return "stable";
  const delta = points[points.length - 1]!.score - points[0]!.score;
  if (delta >= 0.06) return "rising";
  if (delta <= -0.06) return "falling";
  return "stable";
}

function mergeSeriesPoints(
  points: SentimentSeriesPoint[]
): SentimentSeriesPoint[] {
  const byDate = new Map<string, number[]>();
  for (const point of points) {
    const list = byDate.get(point.date) ?? [];
    list.push(point.score);
    byDate.set(point.date, list);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, scores]) => ({
      date,
      score: Math.round(mean(scores) * 100) / 100,
    }));
}

function buildLane(rows: SentimentObservation[]): CuratedSentimentLane | null {
  if (!rows.length) return null;
  const score = mean(rows.map((r) => r.score));
  const mentionVolume = rows.reduce((sum, r) => sum + r.mentionVolume, 0);
  const platformBreakdown: CuratedSentimentLane["platformBreakdown"] = {};
  const topicBreakdown: Record<string, number> = {};
  for (const row of rows) {
    platformBreakdown[row.platform] =
      (platformBreakdown[row.platform] ?? 0) + row.mentionVolume;
    for (const tag of row.topicTags) {
      topicBreakdown[tag] = (topicBreakdown[tag] ?? 0) + 1;
    }
  }
  const platformTotal = Object.values(platformBreakdown).reduce(
    (a, b) => a + b,
    0
  );
  if (platformTotal > 0) {
    for (const key of Object.keys(platformBreakdown)) {
      platformBreakdown[key as keyof typeof platformBreakdown] =
        (platformBreakdown[key as keyof typeof platformBreakdown] ?? 0) /
        platformTotal;
    }
  }
  const topicTotal = Object.values(topicBreakdown).reduce((a, b) => a + b, 0);
  if (topicTotal > 0) {
    for (const key of Object.keys(topicBreakdown)) {
      topicBreakdown[key] = topicBreakdown[key]! / topicTotal;
    }
  }
  return {
    polarity: polarityFromScore(score),
    score: Math.round(score * 100) / 100,
    direction: "stable",
    mentionVolume,
    coverageConfidence: Math.min(
      0.95,
      0.35 + Math.log10(mentionVolume + 1) * 0.12
    ),
    platformBreakdown,
    topicBreakdown,
  };
}

function dailySeries(
  rows: SentimentObservation[]
): SentimentSeriesPoint[] {
  const byDay = new Map<string, number[]>();
  for (const row of rows) {
    const day = row.sampledAt.slice(0, 10);
    const list = byDay.get(day) ?? [];
    list.push(row.score);
    byDay.set(day, list);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, scores]) => ({
      date,
      score: Math.round(mean(scores) * 100) / 100,
    }));
}

/**
 * Roll up a pilot observation batch into player profiles.
 * v0: groups by entityId + sourceClass; daily buckets for series.
 */
export function aggregateObservationsToProfiles(
  batch: SentimentObservationBatch,
  window = "7d"
): PlayerSentimentProfile[] {
  return aggregateObservationBatches([batch], window);
}

/**
 * Merge multiple observation batches so multi-day series and volumes accumulate.
 */
export function aggregateObservationBatches(
  batches: SentimentObservationBatch[],
  window = "7d"
): PlayerSentimentProfile[] {
  const byPlayer = new Map<
    string,
    { fan: SentimentObservation[]; media: SentimentObservation[] }
  >();

  for (const batch of batches) {
    for (const obs of batch.observations) {
      if (obs.entityType !== "player") continue;
      const bucket = byPlayer.get(obs.entityId) ?? { fan: [], media: [] };
      if (obs.sourceClass === "fan") bucket.fan.push(obs);
      else bucket.media.push(obs);
      byPlayer.set(obs.entityId, bucket);
    }
  }

  const profiles: PlayerSentimentProfile[] = [];

  for (const [entityId, lanes] of byPlayer) {
    const fan = buildLane(lanes.fan);
    const media = buildLane(lanes.media);
    if (!fan || !media) continue;

    const fanSeries = dailySeries(lanes.fan);
    const mediaSeries = dailySeries(lanes.media);
    fan.direction = directionFromSeries(fanSeries);
    media.direction = directionFromSeries(mediaSeries);

    profiles.push({
      playerIds: [entityId],
      displayName: entityId,
      window,
      fan,
      media,
      series: {
        fan: fanSeries.length ? fanSeries : [{ date: batches[0]!.collectedAt.slice(0, 10), score: fan.score }],
        media: mediaSeries.length
          ? mediaSeries
          : [{ date: batches[0]!.collectedAt.slice(0, 10), score: media.score }],
      },
    });
  }

  return profiles;
}

/**
 * Roll up team-entity observation rows into franchise profiles.
 */
export function aggregateTeamObservationBatches(
  batches: SentimentObservationBatch[],
  window = "7d"
): TeamSentimentProfile[] {
  const byTeam = new Map<
    string,
    { fan: SentimentObservation[]; media: SentimentObservation[] }
  >();

  for (const batch of batches) {
    for (const obs of batch.observations) {
      if (obs.entityType !== "team") continue;
      const bucket = byTeam.get(obs.entityId) ?? { fan: [], media: [] };
      if (obs.sourceClass === "fan") bucket.fan.push(obs);
      else bucket.media.push(obs);
      byTeam.set(obs.entityId, bucket);
    }
  }

  const profiles: TeamSentimentProfile[] = [];

  for (const [entityId, lanes] of byTeam) {
    const fan = buildLane(lanes.fan);
    const media = buildLane(lanes.media);
    if (!fan || !media) continue;

    const fanSeries = dailySeries(lanes.fan);
    const mediaSeries = dailySeries(lanes.media);
    fan.direction = directionFromSeries(fanSeries);
    media.direction = directionFromSeries(mediaSeries);

    const brand = resolveTeamBrand(entityId);

    profiles.push({
      teamIds: [entityId],
      teamKey: entityId,
      displayName: brand?.abbr ?? entityId,
      window,
      source: "team_observation",
      fan,
      media,
      series: {
        fan: fanSeries.length
          ? fanSeries
          : [{ date: batches[0]!.collectedAt.slice(0, 10), score: fan.score }],
        media: mediaSeries.length
          ? mediaSeries
          : [{ date: batches[0]!.collectedAt.slice(0, 10), score: media.score }],
      },
    });
  }

  return profiles;
}

/** Stitch two series by date (later points average on collision). */
export function mergeProfileSeries(
  base?: PlayerSentimentProfile["series"],
  overlay?: PlayerSentimentProfile["series"]
): PlayerSentimentProfile["series"] | undefined {
  if (!base && !overlay) return undefined;
  if (!base) return overlay;
  if (!overlay) return base;
  return {
    fan: mergeSeriesPoints([...(base.fan ?? []), ...(overlay.fan ?? [])]),
    media: mergeSeriesPoints([...(base.media ?? []), ...(overlay.media ?? [])]),
  };
}
