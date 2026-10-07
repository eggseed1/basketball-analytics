import type { Game } from "@/data/types";
import { countsTowardStandings } from "@/lib/standings-game-filter";
import {
  conferenceForTeamId,
  isNbaFranchiseTeamId,
} from "@/lib/standings-from-games";

/** 30 teams × 82 games / 2. */
export const REGULAR_SEASON_GAMES = 1230;
/** A few nights of games. Before that the panel reviews last season. */
export const PULSE_MIN_GAMES = 30;
export const CLOSE_MARGIN = 5;
/** The chart needs a few games per team before lines say anything. */
export const CHART_MIN_GAMES = 5;

const FORM_GAMES = 10;
const MAX_HIGHLIGHTS = 4;
const MAX_STORIES = 3;
const STREAK_MIN = 3;
const CLOSE_MIN_GAMES = 4;
const SPLIT_MIN_GAMES = 5;
const SCHEDULE_MIN_LEFT = 5;

export type PulsePhase = "early" | "middle" | "stretch" | "complete";

export type TeamResult = {
  date: string;
  oppId: string;
  home: boolean;
  won: boolean;
  /** Team score minus opponent score. */
  margin: number;
};

export type WinLoss = { wins: number; losses: number };

export type TeamSeason = WinLoss & {
  teamId: string;
  abbr: string;
  name: string;
  conference: "East" | "West" | null;
  results: TeamResult[];
  /** Games above .500 after each game; index 0 is before the opener. */
  path: number[];
  pointDiff: number;
  /** Opponent ids of scheduled games still to play. */
  remaining: string[];
};

export type PulseTotals = {
  games: number;
  /** Points per team per game. */
  ppg: number;
  /** Share of games decided by CLOSE_MARGIN or fewer points. */
  closeShare: number;
  homeWinShare: number;
};

export type HighlightRole = "best" | "worst" | "hot" | "cold" | "riser" | "faller";

export type Highlight = {
  role: HighlightRole;
  team: TeamSeason;
  form: WinLoss;
  prior: WinLoss | null;
};

export type StreakRow = { team: TeamSeason; length: number };
export type MoverRow = { team: TeamSeason; prior: WinLoss; change: number };
export type SplitRow = { team: TeamSeason; record: WinLoss };
export type HomeRoadRow = { team: TeamSeason; home: WinLoss; road: WinLoss; gap: number };
export type ScheduleRow = { team: TeamSeason; left: number; opponentPct: number };

export type Story =
  | { kind: "unbeaten"; perfect: TeamSeason[]; winless: TeamSeason[] }
  | { kind: "streaks"; mode: "active" | "longest"; wins: StreakRow[]; losses: StreakRow[] }
  | { kind: "vs-last"; risers: MoverRow[]; fallers: MoverRow[] }
  | { kind: "close"; best: SplitRow[]; worst: SplitRow[] }
  | { kind: "home-road"; rows: HomeRoadRow[] }
  | { kind: "schedule"; toughest: ScheduleRow[]; easiest: ScheduleRow[] };

export type SeasonPulse = {
  season: string;
  priorSeason: string | null;
  phase: PulsePhase;
  gamesPlayed: number;
  /** Most games any team has played. */
  maxTeamGames: number;
  teams: TeamSeason[];
  highlights: Highlight[];
  stories: Story[];
  totals: PulseTotals;
};

function hasScore(g: Game): boolean {
  return (
    Number.isFinite(g.homeScore) &&
    Number.isFinite(g.awayScore) &&
    g.homeScore + g.awayScore > 0
  );
}

/** Regular-season games between two NBA teams that count in the standings. */
function countingGames(games: Game[]): Game[] {
  return games.filter(
    (g) =>
      countsTowardStandings(g) &&
      isNbaFranchiseTeamId(g.homeTeamId) &&
      isNbaFranchiseTeamId(g.awayTeamId)
  );
}

