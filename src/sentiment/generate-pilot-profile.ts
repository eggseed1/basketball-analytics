import { createHash } from "node:crypto";

import { resolvePlayerIdentity } from "@/data/identity/player-identity";
import { normalizePlayerName } from "@/data/providers/salaries/salary-store";
import type { PlayerSeason } from "@/data/types";
import type {
  CuratedSentimentLane,
  PlayerSentimentProfile,
  SentimentSeriesPoint,
} from "@/sentiment/curated-types";
import type { SentimentDirection, SentimentPolarity } from "@/sentiment/types";

export type PilotRosterSeed = {
  endDate: string;
  seriesDays: number;
  window: string;
  players: string[];
};

const FAN_TOPICS = [
  "mvp_case",
  "title_odds",
  "extension",
  "trade_rumors",
  "load_management",
  "defense",
  "fit_with_team",
  "playoff_exit",
  "overrated",
  "underrated",
  "injury_return",
  "role_debate",
] as const;

const MEDIA_TOPICS = [
  "title_contender",
  "availability",
  "extension",
  "franchise_face",
  "scoring",
  "defense",
  "championship_window",
  "contract",
] as const;

function rngFor(key: string) {
  const digest = createHash("sha256").update(key).digest();
  let state = digest.readUInt32LE(0);
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function polarityFromScore(score: number): SentimentPolarity {
  if (score >= 0.2) return "positive";
  if (score <= -0.2) return "negative";
  if (Math.abs(score) < 0.08) return "neutral";
  return "mixed";
}

function directionFromDelta(delta: number): SentimentDirection {
  if (delta >= 0.06) return "rising";
  if (delta <= -0.06) return "falling";
  return "stable";
}

function pickTopics(
  rand: () => number,
  pool: readonly string[],
  count: number
): Record<string, number> {
  const shuffled = [...pool].sort(() => rand() - 0.5);
  const picked = shuffled.slice(0, count);
  const raw = picked.map(() => 0.2 + rand() * 0.8);
  const total = raw.reduce((sum, value) => sum + value, 0);
  const out: Record<string, number> = {};
  picked.forEach((topic, index) => {
    out[topic] = round2(raw[index]! / total);
  });
  return out;
}

function buildLane(
  rand: () => number,
  score: number,
  direction: SentimentDirection,
  mentionVolume: number,
  topics: Record<string, number>,
  platformBreakdown: CuratedSentimentLane["platformBreakdown"]
): CuratedSentimentLane {
  return {
    polarity: polarityFromScore(score),
    score: round2(score),
    direction,
    mentionVolume: Math.round(mentionVolume),
    coverageConfidence: round2(0.45 + rand() * 0.4),
    platformBreakdown,
    topicBreakdown: topics,
  };
}

function buildSeries(
  rand: () => number,
  endDate: string,
  days: number,
  endScore: number,
  drift: number
): SentimentSeriesPoint[] {
  const points: SentimentSeriesPoint[] = [];
  const startScore = round2(endScore - drift);
  for (let i = 0; i < days; i++) {
    const date = addDays(endDate, i - (days - 1));
    const t = days <= 1 ? 1 : i / (days - 1);
    const noise = (rand() - 0.5) * 0.06;
    const score = round2(startScore + (endScore - startScore) * t + noise);
    points.push({ date, score });
  }
  points[points.length - 1]!.score = endScore;
  return points;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function profileKey(profile: PlayerSentimentProfile): string {
  if (profile.displayName) return normalizePlayerName(profile.displayName);
  return profile.playerIds[0] ?? "";
}

export function matchesHandCraftedProfile(
  displayName: string,
  handCrafted: PlayerSentimentProfile[]
): PlayerSentimentProfile | null {
  const key = normalizePlayerName(displayName);
  return (
    handCrafted.find((profile) => {
      if (profile.displayName && normalizePlayerName(profile.displayName) === key) {
        return true;
      }
      return false;
    }) ?? null
  );
}

export async function generatePilotProfile(
  rosterRow: PlayerSeason,
  seed: PilotRosterSeed
): Promise<PlayerSentimentProfile> {
  const rand = rngFor(`${rosterRow.playerId}:${rosterRow.playerName}`);
  const fanScore = round2((rand() - 0.48) * 0.9);
  const mediaScore = round2(fanScore * 0.55 + (rand() - 0.5) * 0.2);
  const fanDrift = round2((rand() - 0.5) * 0.22);
  const mediaDrift = round2(fanDrift * 0.6 + (rand() - 0.5) * 0.08);
  const fanDirection = directionFromDelta(fanDrift);
  const mediaDirection = directionFromDelta(mediaDrift);
  const fanVolume = 520 + rand() * 2800;
  const mediaVolume = 58 + rand() * 140;

  const fanSeries = buildSeries(
    rand,
    seed.endDate,
    seed.seriesDays,
    fanScore,
    fanDrift
  );
  const mediaSeries = buildSeries(
    rand,
    seed.endDate,
    seed.seriesDays,
    mediaScore,
    mediaDrift
  );

  const identity = await resolvePlayerIdentity(rosterRow.playerId).catch(
    () => null
  );
  const playerIds = new Set<string>([rosterRow.playerId]);
  if (identity?.nbaId) playerIds.add(identity.nbaId);
  if (identity?.espnId) playerIds.add(identity.espnId);
  if (identity?.routeId) playerIds.add(identity.routeId);

  return {
    playerIds: [...playerIds],
    displayName: rosterRow.playerName,
    teamKey: rosterRow.teamId,
    window: seed.window,
    fan: buildLane(
      rand,
      fanScore,
      fanDirection,
      fanVolume,
      pickTopics(rand, FAN_TOPICS, 3),
      { reddit: round2(0.68 + rand() * 0.2), other: round2(0.08 + rand() * 0.12) }
    ),
    media: buildLane(
      rand,
      mediaScore,
      mediaDirection,
      mediaVolume,
      pickTopics(rand, MEDIA_TOPICS, 3),
      {
        news: round2(0.82 + rand() * 0.12),
        youtube: round2(rand() * 0.12),
        other: round2(0.04 + rand() * 0.08),
      }
    ),
    series: {
      fan: fanSeries,
      media: mediaSeries,
    },
  };
}

export function resolveRosterRowByName(
  displayName: string,
  rosterIndex: {
    byName: Map<string, PlayerSeason>;
  }
): PlayerSeason | null {
  return rosterIndex.byName.get(normalizePlayerName(displayName)) ?? null;
}

export async function expandPilotProfilesFromRoster(input: {
  pilotRoster: PilotRosterSeed;
  handCrafted: PlayerSentimentProfile[];
  rosterIndex: {
    byName: Map<string, PlayerSeason>;
  };
}): Promise<{ profiles: PlayerSentimentProfile[]; generated: number; skipped: number }> {
  const profiles: PlayerSentimentProfile[] = [];
  let generated = 0;
  let skipped = 0;

  for (const displayName of input.pilotRoster.players) {
    const existing = matchesHandCraftedProfile(displayName, input.handCrafted);
    if (existing) {
      profiles.push(existing);
      skipped += 1;
      continue;
    }
    const rosterRow = resolveRosterRowByName(displayName, input.rosterIndex);
    if (!rosterRow) continue;
    profiles.push(
      await generatePilotProfile(rosterRow, input.pilotRoster)
    );
    generated += 1;
  }

  return { profiles, generated, skipped };
}
