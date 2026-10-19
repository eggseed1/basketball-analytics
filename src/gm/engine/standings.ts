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
  state: GmLeagueState,
  seeds?: { East: string[]; West: string[] }
): GmPlayoffSeries[] {
  const east =
    seeds?.East ??
    sortedStandings(state.standings, "East", state.teams)
      .slice(0, 8)
      .map((row) => row.teamId);
  const west =
    seeds?.West ??
    sortedStandings(state.standings, "West", state.teams)
      .slice(0, 8)
      .map((row) => row.teamId);
  const series: GmPlayoffSeries[] = [];
  const pair = (conf: "East" | "West", rows: string[]) => {
    const order = [0, 7, 3, 4, 2, 5, 1, 6];
    for (let i = 0; i < 4; i++) {
      const high = order[i * 2]!;
      const low = order[i * 2 + 1]!;
      const a = rows[high]!;
      const b = rows[low]!;
      series.push({
        id: uid("series"),
        round: 1,
        conf,
        teamAId: a,
        teamBId: b,
        seedA: high + 1,
        seedB: low + 1,
        winsA: 0,
        winsB: 0,
        done: false,
        games: [],
      });
    }
  };
  pair("East", east);
  pair("West", west);
  return series;
}

/**
 * Higher seed hosts games 1, 2, 5, and 7. The other side hosts 3, 4, and 6.
 * Team A is the higher seed when seedA is the smaller number.
 */
export function seriesHosts(series: GmPlayoffSeries): { homeTeamId: string; awayTeamId: string } {
  const played = series.games?.length ?? series.winsA + series.winsB;
  const aIsHigher = (series.seedA ?? 1) <= (series.seedB ?? 8);
  const higher = aIsHigher ? series.teamAId : series.teamBId;
  const lower = aIsHigher ? series.teamBId : series.teamAId;
  const higherHosts = played === 0 || played === 1 || played === 4 || played === 6;
  return higherHosts
    ? { homeTeamId: higher, awayTeamId: lower }
    : { homeTeamId: lower, awayTeamId: higher };
}

/** Better regular-season record. Wins, then point differential. */
export function betterRecord(state: GmLeagueState, a: string, b: string): string {
  const left = state.standings[a];
  const right = state.standings[b];
  const winsA = left?.wins ?? 0;
  const winsB = right?.wins ?? 0;
  if (winsA !== winsB) return winsA > winsB ? a : b;
  const diffA = (left?.pointsFor ?? 0) - (left?.pointsAgainst ?? 0);
  const diffB = (right?.pointsFor ?? 0) - (right?.pointsAgainst ?? 0);
  if (diffA !== diffB) return diffA > diffB ? a : b;
  return a;
}

/** Lottery + reverse playoff finish → full first-round draft order. */
export function computeLotteryOrder(
  state: GmLeagueState,
  playoffIds?: Set<string>
): string[] {
  const inPlayoffs =
    playoffIds ??
    new Set([
      ...sortedStandings(state.standings, "East", state.teams)
        .slice(0, 8)
        .map((x) => x.teamId),
      ...sortedStandings(state.standings, "West", state.teams)
        .slice(0, 8)
        .map((x) => x.teamId),
    ]);
  const byRecordAsc = sortedStandings(state.standings).reverse(); // worst first
  const lottery = byRecordAsc
    .filter((r) => !inPlayoffs.has(r.teamId))
    .map((r) => r.teamId);
  // Mild lottery shuffle among the bottom 4
  const shuffled = [...lottery];
  for (let i = Math.min(3, shuffled.length - 1); i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  const playoff = byRecordAsc
    .filter((r) => inPlayoffs.has(r.teamId))
    .map((r) => r.teamId);
  return [...shuffled, ...playoff];
}
