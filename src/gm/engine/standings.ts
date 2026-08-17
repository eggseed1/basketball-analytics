import type {
  GmLeagueState,
  GmPlayoffSeries,
  GmStandingsRow,
  GmTeam,
} from "@/gm/types";
import { uid } from "@/gm/engine/rng";

export function emptyStandings(teams: GmTeam[]): Record<string, GmStandingsRow> {
  return Object.fromEntries(
    teams.map((t) => [
      t.id,
      {
        teamId: t.id,
        wins: 0,
        losses: 0,
        confWins: 0,
        confLosses: 0,
        pointsFor: 0,
        pointsAgainst: 0,
      },
    ])
  );
}

export function applyGameToStandings(
  standings: Record<string, GmStandingsRow>,
  teams: GmTeam[],
  homeId: string,
  awayId: string,
  homeScore: number,
  awayScore: number
): Record<string, GmStandingsRow> {
  const next = { ...standings };
  const home = { ...next[homeId]! };
  const away = { ...next[awayId]! };
  const homeConf = teams.find((t) => t.id === homeId)!.conference;
  const awayConf = teams.find((t) => t.id === awayId)!.conference;
  const sameConf = homeConf === awayConf;

  home.pointsFor += homeScore;
  home.pointsAgainst += awayScore;
  away.pointsFor += awayScore;
  away.pointsAgainst += homeScore;

  if (homeScore > awayScore) {
    home.wins += 1;
    away.losses += 1;
    if (sameConf) {
      home.confWins += 1;
      away.confLosses += 1;
    }
  } else {
    away.wins += 1;
    home.losses += 1;
    if (sameConf) {
      away.confWins += 1;
      home.confLosses += 1;
    }
  }
  next[homeId] = home;
  next[awayId] = away;
  return next;
}

export function sortedStandings(
  standings: Record<string, GmStandingsRow>,
  conference?: "East" | "West",
  teams?: GmTeam[]
): GmStandingsRow[] {
  let rows = Object.values(standings);
  if (conference && teams) {
    const ids = new Set(
      teams.filter((t) => t.conference === conference).map((t) => t.id)
    );
    rows = rows.filter((r) => ids.has(r.teamId));
  }
  return rows.sort((a, b) => {
    const pa = a.wins / Math.max(1, a.wins + a.losses);
    const pb = b.wins / Math.max(1, b.wins + b.losses);
    if (pb !== pa) return pb - pa;
    return b.wins - a.wins;
  });
}

export function buildPlayoffBracket(
  state: GmLeagueState
): GmPlayoffSeries[] {
  const east = sortedStandings(state.standings, "East", state.teams).slice(0, 8);
  const west = sortedStandings(state.standings, "West", state.teams).slice(0, 8);
  const series: GmPlayoffSeries[] = [];
  const pair = (conf: "East" | "West", rows: GmStandingsRow[]) => {
    const seeds = [0, 7, 3, 4, 2, 5, 1, 6];
    for (let i = 0; i < 4; i++) {
      const a = rows[seeds[i * 2]!]!;
      const b = rows[seeds[i * 2 + 1]!]!;
      series.push({
        id: uid("series"),
        round: 1,
        conf,
        teamAId: a.teamId,
        teamBId: b.teamId,
        winsA: 0,
        winsB: 0,
        done: false,
      });
    }
  };
  pair("East", east);
  pair("West", west);
  return series;
}

/** Lottery + reverse playoff finish → full first-round draft order. */
export function computeLotteryOrder(state: GmLeagueState): string[] {
  const eastTop = new Set(
    sortedStandings(state.standings, "East", state.teams)
      .slice(0, 8)
      .map((x) => x.teamId)
  );
  const westTop = new Set(
    sortedStandings(state.standings, "West", state.teams)
      .slice(0, 8)
      .map((x) => x.teamId)
  );
  const byRecordAsc = sortedStandings(state.standings).reverse(); // worst first
  const lottery = byRecordAsc
    .filter((r) => !eastTop.has(r.teamId) && !westTop.has(r.teamId))
    .map((r) => r.teamId);
  // Mild lottery shuffle among the bottom 4
  const shuffled = [...lottery];
  for (let i = Math.min(3, shuffled.length - 1); i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  const playoff = byRecordAsc
    .filter((r) => eastTop.has(r.teamId) || westTop.has(r.teamId))
    .map((r) => r.teamId);
  return [...shuffled, ...playoff];
}
