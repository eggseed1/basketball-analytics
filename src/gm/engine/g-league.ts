/** A single developmental assignment per user team, not a simulated NBA appearance. */
import type { GmLeagueState, GmPlayer } from "@/gm/types";
import { rotationForTeam } from "@/gm/engine/coaching";

export function gLeagueGames(player: GmPlayer, season: number): number {
  return player.gLeague?.season === season ? Math.min(60, player.gLeague.games) : 0;
}

export function gLeagueEligibility(league: GmLeagueState, player: GmPlayer): { ok: boolean; reason: string } {
  if (league.phase !== "regular") return { ok: false, reason: "G League assignments open during the regular season." };
  if (player.teamId !== league.userTeamId || !player.contract || league.draftPool.includes(player.id))
    return { ok: false, reason: "Choose a contracted player on your team." };
  if (player.age > 26) return { ok: false, reason: "The developmental slot is for players aged 26 or younger." };
  if (player.injury && player.injury.gamesRemaining > 0) return { ok: false, reason: "Injured players must recover first." };
  if (player.gLeague?.assigned && player.gLeague.season === league.season && player.gLeague.teamId === player.teamId)
    return { ok: true, reason: "Already in the G League." };
  const team = league.teams.find(t => t.id === league.userTeamId);
  if (!team) return { ok: false, reason: "Team not found." };
  if (Object.values(team.starters).includes(player.id)) return { ok: false, reason: "Remove this player from the starting lineup first." };
  const available = league.players.filter(p => p.teamId === league.userTeamId && p.id !== player.id &&
    (!p.injury || p.injury.gamesRemaining <= 0) && !(p.gLeague?.assigned && p.gLeague.teamId === p.teamId));
  if (available.length < 5) return { ok: false, reason: "Five healthy NBA players must remain." };
  const rotation = rotationForTeam(team, league.players);
  if ((rotation.minutes[player.id] ?? 0) > 0) return { ok: false, reason: "Set his NBA rotation minutes to zero before assigning him." };
  return { ok: true, reason: "Eligible to develop with the G League club." };
}

export function assignGLeague(league: GmLeagueState, playerId: string | null): { ok: boolean; state: GmLeagueState; reason: string } {
  const current = league.players.find(p => p.gLeague?.assigned && p.gLeague.season === league.season &&
    p.gLeague.teamId === league.userTeamId && p.teamId === league.userTeamId);
  if (playerId === null) {
    if (!current) return { ok: true, state: league, reason: "No G League player to recall." };
    return { ok: true, state: { ...league, players: league.players.map(p => p.id === current.id ? { ...p, gLeague: { ...p.gLeague!, assigned: false } } : p) }, reason: current.name + " recalled to the NBA roster." };
  }
  const prospect = league.players.find(p => p.id === playerId);
  if (!prospect) return { ok: false, state: league, reason: "Player not found." };
  if (current?.id === playerId) return { ok: true, state: league, reason: prospect.name + " is already assigned." };
  // Release the old slot before checking the replacement, but never commit a partial switch.
  const recalled = current ? { ...league, players: league.players.map(p => p.id === current.id ? { ...p, gLeague: { ...p.gLeague!, assigned: false } } : p) } : league;
  const target = recalled.players.find(p => p.id === playerId)!;
  const eligibility = gLeagueEligibility(recalled, target);
  if (!eligibility.ok) return { ok: false, state: league, reason: eligibility.reason };
  const old = target.gLeague?.season === league.season && target.gLeague.teamId === league.userTeamId ? target.gLeague : undefined;
  const players = recalled.players.map(p => p.id === playerId ? {
    ...p, gLeague: { season: league.season, teamId: league.userTeamId, assigned: true, games: old?.games ?? 0, minutes: old?.minutes ?? 0, lastDay: old?.lastDay },
  } : p);
  return { ok: true, state: { ...recalled, players }, reason: prospect.name + " assigned to the G League." };
}

/** One 32-minute developmental game roughly every three calendar days, maximum 60.
 * The separate ledger is idempotent on skipped days, reloads, and repeated actions.
 * No NBA playing-time, badge XP, mentoring, stats, or standings are fabricated. */
export function tickGLeagueDay(league: GmLeagueState, day = league.day): GmLeagueState {
  if (league.phase !== "regular" || day % 3 !== 0) return league;
  let changed = false;
  const players = league.players.map(player => {
    const g = player.gLeague;
    if (!g?.assigned || g.season !== league.season || g.teamId !== league.userTeamId ||
        player.teamId !== league.userTeamId || !player.contract ||
        (player.injury && player.injury.gamesRemaining > 0) || g.lastDay === day || g.games >= 60) return player;
    changed = true;
    return { ...player, gLeague: { ...g, games: g.games + 1, minutes: g.minutes + 32, lastDay: day } };
  });
  return changed ? { ...league, players } : league;
}
