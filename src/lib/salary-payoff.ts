/**
 * How much of a player's yearly salary his play has covered so far this season.
 *
 * Worth uses the contract surplus model's prices: a replacement-level player is
 * worth the league minimum, and each win above replacement adds the market price
 * of a win. The minimum is spread evenly over the regular season, so everyone
 * starts the season at zero.
 */

export type PayoffSeasonKind = "nightly" | "paced";

/** One season as baked by scripts/build-salary-payoff.ts. */
export type PayoffSeasonFile = {
  kind: PayoffSeasonKind;
  /** Regular-season opener and last day, YYYY-MM-DD. */
  opener: string;
  end: string;
  cap: number;
  minimum: number;
  /** Dollars for one win above replacement. */
  pricePerWin: number;
  /** Dates with a reading, ascending. */
  dates: string[];
  /** key → [name, ESPN team id, salary, wins above replacement ×100 as deltas per date, NBA id]. */
  players: Record<string, [string, string, number, number[], string | null]>;
  /**
   * Left out, never counted as zero: salaries we couldn't match to any play,
   * play with no salary on file, and salaries under the league minimum, which
   * pay for only part of the season (two-way and short-term deals).
   */
  leftOut: { noValue: number; noSalary: number; partial: number };
};

export type PayoffSnapshotFile = {
  version: 1;
  generatedAt: string;
  seasons: Record<string, PayoffSeasonFile>;
  /** Opening night of each regular season on the schedule, including ones not started. */
  openers?: Record<string, string>;
};

export type PayoffSeries = {
  key: string;
  nbaId: string | null;
  name: string;
  teamId: string;
  salary: number;
  /** Dollars of worth earned by each date. */
  earned: number[];
  /** Earned as a percent of the yearly salary. */
  pct: number[];
  /**
   * Dollars of worth minus dollars of salary paid out, by date. Unlike `earned`,
   * play below replacement counts against him, so a bad stretch digs a hole.
   */
  ahead: number[];
};

const DAY_MS = 86_400_000;

function dayIndex(iso: string): number {
  return Math.round(Date.parse(`${iso}T12:00:00Z`) / DAY_MS);
}

/** Share of the regular season's days that have passed by the end of `date`. */
export function seasonDayShare(date: string, opener: string, end: string): number {
  const total = dayIndex(end) - dayIndex(opener) + 1;
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, (dayIndex(date) - dayIndex(opener) + 1) / total));
}

/** Worth so far minus the salary paid out so far; below-replacement play counts as negative wins. */
export function aheadOfPace(
  winsAboveReplacement: number,
  dayShare: number,
  salary: number,
  season: Pick<PayoffSeasonFile, "minimum" | "pricePerWin">
): number {
  return (season.minimum - salary) * dayShare + winsAboveReplacement * season.pricePerWin;
}

export function earnedValue(winsAboveReplacement: number, dayShare: number, season: Pick<PayoffSeasonFile, "minimum" | "pricePerWin">): number {
  return season.minimum * dayShare + Math.max(0, winsAboveReplacement) * season.pricePerWin;
}

/** Cumulative wins above replacement by date, from the baked ×100 deltas. */
export function cumulativeWins(deltas: number[]): number[] {
  let sum = 0;
  return deltas.map((d) => (sum += d) / 100);
}

export function payoffSeries(season: PayoffSeasonFile, key: string): PayoffSeries | null {
  const row = season.players[key];
  if (!row) return null;
  const [name, teamId, salary, deltas, nbaId] = row;
  const wins = cumulativeWins(deltas);
  const shares = season.dates.map((date) => seasonDayShare(date, season.opener, season.end));
  const earned = shares.map((share, i) => earnedValue(wins[i] ?? 0, share, season));
  return {
    key,
    nbaId,
    name,
    teamId,
    salary,
    earned,
    pct: earned.map((e) => (salary > 0 ? (e / salary) * 100 : 0)),
    ahead: shares.map((share, i) => aheadOfPace(wins[i] ?? 0, share, salary, season)),
  };
}

/** Percent of the salary paid out by each date, if salary is paid evenly over the regular season. */
export function paceSeries(season: Pick<PayoffSeasonFile, "dates" | "opener" | "end">): number[] {
  return season.dates.map((date) => seasonDayShare(date, season.opener, season.end) * 100);
}

/** First date the line reached 100%, or null. */
export function paidOffDate(series: Pick<PayoffSeries, "pct">, dates: string[]): string | null {
  const i = series.pct.findIndex((p) => p >= 100);
  return i >= 0 ? dates[i] ?? null : null;
}

/**
 * Where the line ends up if he keeps this pace. Null early in the season,
 * when a few games say little.
 */
export function projectedPct(series: Pick<PayoffSeries, "pct">, season: Pick<PayoffSeasonFile, "dates" | "opener" | "end">): number | null {
  const last = season.dates.at(-1);
  if (!last) return null;
  const share = seasonDayShare(last, season.opener, season.end);
  if (share < 0.15 || share >= 1) return null;
  return (series.pct.at(-1) ?? 0) / share;
}

/** "Oct 21" from an ISO date. */
export function shortDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
