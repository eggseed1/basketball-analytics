import "server-only";

import { cache } from "react";

import { getRuntimeSnapshotGames } from "@/data/runtime/game-snapshot";
import {
  teamGameBoxesByDate,
  teamGameBoxSeasons,
} from "@/data/runtime/team-game-box-snapshot";
import { buildTeamVizRows, type TeamVizRow } from "@/lib/team-viz";

/** Bundled game + team box snapshots only, so it runs on Workers without upstream calls. */
export const getTeamVizRows = cache((season: string): TeamVizRow[] =>
  buildTeamVizRows(getRuntimeSnapshotGames(season), (id) => teamGameBoxesByDate(id, season))
);

export function teamVizBoxSeasons(): string[] {
  return teamGameBoxSeasons().sort((a, b) => b.localeCompare(a));
}
