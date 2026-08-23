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
} from "@/sentiment/curated-types";

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

function directionFromSeries(points: SentimentSeriesPoint[]): CuratedSentimentLane["direction"] {
  if (points.length < 2) return "stable";
  const delta = points[points.length - 1]!.score - points[0]!.score;
  if (delta >= 0.06) return "rising";
  if (delta <= -0.06) return "falling";
  return "stable";
}

/**
 * Roll up a pilot observation batch into player profiles.
 * v0: groups by entityId + sourceClass; daily buckets for series.
 */
export function aggregateObservationsToProfiles(
  batch: SentimentObservationBatch,
  window = "7d"
): PlayerSentimentProfile[] {
  const byPlayer = new Map<
    string,
    { fan: SentimentObservation[]; media: SentimentObservation[] }
  >();

  for (const obs of batch.observations) {
    if (obs.entityType !== "player") continue;
    const bucket = byPlayer.get(obs.entityId) ?? { fan: [], media: [] };
    if (obs.sourceClass === "fan") bucket.fan.push(obs);
    else bucket.media.push(obs);
    byPlayer.set(obs.entityId, bucket);
  }

  const day = batch.collectedAt.slice(0, 10);
  const profiles: PlayerSentimentProfile[] = [];

  for (const [entityId, lanes] of byPlayer) {
    const buildLane = (
      rows: SentimentObservation[]
    ): CuratedSentimentLane | null => {
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
        coverageConfidence: Math.min(0.95, 0.35 + Math.log10(mentionVolume + 1) * 0.12),
        platformBreakdown,
        topicBreakdown,
      };
    };

    const fan = buildLane(lanes.fan);
    const media = buildLane(lanes.media);
    if (!fan || !media) continue;

    const fanPoint: SentimentSeriesPoint = { date: day, score: fan.score };
    const mediaPoint: SentimentSeriesPoint = { date: day, score: media.score };
    fan.direction = directionFromSeries([fanPoint]);
    media.direction = directionFromSeries([mediaPoint]);

    const displayName =
      lanes.fan[0]?.entityId === entityId
        ? batch.observations.find((o) => o.entityId === entityId)?.entityId
        : entityId;

    profiles.push({
      playerIds: [entityId],
      displayName: displayName ?? entityId,
      window,
      fan,
      media,
      series: { fan: [fanPoint], media: [mediaPoint] },
    });
  }

  return profiles;
}
