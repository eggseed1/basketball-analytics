import type { Game } from "@/data/types/game";
import type { LeagueStandings, StandingRow } from "@/data/types/standings";
import {
  conferenceForTeamId,
  isNbaFranchiseTeamId,
} from "@/lib/standings-from-games";
import { TEAM_BRANDS } from "@/lib/nba-brand";

export type StandingsTrackerPoint = {
  date: string;
  wins: number;
  losses: number;
  /** wins − losses (games above .500). */
  diff: number;
};

export type StandingsTrackerTeam = {
  teamId: string;
  abbreviation: string;
  displayName: string;
  conference: "East" | "West";
  points: StandingsTrackerPoint[];
  currentDiff: number;
  currentWins: number;
  currentLosses: number;
};

export type StandingsTrackerWindow = 7 | 30 | 180 | "all";

export type StandingsTrackerChartRow = {
  date: string;
  label: string;
  [teamId: string]: string | number | null | undefined;
};

const DEFAULT_GAME_TYPES: Game["gameType"][] = ["regular"];

function brandForTeamId(teamId: string) {
  for (const brand of Object.values(TEAM_BRANDS)) {
    if (brand.espnTeamId === teamId) return brand;
  }
  return null;
}

function standingMeta(
  standings: LeagueStandings | null
): Map<string, StandingRow> {
  const map = new Map<string, StandingRow>();
  if (!standings) return map;
  for (const conf of standings.conferences) {
    for (const row of conf.rows) {
      map.set(row.teamId, row);
    }
  }
  return map;
}

function teamGames(
  teamId: string,
  games: Game[],
  gameTypes: Set<Game["gameType"]>
): Game[] {
  return games
    .filter(
      (game) =>
        game.status === "final" &&
        gameTypes.has(game.gameType) &&
        (game.homeTeamId === teamId || game.awayTeamId === teamId)
    )
    .sort(
      (a, b) =>
        a.gameDate.localeCompare(b.gameDate) ||
        String(a.id).localeCompare(String(b.id))
    );
}

