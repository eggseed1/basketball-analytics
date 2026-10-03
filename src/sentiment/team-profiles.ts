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
    const laneData = profile[lane];
    if (!laneData) continue;
    const source = laneData[field] ?? {};
    const vol = Math.max(1, laneData.mentionVolume);
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
  allProfiles: PlayerSentimentProfile[],
  lane: "fan" | "media",
  minPlayers: number
): CuratedSentimentLane | undefined {
  // Roll up curated lanes only, so illustrative and measured numbers never average together.
  const profiles = allProfiles.filter((profile) => profile[lane]?.origin === "curated");
  if (profiles.length < minPlayers) return undefined;
  const lanes = profiles.map((profile) => profile[lane]!);
  const weighted = lanes.map((l) => ({
    score: l.score,
    weight: Math.max(1, l.mentionVolume),
  }));
  const score = Math.round(meanWeighted(weighted) * 100) / 100;
  const mentionVolume = lanes.reduce((sum, l) => sum + l.mentionVolume, 0);
  const coverageConfidence =
    Math.round(
      (lanes.reduce((sum, l) => sum + l.coverageConfidence, 0) / lanes.length) * 100
    ) / 100;
  const asOf = lanes.map((l) => l.asOf).filter(Boolean).sort().pop();

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
    origin: "curated",
    asOf,
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
    const fan = buildRosterLane(teamPlayers, "fan", minPlayers);
    const media = buildRosterLane(teamPlayers, "media", minPlayers);
    if (!fan && !media) continue;
    const curatedPlayers = (lane: "fan" | "media") =>
      teamPlayers.filter((profile) => profile[lane]?.origin === "curated");
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
        fan: fan ? rosterSeries(curatedPlayers("fan"), "fan") : [],
        media: media ? rosterSeries(curatedPlayers("media"), "media") : [],
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