export function finishedRegularGames(games: Game[]): Game[] {
  return countingGames(games).filter((g) => g.status === "final" && hasScore(g));
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

export function winPct({ wins, losses }: WinLoss): number | null {
  const games = wins + losses;
  return games > 0 ? wins / games : null;
}

function tally(results: TeamResult[]): WinLoss {
  let wins = 0;
  for (const r of results) if (r.won) wins += 1;
  return { wins, losses: results.length - wins };
}

function byTip(a: Game, b: Game): number {
  return (
    (a.tipOffAt ?? a.gameDate).localeCompare(b.tipOffAt ?? b.gameDate) ||
    String(a.id).localeCompare(String(b.id))
  );
}

export function buildTeamSeasons(games: Game[]): TeamSeason[] {
  const counting = countingGames(games);
  const teams = new Map<string, TeamSeason>();
  const team = (id: string, abbr: string, name: string): TeamSeason => {
    let t = teams.get(id);
    if (!t) {
      t = {
        teamId: id,
        abbr,
        name,
        conference: conferenceForTeamId(id),
        results: [],
        wins: 0,
        losses: 0,
        path: [0],
        pointDiff: 0,
        remaining: [],
      };
      teams.set(id, t);
    }
    return t;
  };

  for (const g of [...counting].sort(byTip)) {
    const home = team(g.homeTeamId, g.homeTeamAbbr ?? g.homeTeamId, g.homeTeamName ?? g.homeTeamId);
    const away = team(g.awayTeamId, g.awayTeamAbbr ?? g.awayTeamId, g.awayTeamName ?? g.awayTeamId);
    if (g.status === "scheduled") {
      home.remaining.push(away.teamId);
      away.remaining.push(home.teamId);
      continue;
    }
    if (g.status !== "final" || !hasScore(g) || g.homeScore === g.awayScore) continue;
    const margin = g.homeScore - g.awayScore;
    for (const [t, opp, isHome, m] of [
      [home, away, true, margin],
      [away, home, false, -margin],
    ] as const) {
      const won = m > 0;
      t.results.push({ date: g.gameDate, oppId: opp.teamId, home: isHome, won, margin: m });
      if (won) t.wins += 1;
      else t.losses += 1;
      t.pointDiff += m;
      t.path.push(t.wins - t.losses);
    }
  }
  return [...teams.values()];
}

export function lastGames(team: TeamSeason, n = FORM_GAMES): WinLoss & { margin: number } {
  const recent = team.results.slice(-n);
  return { ...tally(recent), margin: recent.reduce((s, r) => s + r.margin, 0) };
}

/** Current run of wins or losses. */
export function activeStreak(team: TeamSeason): { won: boolean; length: number } | null {
  const last = team.results.at(-1);
  if (!last) return null;
  let length = 0;
  for (let i = team.results.length - 1; i >= 0 && team.results[i]!.won === last.won; i -= 1) {
    length += 1;
  }
  return { won: last.won, length };
}

export function longestStreaks(team: TeamSeason): { wins: number; losses: number } {
  let wins = 0;
  let losses = 0;
  let run = 0;
  let prev: boolean | null = null;
  for (const r of team.results) {
    run = r.won === prev ? run + 1 : 1;
    prev = r.won;
    if (r.won) wins = Math.max(wins, run);
    else losses = Math.max(losses, run);
  }
  return { wins, losses };
}

export function pulsePhase(gamesPlayed: number, gamesLeft: number): PulsePhase {
  // A missing schedule also leaves zero games left, so only trust that
  // signal near the end, where postponements can keep the count short.
  if (
    gamesPlayed >= REGULAR_SEASON_GAMES ||
    (gamesLeft === 0 && gamesPlayed >= REGULAR_SEASON_GAMES - 30)
  ) {
    return "complete";
  }
  const share = gamesPlayed / REGULAR_SEASON_GAMES;
  if (share < 0.15) return "early";
  if (share < 0.6) return "middle";
  return "stretch";
}

function compareRecord(a: TeamSeason, b: TeamSeason): number {
  return (
    (winPct(b) ?? 0) - (winPct(a) ?? 0) ||
    b.wins - b.losses - (a.wins - a.losses) ||
    b.pointDiff - a.pointDiff
  );
}

function priorChange(team: TeamSeason, prior: Map<string, TeamSeason>): number | null {
  const was = prior.get(team.teamId);
  const now = winPct(team);
  const then = was ? winPct(was) : null;
  return now == null || then == null ? null : now - then;
}

const HIGHLIGHT_ROLES: Record<PulsePhase, HighlightRole[]> = {
  early: ["best", "worst", "riser", "faller"],
  middle: ["best", "hot", "cold", "riser"],
  stretch: ["best", "hot", "cold", "riser"],
  complete: ["best", "worst", "riser", "faller"],
};

export function pickHighlights(
  teams: TeamSeason[],
  prior: TeamSeason[],
  phase: PulsePhase
): Highlight[] {
  const priorById = new Map(prior.map((t) => [t.teamId, t]));
  const played = teams.filter((t) => t.results.length > 0);
  const formOf = (t: TeamSeason) => lastGames(t);
  const formRank = (a: TeamSeason, b: TeamSeason) => {
    const fa = formOf(a);
    const fb = formOf(b);
    return fb.wins - fa.wins || fb.margin - fa.margin;
  };
  const withChange = played
    .map((t) => ({ t, change: priorChange(t, priorById) }))
    .filter((x): x is { t: TeamSeason; change: number } => x.change != null);

  const candidates: Record<HighlightRole, TeamSeason[]> = {
    best: [...played].sort(compareRecord),
    worst: [...played].sort(compareRecord).reverse(),
    hot: [...played].filter((t) => t.results.length >= FORM_GAMES).sort(formRank),
    cold: [...played].filter((t) => t.results.length >= FORM_GAMES).sort(formRank).reverse(),
    riser: withChange.filter((x) => x.change > 0).sort((a, b) => b.change - a.change).map((x) => x.t),
    faller: withChange.filter((x) => x.change < 0).sort((a, b) => a.change - b.change).map((x) => x.t),
  };

  const used = new Set<string>();
  const out: Highlight[] = [];
  for (const role of HIGHLIGHT_ROLES[phase]) {
    const team = candidates[role].find((t) => !used.has(t.teamId));
    if (!team) continue;
    used.add(team.teamId);
    const was = priorById.get(team.teamId);
    out.push({
      role,
      team,
      form: tally(team.results.slice(-FORM_GAMES)),
      prior: was ? { wins: was.wins, losses: was.losses } : null,
    });
    if (out.length >= MAX_HIGHLIGHTS) break;
  }
  return out;
}

function unbeatenStory(teams: TeamSeason[]): Story | null {
  const started = teams.filter((t) => t.results.length >= 2);
  const perfect = started.filter((t) => t.losses === 0).sort((a, b) => b.wins - a.wins).slice(0, 3);
  const winless = started.filter((t) => t.wins === 0).sort((a, b) => b.losses - a.losses).slice(0, 3);
  return perfect.length || winless.length ? { kind: "unbeaten", perfect, winless } : null;
}

function streakStory(teams: TeamSeason[], mode: "active" | "longest"): Story | null {
  const wins: StreakRow[] = [];
  const losses: StreakRow[] = [];
  for (const team of teams) {
    if (mode === "active") {
      const s = activeStreak(team);
      if (s && s.length >= STREAK_MIN) (s.won ? wins : losses).push({ team, length: s.length });
    } else {
      const s = longestStreaks(team);
      if (s.wins >= STREAK_MIN) wins.push({ team, length: s.wins });
      if (s.losses >= STREAK_MIN) losses.push({ team, length: s.losses });
    }
  }
  const top = (rows: StreakRow[]) => rows.sort((a, b) => b.length - a.length).slice(0, 2);
  return wins.length || losses.length
    ? { kind: "streaks", mode, wins: top(wins), losses: top(losses) }
    : null;
}

function vsLastStory(teams: TeamSeason[], prior: TeamSeason[], minGames: number): Story | null {
  const priorById = new Map(prior.map((t) => [t.teamId, t]));
  const rows: MoverRow[] = [];
  for (const team of teams) {
    if (team.results.length < minGames) continue;
    const was = priorById.get(team.teamId);
    const change = priorChange(team, priorById);
    if (!was || change == null) continue;
    rows.push({ team, prior: { wins: was.wins, losses: was.losses }, change });
  }
  const risers = rows.filter((r) => r.change > 0).sort((a, b) => b.change - a.change).slice(0, 2);
  const fallers = rows.filter((r) => r.change < 0).sort((a, b) => a.change - b.change).slice(0, 2);
  return risers.length && fallers.length ? { kind: "vs-last", risers, fallers } : null;
}

function closeStory(teams: TeamSeason[]): Story | null {
  const rows = teams
    .map((team) => ({
      team,
      record: tally(team.results.filter((r) => Math.abs(r.margin) <= CLOSE_MARGIN)),
    }))
    .filter((r) => r.record.wins + r.record.losses >= CLOSE_MIN_GAMES);
  if (rows.length < 4) return null;
  const rank = (a: SplitRow, b: SplitRow) =>
    (winPct(b.record) ?? 0) - (winPct(a.record) ?? 0) ||
    b.record.wins - b.record.losses - (a.record.wins - a.record.losses);
  const sorted = [...rows].sort(rank);
  return { kind: "close", best: sorted.slice(0, 2), worst: sorted.slice(-2).reverse() };
}

function homeRoadStory(teams: TeamSeason[]): Story | null {
  const rows: HomeRoadRow[] = [];
  for (const team of teams) {
    const home = tally(team.results.filter((r) => r.home));
    const road = tally(team.results.filter((r) => !r.home));
    if (home.wins + home.losses < SPLIT_MIN_GAMES || road.wins + road.losses < SPLIT_MIN_GAMES) continue;
    rows.push({ team, home, road, gap: winPct(home)! - winPct(road)! });
  }
  if (rows.length < 3) return null;
  return {
    kind: "home-road",
    rows: rows.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap)).slice(0, 3),
  };
}

