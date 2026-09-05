import type {
  PlayerSentimentProfile,
  SentimentDivergenceRow,
  SentimentTopicHeatRow,
} from "@/sentiment/curated-types";

/**
 * Fan vs media perception gaps — never blended into one score.
 * Positive gap = fans warmer than media; negative = fans colder.
 */
export function computeSentimentDivergences(
  profiles: PlayerSentimentProfile[],
  options?: { limit?: number; minAbsGap?: number }
): SentimentDivergenceRow[] {
  const limit = options?.limit ?? 8;
  const minAbsGap = options?.minAbsGap ?? 0.12;
  const rows: SentimentDivergenceRow[] = [];

  for (const profile of profiles) {
    const playerId = profile.playerIds[0];
    if (!playerId) continue;
    const gap =
      Math.round((profile.fan.score - profile.media.score) * 100) / 100;
    const absGap = Math.abs(gap);
    if (absGap < minAbsGap) continue;
    rows.push({
      playerId,
      displayName: profile.displayName ?? playerId,
      teamKey: profile.teamKey,
      fanScore: profile.fan.score,
      mediaScore: profile.media.score,
      gap,
      absGap,
    });
  }

  return rows.sort((a, b) => b.absGap - a.absGap).slice(0, limit);
}

/**
 * Topic heat from fan + media topicBreakdown, weighted by mention volume.
 */
export function computeSentimentTopicHeat(
  profiles: PlayerSentimentProfile[],
  options?: { limit?: number }
): SentimentTopicHeatRow[] {
  const limit = options?.limit ?? 12;
  const acc = new Map<
    string,
    { weight: number; players: Set<string>; mentionVolume: number }
  >();

  for (const profile of profiles) {
    const playerId = profile.playerIds[0] ?? profile.displayName ?? "?";
    for (const lane of [profile.fan, profile.media]) {
      const topics = lane.topicBreakdown ?? {};
      const vol = Math.max(1, lane.mentionVolume);
      for (const [topic, share] of Object.entries(topics)) {
        if (!topic || !Number.isFinite(share) || share <= 0) continue;
        const hit = acc.get(topic) ?? {
          weight: 0,
          players: new Set<string>(),
          mentionVolume: 0,
        };
        hit.weight += share * vol;
        hit.mentionVolume += share * vol;
        hit.players.add(playerId);
        acc.set(topic, hit);
      }
    }
  }

  const total = [...acc.values()].reduce((sum, row) => sum + row.weight, 0);
  if (total <= 0) return [];

  return [...acc.entries()]
    .map(([topic, row]) => ({
      topic,
      weight: Math.round((row.weight / total) * 1000) / 1000,
      playerCount: row.players.size,
      mentionVolume: Math.round(row.mentionVolume),
    }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit);
}
