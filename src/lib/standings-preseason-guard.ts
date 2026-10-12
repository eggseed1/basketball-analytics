import type { LeagueStandings } from "@/data/types/standings";

type ScheduledGame = {
  season: string;
  gameType?: string;
  gameDate: string;
  homeTeamId: string;
  awayTeamId: string;
};

/**
 * Regular-season games each team has on the schedule through `todayIso`.
 * Null when the season's regular-season schedule isn't known.
 */
export function regularGamesThrough(
  games: readonly ScheduledGame[],
  season: string,
  todayIso: string
): Map<string, number> | null {
  const counts = new Map<string, number>();
  let known = false;
  for (const g of games) {
    if (g.season !== season || g.gameType !== "regular") continue;
    known = true;
    if (g.gameDate > todayIso) continue;
    counts.set(g.homeTeamId, (counts.get(g.homeTeamId) ?? 0) + 1);
    counts.set(g.awayTeamId, (counts.get(g.awayTeamId) ?? 0) + 1);
  }
  return known ? counts : null;
}

/**
 * True when a team's record has more games than its regular-season schedule
 * allows so far. ESPN's CDN board counts preseason games before opening night.
 */
export function standingsCountUnscheduledGames(
  data: LeagueStandings,
  scheduled: ReadonlyMap<string, number>
): boolean {
  return data.conferences.some((c) =>
    c.rows.some((row) => row.wins + row.losses > (scheduled.get(row.teamId) ?? 0))
  );
}

/** The same table with every team at 0-0, as ESPN shows it before tip-off. */
export function withoutRecords(data: LeagueStandings): LeagueStandings {
  return {
    ...data,
    conferences: data.conferences.map((c) => ({
      ...c,
      rows: c.rows
        .map((row) => ({
          ...row,
          wins: 0,
          losses: 0,
          winPct: 0,
          gamesBehind: 0,
          differential: 0,
          ppg: 0,
          oppPpg: 0,
          streak: "-",
          homeRecord: "0-0",
          roadRecord: "0-0",
          lastTen: "-",
          playoffSeed: null,
        }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName))
        .map((row, i) => ({ ...row, rank: i + 1 })),
    })),
  };
}