function scheduleStory(teams: TeamSeason[]): Story | null {
  const byId = new Map(teams.map((t) => [t.teamId, t]));
  const rows: ScheduleRow[] = [];
  for (const team of teams) {
    if (team.remaining.length < SCHEDULE_MIN_LEFT) continue;
    const pcts = team.remaining
      .map((id) => {
        const opp = byId.get(id);
        return opp ? winPct(opp) : null;
      })
      .filter((p): p is number => p != null);
    if (!pcts.length) continue;
    rows.push({
      team,
      left: team.remaining.length,
      opponentPct: pcts.reduce((s, p) => s + p, 0) / pcts.length,
    });
  }
  if (rows.length < 4) return null;
  const sorted = rows.sort((a, b) => b.opponentPct - a.opponentPct);
  return { kind: "schedule", toughest: sorted.slice(0, 2), easiest: sorted.slice(-2).reverse() };
}

const STORY_ORDER: Record<PulsePhase, Story["kind"][]> = {
  early: ["unbeaten", "vs-last", "streaks", "close", "home-road"],
  middle: ["streaks", "close", "vs-last", "home-road"],
  stretch: ["schedule", "streaks", "close", "home-road"],
  complete: ["vs-last", "streaks", "close", "home-road"],
};

export function pickStories(
  teams: TeamSeason[],
  prior: TeamSeason[],
  phase: PulsePhase
): Story[] {
  const build: Record<Story["kind"], () => Story | null> = {
    unbeaten: () => unbeatenStory(teams),
    streaks: () => streakStory(teams, phase === "complete" ? "longest" : "active"),
    "vs-last": () => vsLastStory(teams, prior, phase === "early" ? 2 : 5),
    close: () => closeStory(teams),
    "home-road": () => homeRoadStory(teams),
    schedule: () => scheduleStory(teams),
  };
  const out: Story[] = [];
  for (const kind of STORY_ORDER[phase]) {
    const story = build[kind]();
    if (story) out.push(story);
    if (out.length >= MAX_STORIES) break;
  }
  return out;
}

