import "server-only";

import { cache } from "react";

import { getRuntimeSnapshotGames } from "@/data/runtime/game-snapshot";
import {
  ensureTeamGameBox,
  teamGameBoxesByDate,
  teamGameBoxSeasons,
} from "@/data/runtime/team-game-box-snapshot";
import { buildTeamVizRows, type TeamVizRow } from "@/lib/team-viz";

/** Bundled game + team box snapshots only, so it runs on Workers without upstream calls. */
export const getTeamVizRows = cache(async (season: string): Promise<TeamVizRow[]> => {
  const { ensureGameSnapshotLite } = await import("@/data/runtime/game-snapshot");
  await Promise.all([ensureGameSnapshotLite(), ensureTeamGameBox()]);
  return buildTeamVizRows(getRuntimeSnapshotGames(season), (id) =>
    teamGameBoxesByDate(id, season)
  );
});

export async function teamVizBoxSeasons(): Promise<string[]> {
  await ensureTeamGameBox();
  return teamGameBoxSeasons().sort((a, b) => b.localeCompare(a));
}
