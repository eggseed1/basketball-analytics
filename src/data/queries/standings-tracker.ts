import "server-only";

import { cache } from "react";

import { getRuntimeSnapshotGames } from "@/data/runtime/game-snapshot";
import { getRuntimeStandings } from "@/data/runtime/standings-snapshot";
import { computeStandingsFromGameArchive } from "@/lib/standings-from-games";
import {
  buildStandingsTrackerTeams,
  type StandingsTrackerTeam,
} from "@/lib/standings-tracker";

import snapshotMeta from "@/data/runtime/game-snapshot.json";

export type StandingsTrackerPayload = {
  season: string;
  requestedSeason: string;
  teams: StandingsTrackerTeam[];
  gameCount: number;
  warning?: string;
};

/**
 * Cloudflare-safe season list — static import only (no node:fs / live ESPN).
 */
export function getStandingsTrackerSeasonOptions(): string[] {
  const seasons = (snapshotMeta as { seasons?: string[] }).seasons;
  if (Array.isArray(seasons) && seasons.length) {
    return [...seasons].sort((a, b) => b.localeCompare(a));
  }
  return ["2024-25", "2025-26"];
}

/**
 * Build tracker curves from bundled game + standings snapshots only.
 * Never calls live ESPN or disk archives — required for Cloudflare Workers.
 */
export const getStandingsTrackerPayload = cache(
  async (season: string): Promise<StandingsTrackerPayload> => {
    const games = getRuntimeSnapshotGames(season);
    const standings =
      getRuntimeStandings(season) ??
      computeStandingsFromGameArchive(season, games);

    const teams = buildStandingsTrackerTeams(games, standings, {
      gameTypes: ["regular"],
    });

    const played = games.filter(
      (game) => game.status === "final" && game.gameType === "regular"
    ).length;

    return {
      season: standings?.season ?? season,
      requestedSeason: season,
      teams,
      gameCount: played,
      warning:
        teams.every((team) => team.points.length === 0) && played === 0
          ? `No completed regular-season games for ${season} yet.`
          : undefined,
    };
  }
);
