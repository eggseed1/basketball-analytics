import type { PlayerGame } from "@/data/types";
import { gameUsagePct } from "@/data/providers/nba/compute-advanced";

/** Attach team-relative usage / rates after all lines for a game are known. */
export function enrichBoxScoreAdvanced(players: PlayerGame[]): PlayerGame[] {
  const byTeam = new Map<string, PlayerGame[]>();
  for (const player of players) {
    const list = byTeam.get(player.teamId) ?? [];
    list.push(player);
    byTeam.set(player.teamId, list);
  }

  const teamTotals = new Map<
    string,
    {
      minutes: number;
      fgm: number;
      fga: number;
      fta: number;
      tov: number;
      assists: number;
      rebounds: number;
    }
  >();

  for (const [teamId, rows] of byTeam) {
    teamTotals.set(teamId, {
      minutes: rows.reduce((sum, row) => sum + row.minutes, 0),
      fgm: rows.reduce((sum, row) => sum + row.fieldGoalsMade, 0),
      fga: rows.reduce((sum, row) => sum + row.fieldGoalsAttempted, 0),
      fta: rows.reduce((sum, row) => sum + row.freeThrowsAttempted, 0),
      tov: rows.reduce((sum, row) => sum + row.turnovers, 0),
      assists: rows.reduce((sum, row) => sum + row.assists, 0),
      rebounds: rows.reduce((sum, row) => sum + row.rebounds, 0),
    });
  }

  return players.map((player) => {
    const team = teamTotals.get(player.teamId);
    if (!team) return player;

    const usage = gameUsagePct({
      minutes: player.minutes,
      fieldGoalsAttempted: player.fieldGoalsAttempted,
      freeThrowsAttempted: player.freeThrowsAttempted,
      turnovers: player.turnovers,
      teamMinutes: team.minutes,
      teamFieldGoalsAttempted: team.fga,
      teamFreeThrowsAttempted: team.fta,
      teamTurnovers: team.tov,
    });

    const teamFgWhileOn =
      team.minutes > 0
        ? (player.minutes / team.minutes) * team.fgm - player.fieldGoalsMade
        : 0;
    const assistPct = teamFgWhileOn > 0 ? player.assists / teamFgWhileOn : 0;

    const reboundPct =
      team.rebounds > 0 && player.minutes > 0
        ? player.rebounds / team.rebounds
        : 0;

    return {
      ...player,
      ...(usage != null ? { usagePct: usage } : {}),
      ...(Number.isFinite(assistPct) && assistPct > 0
        ? { assistPct }
        : {}),
      ...(reboundPct > 0 ? { reboundPct } : {}),
    };
  });
}
