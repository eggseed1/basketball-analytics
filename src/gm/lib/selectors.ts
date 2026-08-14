import type { GmLeagueState, GmPlayer, GmTeam } from "@/gm/types";
import { capStatus } from "@/gm/engine/cap";
import { sortedStandings } from "@/gm/engine/standings";

export function userTeam(league: GmLeagueState): GmTeam {
  return league.teams.find((t) => t.id === league.userTeamId)!;
}

export function userPlayers(league: GmLeagueState): GmPlayer[] {
  return league.players
    .filter((p) => p.teamId === league.userTeamId)
    .sort((a, b) => b.ratings.impact - a.ratings.impact);
}

export function teamById(league: GmLeagueState, id: string) {
  return league.teams.find((t) => t.id === id);
}

export function playerById(league: GmLeagueState, id: string) {
  return league.players.find((p) => p.id === id);
}

export function userCap(league: GmLeagueState) {
  return capStatus(userTeam(league), league.players, league.settings);
}

export function userRecord(league: GmLeagueState) {
  return league.standings[league.userTeamId];
}

export function nextUserGame(league: GmLeagueState) {
  return league.schedule.find(
    (g) =>
      !g.played &&
      (g.homeTeamId === league.userTeamId ||
        g.awayTeamId === league.userTeamId)
  );
}

export function upcomingUserGames(league: GmLeagueState, limit = 10) {
  return league.schedule
    .filter(
      (g) =>
        !g.played &&
        (g.homeTeamId === league.userTeamId ||
          g.awayTeamId === league.userTeamId)
    )
    .sort((a, b) => a.day - b.day || a.id.localeCompare(b.id))
    .slice(0, limit);
}

export function recentUserGames(league: GmLeagueState, limit = 5) {
  return league.schedule
    .filter(
      (g) =>
        g.played &&
        (g.homeTeamId === league.userTeamId ||
          g.awayTeamId === league.userTeamId)
    )
    .sort((a, b) => b.day - a.day || b.id.localeCompare(a.id))
    .slice(0, limit);
}

export function userGamesRemaining(league: GmLeagueState): number {
  return league.schedule.filter(
    (g) =>
      !g.played &&
      (g.homeTeamId === league.userTeamId ||
        g.awayTeamId === league.userTeamId)
  ).length;
}

export function userGamesPlayed(league: GmLeagueState): number {
  return league.schedule.filter(
    (g) =>
      g.played &&
      (g.homeTeamId === league.userTeamId ||
        g.awayTeamId === league.userTeamId)
  ).length;
}

/** True when all five starter slots are filled. */
export function isLineupReady(league: GmLeagueState): boolean {
  const team = userTeam(league);
  return (["PG", "SG", "SF", "PF", "C"] as const).every(
    (pos) => Boolean(team.starters[pos])
  );
}

export function displayImpact(p: GmPlayer): string {
  const v = p.scouted.impact ?? p.ratings.impact;
  if (p.scouted.impact == null) return "?";
  return (v >= 0 ? "+" : "") + v.toFixed(1);
}

/** Public name: codename while identity is sealed, true name after reveal. */
export function displayPlayerName(p: GmPlayer): string {
  if (p.identityRevealed === false && p.codename) return p.codename;
  return p.name;
}

export function displayPlayerSubtitle(p: GmPlayer): string | null {
  if (p.identityRevealed === false) return "Identity sealed · scouting only";
  if (p.codename && p.draftPick) return `Drafted as ${p.codename}`;
  return null;
}

export function standingsTable(
  league: GmLeagueState,
  conf?: "East" | "West"
) {
  return sortedStandings(league.standings, conf, league.teams);
}