function buildTeamSeries(games: Game[], teamId: string): StandingsTrackerPoint[] {
  let wins = 0;
  let losses = 0;
  const byDate = new Map<string, StandingsTrackerPoint>();

  for (const game of games) {
    const isHome = game.homeTeamId === teamId;
    const teamScore = isHome ? game.homeScore : game.awayScore;
    const oppScore = isHome ? game.awayScore : game.homeScore;
    if (teamScore > oppScore) wins += 1;
    else if (teamScore < oppScore) losses += 1;

    byDate.set(game.gameDate, {
      date: game.gameDate,
      wins,
      losses,
      diff: wins - losses,
    });
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Build per-team win−loss differential curves from a season game archive. */
export function buildStandingsTrackerTeams(
  games: Game[],
  standings: LeagueStandings | null,
  options?: { gameTypes?: Game["gameType"][] }
): StandingsTrackerTeam[] {
  const gameTypes = new Set(options?.gameTypes ?? DEFAULT_GAME_TYPES);
  const meta = standingMeta(standings);
  const teamIds = new Set<string>();

  for (const game of games) {
    if (game.status !== "final" || !gameTypes.has(game.gameType)) continue;
    if (isNbaFranchiseTeamId(game.homeTeamId)) teamIds.add(game.homeTeamId);
    if (isNbaFranchiseTeamId(game.awayTeamId)) teamIds.add(game.awayTeamId);
  }

  for (const row of meta.values()) {
    if (isNbaFranchiseTeamId(row.teamId)) teamIds.add(row.teamId);
  }

  if (meta.size > 0) {
    for (const id of [...teamIds]) {
      if (!meta.has(id)) teamIds.delete(id);
    }
  }

  const teams: StandingsTrackerTeam[] = [];

  for (const teamId of teamIds) {
    const row = meta.get(teamId);
    const brand = brandForTeamId(teamId);
    const series = buildTeamSeries(teamGames(teamId, games, gameTypes), teamId);
    const last = series[series.length - 1];
    teams.push({
      teamId,
      abbreviation: row?.abbreviation ?? brand?.abbr ?? teamId,
      displayName: row?.displayName ?? brand?.abbr ?? teamId,
      conference:
        row?.conference ?? conferenceForTeamId(teamId) ?? "East",
      points: series,
      currentDiff: last?.diff ?? 0,
      currentWins: last?.wins ?? 0,
      currentLosses: last?.losses ?? 0,
    });
  }

  return teams.sort((a, b) => {
    if (b.currentDiff !== a.currentDiff) return b.currentDiff - a.currentDiff;
    return a.displayName.localeCompare(b.displayName);
  });
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function formatTrackerAxisDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString(undefined, { month: "numeric", day: "numeric" });
}

/** Merge team curves onto a shared timeline with forward-filled diffs. */
export function buildStandingsTrackerChartRows(
  teams: StandingsTrackerTeam[],
  window: StandingsTrackerWindow
): StandingsTrackerChartRow[] {
  if (!teams.length) return [];

  const dateSet = new Set<string>();
  for (const team of teams) {
    for (const point of team.points) dateSet.add(point.date);
  }

  let dates = [...dateSet].sort();
  if (!dates.length) return [];

  if (window !== "all") {
    const end = dates[dates.length - 1]!;
    const start = addDays(end, -(window - 1));
    dates = dates.filter((date) => date >= start);
    if (!dates.length) dates = [end];
  }

  return dates.map((date) => {
    const row: StandingsTrackerChartRow = {
      date,
      label: formatTrackerAxisDate(date),
    };
    for (const team of teams) {
      const latest = team.points.filter((point) => point.date <= date).at(-1);
      row[team.teamId] = latest?.diff ?? null;
    }
    return row;
  });
}

export function filterTrackerTeamsByConference(
  teams: StandingsTrackerTeam[],
  conference: "East" | "West" | "All"
): StandingsTrackerTeam[] {
  if (conference === "All") return teams;
  return teams.filter((team) => team.conference === conference);
}

export function trackerYAxisDomain(
  rows: StandingsTrackerChartRow[],
  teamIds: string[]
): [number, number] {
  let min = 0;
  let max = 0;
  for (const row of rows) {
    for (const teamId of teamIds) {
      const value = row[teamId];
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
  }
  const span = Math.max(10, max - min);
  const step = trackerYAxisStep(span);
  const pad = step;
  const lo = Math.floor((min - pad) / step) * step;
  const hi = Math.ceil((max + pad) / step) * step;
  return [lo, hi];
}

/** Even tick step so the scale reads like a normal sports chart. */
export function trackerYAxisStep(span: number): number {
  if (span <= 20) return 5;
  if (span <= 60) return 10;
  if (span <= 120) return 20;
  return 25;
}

export function trackerYAxisTicks(domain: [number, number]): number[] {
  const [min, max] = domain;
  const step = trackerYAxisStep(max - min);
  const ticks: number[] = [];
  for (let v = min; v <= max + 1e-9; v += step) {
    ticks.push(Math.round(v));
  }
  if (!ticks.includes(0) && min < 0 && max > 0) {
    ticks.push(0);
    ticks.sort((a, b) => a - b);
  }
  return ticks;
}

/** Plain-language axis labels for a general audience. */
export function formatTrackerYTick(value: number): string {
  if (value === 0) return ".500";
  return value > 0 ? `+${value}` : `${value}`;
}

export type StandingsNeighborGap = {
  teamId: string;
  abbreviation: string;
  diff: number;
  /** Positive = this neighbor is ahead (higher games-above-.500). */
  gap: number;
};

/** Immediate standings neighbors by games-above-.500 at a chart row. */
/** Pick the team line closest to the pointer at a chart row (vertical hit test). */
export function nearestTrackerTeamAtPointer(
  teams: StandingsTrackerTeam[],
  row: StandingsTrackerChartRow,
  pointerY: number,
  yDomain: [number, number],
  plot: { top: number; height: number }
): string | null {
  const [yMin, yMax] = yDomain;
  const span = yMax - yMin;
  if (!Number.isFinite(span) || span <= 0 || plot.height <= 0) return null;

  let bestId: string | null = null;
  let bestDist = Infinity;
  let bestDiff = -Infinity;

  for (const team of teams) {
    const value = row[team.teamId];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;

    const pointY = plot.top + ((yMax - value) / span) * plot.height;
    const dist = Math.abs(pointerY - pointY);

    if (
      dist < bestDist - 1e-6 ||
      (Math.abs(dist - bestDist) <= 1e-6 && value > bestDiff)
    ) {
      bestDist = dist;
      bestDiff = value;
      bestId = team.teamId;
    }
  }

  return bestId;
}

export function standingsNeighborsAt(
  teams: StandingsTrackerTeam[],
  teamId: string,
  row: StandingsTrackerChartRow | null | undefined
): { above: StandingsNeighborGap | null; below: StandingsNeighborGap | null } {
  if (!row) return { above: null, below: null };

  const ranked = teams
    .map((team) => {
      const diff = row[team.teamId];
      return typeof diff === "number" && Number.isFinite(diff)
        ? { team, diff }
        : null;
    })
    .filter((entry): entry is { team: StandingsTrackerTeam; diff: number } =>
      Boolean(entry)
    )
    .sort(
      (a, b) =>
        b.diff - a.diff ||
        a.team.abbreviation.localeCompare(b.team.abbreviation)
    );

  const index = ranked.findIndex((entry) => entry.team.teamId === teamId);
  if (index < 0) return { above: null, below: null };

  const self = ranked[index]!;
  const aboveRow = ranked[index - 1];
  const belowRow = ranked[index + 1];

  return {
    above: aboveRow
      ? {
          teamId: aboveRow.team.teamId,
          abbreviation: aboveRow.team.abbreviation,
          diff: aboveRow.diff,
          gap: aboveRow.diff - self.diff,
        }
      : null,
    below: belowRow
      ? {
          teamId: belowRow.team.teamId,
          abbreviation: belowRow.team.abbreviation,
          diff: belowRow.diff,
          gap: self.diff - belowRow.diff,
        }
      : null,
  };
}
