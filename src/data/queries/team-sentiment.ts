import "server-only";

import { cache } from "react";

import {
  getSentimentSnapshotHealth,
  getTeamSentimentProfile,
  listTeamSentimentPlayers,
  loadSentimentSnapshot,
} from "@/sentiment/load-curated";
import type {
  TeamSentimentProfile,
  TrackedPlayerSentimentRow,
} from "@/sentiment/curated-types";

export type TeamSentimentBoard = {
  teamId: string;
  season: string;
  disclaimer: string;
  window: string;
  /** Direct team discourse or roster rollup when available. */
  teamProfile: TeamSentimentProfile | null;
  players: TrackedPlayerSentimentRow[];
  /** Mean fan score across tracked roster players with coverage. */
  fanAverage: number | null;
  mediaAverage: number | null;
  mentionVolume: number;
};

function meanScore(rows: TrackedPlayerSentimentRow[], lane: "fan" | "media") {
  const scores = rows
    .map((row) => row[lane]?.score)
    .filter((v): v is number => v != null && Number.isFinite(v));
  if (!scores.length) return null;
  return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100;
}

export const getTeamSentimentBoard = cache(
  (teamId: string): TeamSentimentBoard | null => {
    const snapshot = loadSentimentSnapshot();
    if (!snapshot) return null;
    const players = listTeamSentimentPlayers(teamId);
    if (!players.length) return null;
    const teamProfile = getTeamSentimentProfile(teamId);
    return {
      teamId,
      season: snapshot.meta.season,
      disclaimer: snapshot.meta.disclaimer,
      window: teamProfile?.window ?? snapshot.league?.window ?? "7d",
      teamProfile,
      players: [...players].sort((a, b) => {
        const aFan = a.fan?.score ?? -2;
        const bFan = b.fan?.score ?? -2;
        return bFan - aFan;
      }),
      fanAverage: meanScore(players, "fan"),
      mediaAverage: meanScore(players, "media"),
      mentionVolume: players.reduce(
        (sum, row) => sum + (row.fan?.mentionVolume ?? 0),
        0
      ),
    };
  }
);

export function getSentimentBuildHealth() {
  return getSentimentSnapshotHealth();
}
