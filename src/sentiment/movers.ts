import type {
  PlayerSentimentProfile,
  SentimentMoverRow,
} from "@/sentiment/curated-types";

export function fanSentimentDelta(
  profile: PlayerSentimentProfile,
  lookbackDays: number
): number | null {
  const series = profile.series?.fan;
  if (!series || series.length < 2) return null;
  const window = series.slice(-lookbackDays);
  if (window.length < 2) return null;
  const first = window[0]!.score;
  const last = window[window.length - 1]!.score;
  return Math.round((last - first) * 100) / 100;
}

export function toSentimentMoverRow(
  profile: PlayerSentimentProfile,
  delta: number
): SentimentMoverRow | null {
  const playerId = profile.playerIds[0];
  if (!playerId) return null;
  return {
    playerId,
    displayName: profile.displayName ?? playerId,
    teamKey: profile.teamKey,
    fanScore: profile.fan.score,
    delta,
    mentionVolume: profile.fan.mentionVolume,
  };
}

export function computeSentimentMovers(
  profiles: PlayerSentimentProfile[],
  options?: { limit?: number; lookbackDays?: number }
): { risers: SentimentMoverRow[]; fallers: SentimentMoverRow[] } {
  const limit = options?.limit ?? 4;
  const lookbackDays = options?.lookbackDays ?? 7;
  const scored: SentimentMoverRow[] = [];

  for (const profile of profiles) {
    const delta = fanSentimentDelta(profile, lookbackDays);
    if (delta == null || delta === 0) continue;
    const row = toSentimentMoverRow(profile, delta);
    if (row) scored.push(row);
  }

  return {
    risers: [...scored]
      .filter((row) => row.delta > 0)
      .sort((a, b) => b.delta - a.delta)
      .slice(0, limit),
    fallers: [...scored]
      .filter((row) => row.delta < 0)
      .sort((a, b) => a.delta - b.delta)
      .slice(0, limit),
  };
}
