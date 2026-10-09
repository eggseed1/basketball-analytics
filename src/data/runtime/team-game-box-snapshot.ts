import snapshot from "./team-game-box-snapshot.json";

import {
  teamGameBoxFromRow,
  type TeamGameBox,
  type TeamGameBoxRow,
  type TeamGameBoxSnapshot,
} from "@/lib/team-game-box";

/**
 * Per-game team box totals built by scripts/build-team-game-box-snapshot.ts.
 * Kept on the module graph (not node:fs) so the Worker bundle carries it.
 */
const data = snapshot as unknown as TeamGameBoxSnapshot;

export function teamGameBoxSeasons(): string[] {
  return Object.keys(data.teams ?? {});
}

/** ET date → totals for one team-season. Empty when the season has no archive. */
export function teamGameBoxesByDate(espnTeamId: string, season: string): Map<string, TeamGameBox> {
  const rows: TeamGameBoxRow[] = data.teams?.[season]?.[espnTeamId] ?? [];
  return new Map(rows.map((row) => [row[0], teamGameBoxFromRow(row)] as const));
}
