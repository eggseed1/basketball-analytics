/**
 * Team totals ESPN reports that play-by-play can't rebuild reliably.
 * Null means ESPN didn't report the stat.
 */

export interface OfficialTeamStats {
  pointsInPaint: number | null;
  fastBreakPoints: number | null;
  /** Points this team scored off the other team's turnovers. */
  pointsOffTurnovers: number | null;
}

type RawBoxTeam = {
  team?: { id?: string | number };
  statistics?: Array<{ name?: string; displayValue?: string }>;
};

function stat(team: RawBoxTeam | undefined, name: string): number | null {
  const raw = team?.statistics?.find((s) => s.name === name)?.displayValue;
  if (raw == null || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Sides come from ESPN team ids, never position in the array. ESPN's
 * `turnoverPoints` is points conceded, so a team's points off turnovers is
 * the other team's value.
 */
export function parseOfficialTeamStats(
  boxTeams: RawBoxTeam[] | undefined,
  ids: { homeProviderTeamId?: string; awayProviderTeamId?: string }
): { home: OfficialTeamStats; away: OfficialTeamStats } | null {
  const homeId = ids.homeProviderTeamId?.trim();
  const awayId = ids.awayProviderTeamId?.trim();
  if (!homeId || !awayId || homeId === awayId) return null;
  const find = (id: string) => boxTeams?.find((t) => String(t.team?.id ?? "") === id);
  const home = find(homeId);
  const away = find(awayId);
  if (!home || !away) return null;
  const side = (own: RawBoxTeam, other: RawBoxTeam): OfficialTeamStats => ({
    pointsInPaint: stat(own, "pointsInPaint"),
    fastBreakPoints: stat(own, "fastBreakPoints"),
    pointsOffTurnovers: stat(other, "turnoverPoints"),
  });
  const result = { home: side(home, away), away: side(away, home) };
  const any = [result.home, result.away].some((s) => Object.values(s).some((v) => v != null));
  return any ? result : null;
}
