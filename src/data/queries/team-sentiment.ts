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
  /** Direct team discourse, headline lane, or roster rollup when available. */
  teamProfile: TeamSentimentProfile | null;
  players: TrackedPlayerSentimentRow[];
  snapshotDate: string | null;
};

export const getTeamSentimentBoard = cache(
  async (teamId: string): Promise<TeamSentimentBoard | null> => {
    const snapshot = await loadSentimentSnapshot();
    if (!snapshot) return null;
    const players = await listTeamSentimentPlayers(teamId);
    const teamProfile = await getTeamSentimentProfile(teamId);
    if (!players.length && !teamProfile) return null;
    return {
      teamId,
      season: snapshot.meta.season,
      disclaimer: snapshot.meta.disclaimer,
      window: teamProfile?.window ?? snapshot.league?.window ?? "7d",
      teamProfile,
      players: [...players].sort((a, b) => {
        const aMedia = a.media?.score ?? -2;
        const bMedia = b.media?.score ?? -2;
        return bMedia - aMedia;
      }),
      snapshotDate: snapshot.meta.snapshotDate ?? null,
    };
  }
);

export async function getSentimentBuildHealth() {
  return getSentimentSnapshotHealth();
}
