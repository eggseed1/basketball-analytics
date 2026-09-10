import type {
  CuratedSentimentLane,
  PlayerSentimentProfile,
  SentimentSeriesPoint,
  TeamSentimentProfile,
} from "@/sentiment/curated-types";
import { resolveTeamBrand } from "@/lib/nba-brand";

function meanWeighted(
  rows: { score: number; weight: number }[]
): number {
  if (!rows.length) return 0;
  const total = rows.reduce((sum, row) => sum + row.weight, 0);
  if (total <= 0) return 0;
  return rows.reduce((sum, row) => sum + row.score * row.weight, 0) / total;
}

function mergeWeightedBreakdown(
  profiles: PlayerSentimentProfile[],
  lane: "fan" | "media",
  field: "topicBreakdown" | "platformBreakdown"
): Record<string, number> {
  const acc = new Map<string, number>();
  let total = 0;
  for (const profile of profiles) {
    const source = profile[lane][field] ?? {};
    const vol = Math.max(1, profile[lane].mentionVolume);
    for (const [key, share] of Object.entries(source)) {
      if (!key || !Number.isFinite(share) || share <= 0) continue;
      const weight = share * vol;
      acc.set(key, (acc.get(key) ?? 0) + weight);
      total += weight;
    }
  }
  if (total <= 0) return {};
  const out: Record<string, number> = {};
  for (const [key, weight] of acc) {
    out[key] = Math.round((weight / total) * 1000) / 1000;
  }
  return out;
}

function rosterSeries(
  profiles: PlayerSentimentProfile[],
  lane: "fan" | "media"
): SentimentSeriesPoint[] {
  const byDate = new Map<string, number[]>();
  for (const profile of profiles) {
    for (const point of profile.series?.[lane] ?? []) {
      const list = byDate.get(point.date) ?? [];
      list.push(point.score);
      byDate.set(point.date, list);
    }
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, scores]) => ({
      date,
      score:
        Math.round(
          (scores.reduce((a, b) => a + b, 0) / scores.length) * 100
        ) / 100,
    }));
}

function buildRosterLane(
  profiles: PlayerSentimentProfile[],
  lane: "fan" | "media"
): CuratedSentimentLane {
  const weighted = profiles.map((profile) => ({
    score: profile[lane].score,
    weight: Math.max(1, profile[lane].mentionVolume),
  }));
  const score = Math.round(meanWeighted(weighted) * 100) / 100;
  const mentionVolume = profiles.reduce(
    (sum, profile) => sum + profile[lane].mentionVolume,
    0
  );
  const coverageConfidence =
    Math.round(
      (profiles.reduce((sum, profile) => sum + profile[lane].coverageConfidence, 0) /
        profiles.length) *
        100
    ) / 100;

  let polarity: CuratedSentimentLane["polarity"] = "neutral";
  if (score >= 0.2) polarity = "positive";
  else if (score <= -0.2) polarity = "negative";
  else if (Math.abs(score) >= 0.08) polarity = "mixed";

  return {
    polarity,
    score,
    direction: "stable",
    mentionVolume,
    coverageConfidence,
    platformBreakdown: mergeWeightedBreakdown(profiles, lane, "platformBreakdown"),
    topicBreakdown: mergeWeightedBreakdown(profiles, lane, "topicBreakdown"),
  };
}

/**
 * Roll player profiles up to franchise lanes when a team has multiple tracked players.
 */
export function computeRosterTeamProfiles(
  profiles: PlayerSentimentProfile[],
  window = "7d",
  minPlayers = 2
): TeamSentimentProfile[] {
  const byTeam = new Map<string, PlayerSentimentProfile[]>();
  for (const profile of profiles) {
    const teamKey = profile.teamKey?.trim();
    if (!teamKey) continue;
    const bucket = byTeam.get(teamKey) ?? [];
    bucket.push(profile);
    byTeam.set(teamKey, bucket);
  }

  const out: TeamSentimentProfile[] = [];
  for (const [teamKey, teamPlayers] of byTeam) {
    if (teamPlayers.length < minPlayers) continue;
    const fan = buildRosterLane(teamPlayers, "fan");
    const media = buildRosterLane(teamPlayers, "media");
    const brand = resolveTeamBrand(teamKey);
    out.push({
      teamIds: [teamKey],
      teamKey,
      displayName: brand?.abbr ?? teamKey,
      window,
      source: "roster_rollup",
      provenance: "generated",
      fan,
      media,
      series: {
        fan: rosterSeries(teamPlayers, "fan"),
        media: rosterSeries(teamPlayers, "media"),
      },
    });
  }

  return out.sort((a, b) =>
    (a.displayName ?? "").localeCompare(b.displayName ?? "")
  );
}

export function mergeTeamProfiles(
  rosterRollups: TeamSentimentProfile[],
  observationProfiles: TeamSentimentProfile[]
): TeamSentimentProfile[] {
  const byKey = new Map<string, TeamSentimentProfile>();
  for (const profile of rosterRollups) {
    const key = profile.teamKey ?? profile.teamIds[0];
    if (key) byKey.set(key, profile);
  }
  for (const profile of observationProfiles) {
    const key = profile.teamKey ?? profile.teamIds[0];
    if (!key) continue;
    byKey.set(key, {
      ...profile,
      provenance: "observation",
    });
  }
  return [...byKey.values()].sort((a, b) =>
    (a.displayName ?? "").localeCompare(b.displayName ?? "")
  );
}
