import type { Game } from "@/data/types";

/** 30 teams × 82 games / 2. */
export const REGULAR_SEASON_GAMES = 1230;
/** About one week of games. Before that the panel reviews last season. */
export const PULSE_MIN_GAMES = 60;
export const CLOSE_MARGIN = 5;
/** Partial weeks (opening days, All-Star break) are too noisy to plot. */
const MIN_WEEK_GAMES = 10;
const MOVER_MIN_GAMES = 5;
const MOVER_COUNT = 3;
const DAY_MS = 86_400_000;

export type PulseTotals = {
  games: number;
  /** Points per team per game. */
  ppg: number;
  /** Share of games decided by CLOSE_MARGIN or fewer points. */
  closeShare: number;
  homeWinShare: number;
};

export type PulseWeek = PulseTotals & { week: number };

export type PulseRecord = {
  teamId: string;
  abbr: string;
  name: string;
  wins: number;
  losses: number;
};

export type PulseMover = PulseRecord & {
  priorWins: number;
  priorLosses: number;
  /** Win percentage now minus last season. */
  change: number;
};

export type SeasonPulse = {
  season: string;
  priorSeason: string | null;
  complete: boolean;
  gamesPlayed: number;
  /** Week of the season the latest finished game falls in. */
  week: number;
  totals: PulseTotals;
  prior: PulseTotals | null;
  weeks: PulseWeek[];
  risers: PulseMover[];
  fallers: PulseMover[];
};

export function finishedRegularGames(games: Game[]): Game[] {
  return games.filter(
    (g) =>
      g.gameType === "regular" &&
      g.status === "final" &&
      Number.isFinite(g.homeScore) &&
      Number.isFinite(g.awayScore) &&
      g.homeScore + g.awayScore > 0
  );
}

export function pulseTotals(games: Game[]): PulseTotals | null {
  if (!games.length) return null;
  let points = 0;
  let close = 0;
  let homeWins = 0;
  for (const g of games) {
    points += g.homeScore + g.awayScore;
    if (Math.abs(g.homeScore - g.awayScore) <= CLOSE_MARGIN) close += 1;
    if (g.homeScore > g.awayScore) homeWins += 1;
  }
  return {
    games: games.length,
    ppg: points / (games.length * 2),
    closeShare: close / games.length,
    homeWinShare: homeWins / games.length,
  };
}

function dayOf(date: string): number {
  return Math.floor(Date.parse(`${date.slice(0, 10)}T00:00:00Z`) / DAY_MS);
}

/** Week 1 starts on the first finished game's date. */
export function weekOf(firstDate: string, date: string): number {
  return Math.floor((dayOf(date) - dayOf(firstDate)) / 7) + 1;
}

export function weeklyPulse(games: Game[]): PulseWeek[] {
  if (!games.length) return [];
  const first = games.reduce((min, g) => (g.gameDate < min ? g.gameDate : min), games[0]!.gameDate);
  const byWeek = new Map<number, Game[]>();
  for (const g of games) {
    const week = weekOf(first, g.gameDate);
    const list = byWeek.get(week);
    if (list) list.push(g);
    else byWeek.set(week, [g]);
  }
  return [...byWeek.entries()]
    .sort(([a], [b]) => a - b)
    .flatMap(([week, list]) => {
      if (list.length < MIN_WEEK_GAMES) return [];
      const totals = pulseTotals(list)!;
      return [{ week, ...totals }];
    });
}

function winPct(wins: number, losses: number): number | null {
  const games = wins + losses;
  return games > 0 ? wins / games : null;
}

export function teamMovers(
  now: PulseRecord[],
  prior: PulseRecord[]
): { risers: PulseMover[]; fallers: PulseMover[] } {
  const before = new Map(prior.map((r) => [r.teamId, r]));
  const movers: PulseMover[] = [];
  for (const r of now) {
    const was = before.get(r.teamId);
    if (!was || r.wins + r.losses < MOVER_MIN_GAMES) continue;
    const pct = winPct(r.wins, r.losses);
    const priorPct = winPct(was.wins, was.losses);
    if (pct == null || priorPct == null) continue;
    movers.push({ ...r, priorWins: was.wins, priorLosses: was.losses, change: pct - priorPct });
  }
  const byChange = [...movers].sort((a, b) => b.change - a.change);
  return {
    risers: byChange.filter((m) => m.change > 0).slice(0, MOVER_COUNT),
    fallers: byChange.filter((m) => m.change < 0).reverse().slice(0, MOVER_COUNT),
  };
}

export function buildSeasonPulse({
  season,
  games,
  priorSeason,
  priorGames,
  records,
  priorRecords,
}: {
  season: string;
  games: Game[];
  priorSeason: string | null;
  priorGames: Game[];
  records: PulseRecord[];
  priorRecords: PulseRecord[];
}): SeasonPulse | null {
  const finished = finishedRegularGames(games);
  const totals = pulseTotals(finished);
  if (!totals) return null;
  const first = finished.reduce((min, g) => (g.gameDate < min ? g.gameDate : min), finished[0]!.gameDate);
  const last = finished.reduce((max, g) => (g.gameDate > max ? g.gameDate : max), finished[0]!.gameDate);
  const { risers, fallers } = teamMovers(records, priorRecords);
  return {
    season,
    priorSeason: priorGames.length ? priorSeason : null,
    complete: finished.length >= REGULAR_SEASON_GAMES,
    gamesPlayed: Math.min(finished.length, REGULAR_SEASON_GAMES),
    week: weekOf(first, last),
    totals,
    prior: pulseTotals(finishedRegularGames(priorGames)),
    weeks: weeklyPulse(finished),
    risers,
    fallers,
  };
}

/** The season to show: this one once a week is in, else the one before. */
export function pickPulseSeason(
  current: string,
  previous: string | null,
  finishedCount: (season: string) => number
): string | null {
  if (finishedCount(current) >= PULSE_MIN_GAMES) return current;
  return previous && finishedCount(previous) > 0 ? previous : null;
}
