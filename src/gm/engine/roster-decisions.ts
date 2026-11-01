import type { GmLeagueState } from "@/gm/types";
import { autoSetLineup, overallOf } from "@/gm/engine/lineup";
import { rosterCount } from "@/gm/engine/cap";

export function releasePlayer(league: GmLeagueState, playerId: string, teamId = league.userTeamId): GmLeagueState {
  const player = league.players.find(row => row.id === playerId && row.teamId === teamId);
  if (!player || player.pendingRookieContract) return league;
  const players = league.players.map(row => row.id === playerId ? { ...row, teamId: null, contract: null, rightsTeamId: null, rightsStartSeason: undefined, rightsKind: undefined, lastSalaryM: undefined } : row);
  const teams = league.teams.map(team => {
    if (team.id !== teamId) return team;
    const contract = player.contract;
    const deadMoney = contract && contract.yearsRemaining > 0 ? [...(team.deadMoney ?? []), { id: "waive-" + league.season + "-" + player.id, playerId, label: player.name, annualM: contract.annualSalaryM, yearsLeft: Math.max(1, contract.yearsRemaining), years: contract.years }] : team.deadMoney;
    return autoSetLineup({ ...team, deadMoney }, players);
  });
  return { ...league, players, teams, freeAgents: [...new Set([...league.freeAgents, player.id])] };
}

/** CPU clubs obey the opening-night maximum and retain waiver salary. */
export function cutCpuRosters(league: GmLeagueState): GmLeagueState {
  let next = league;
  for (const team of league.teams) {
    if (team.id === league.userTeamId) continue;
    let guard = 0;
    while (rosterCount(team.id, next.players) > league.settings.maxRoster && guard++ < 30) {
      const player = next.players.filter(row => row.teamId === team.id && row.contract && row.contract.annualSalaryM >= 1.2).sort((a, b) => overallOf(a) - overallOf(b) || (b.contract?.annualSalaryM ?? 0) - (a.contract?.annualSalaryM ?? 0))[0];
      if (!player) break;
      next = releasePlayer(next, player.id, team.id);
    }
  }
  return next;
}