export function buildSeasonPulse({
  season,
  games,
  priorSeason,
  priorGames,
}: {
  season: string;
  games: Game[];
  priorSeason: string | null;
  priorGames: Game[];
}): SeasonPulse | null {
  const finished = finishedRegularGames(games);
  const totals = pulseTotals(finished);
  if (!totals) return null;
  const teams = buildTeamSeasons(games);
  const prior = buildTeamSeasons(priorGames).filter((t) => t.results.length > 0);
  const gamesLeft = teams.reduce((s, t) => s + t.remaining.length, 0) / 2;
  const phase = pulsePhase(finished.length, gamesLeft);
  return {
    season,
    priorSeason: prior.length ? priorSeason : null,
    phase,
    gamesPlayed: Math.min(finished.length, REGULAR_SEASON_GAMES),
    maxTeamGames: Math.max(0, ...teams.map((t) => t.results.length)),
    teams,
    highlights: pickHighlights(teams, prior, phase),
    stories: pickStories(teams, prior, phase),
    totals,
  };
}

/** The season to show: this one once a few nights are in, else the one before. */
export function pickPulseSeason(
  current: string,
  previous: string | null,
  finishedCount: (season: string) => number
): string | null {
  if (finishedCount(current) >= PULSE_MIN_GAMES) return current;
  return previous && finishedCount(previous) > 0 ? previous : null;
}
