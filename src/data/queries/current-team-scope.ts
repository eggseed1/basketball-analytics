import { resolveCanonicalTeam } from "@/data/identity/team-map";
import {
  bundledCurrentRosterMeta,
  bundledRosterPlayerIds,
  getBundledCurrentRosterEntry,
} from "@/data/runtime/current-roster-snapshot";
import { getPlayerSearchIndex } from "@/data/runtime/player-search-snapshot";
import type { PlayerSeason } from "@/data/types";

/** Canonical team id when the bundled current roster covers `requestSeason`. */
function currentRosterTeamId(team: string, requestSeason: string): string | null {
  if (bundledCurrentRosterMeta().season !== requestSeason) return null;
  const resolved = resolveCanonicalTeam(team);
  return resolved.status === "resolved" ? resolved.team.canonicalTeamId : null;
}

/**
 * Pre-tip boards borrow last season's rows, and those rows carry last season's
 * team. Keep only players on `team` today (bundled ESPN roster) and label them
 * with that team. Null when the bundled roster isn't for `requestSeason`.
 */
export function scopeRowsToCurrentTeam(
  rows: PlayerSeason[],
  team: string,
  requestSeason: string
): PlayerSeason[] | null {
  const teamId = currentRosterTeamId(team, requestSeason);
  if (!teamId) return null;
  return rows.flatMap((row) => {
    const now = getBundledCurrentRosterEntry(row.playerId);
    if (now?.teamId !== teamId) return [];
    return [
      {
        ...row,
        teamId,
        teamName: now.teamName || row.teamName,
        teamAbbreviation: now.teamAbbr,
        stintTeamIds: undefined,
      },
    ];
  });
}

/** Current roster players with no row in `presentIds` (rookies, overseas signings). */
export function currentRosterPlayersMissing(
  team: string,
  requestSeason: string,
  presentIds: Iterable<string>
): Array<{ playerId: string; name: string }> | null {
  const teamId = currentRosterTeamId(team, requestSeason);
  if (!teamId) return null;
  const present = new Set(presentIds);
  const missing = bundledRosterPlayerIds(teamId).filter((id) => !present.has(id));
  if (!missing.length) return [];
  const names = new Map(getPlayerSearchIndex().map((row) => [row.id, row.name]));
  return missing
    .flatMap((id) => {
      const name = getBundledCurrentRosterEntry(id)?.name ?? names.get(id);
      return name ? [{ playerId: id, name }] : [];
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
