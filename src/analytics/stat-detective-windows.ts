/**
 * Multi-window counting deltas from regular-season game logs.
 * Missing games are omitted. Playoffs are never mixed into a regular window.
 */

export type StatWindowId = "last5" | "last10" | "split5";

export type StatWindowGame = {
  date: string;
  gameId: string;
  minutesNum: number;
  points: number;
  fga: number;
  fta: number;
  seasonType?: string;
};

export type WindowRate = {
  games: number;
  ppg: number;
  /** Null when the shot sample is too thin to quote true shooting. */
  ts: number | null;
};

export type WindowDelta = {
  windowId: StatWindowId;
  windowGames: number;
  baselineGames: number;
  windowPpg: number;
  baselinePpg: number;
  deltaPpg: number;
  windowMpg: number;
  baselineMpg: number;
  windowTs: number | null;
  baselineTs: number | null;
  deltaTs: number | null;
};

export const STAT_WINDOWS: Record<
  StatWindowId,
  {
    label: string;
    question: string;
    note: string;
    baselineLabel: string;
    windowLabel: string;
    minAbsPpg: number;
  }
> = {
  last5: {
    label: "Last 5 vs season",
    question: "Who's heating up right now?",
    note: "Last 5 regular-season games compared with that player's season average.",
    baselineLabel: "Season avg",
    windowLabel: "Last 5",
    minAbsPpg: 3,
  },
  last10: {
    label: "Last 10 vs season",
    question: "Is the surge (or slump) sticking?",
    note: "Last 10 regular-season games compared with that player's season average.",
    baselineLabel: "Season avg",
    windowLabel: "Last 10",
    minAbsPpg: 2,
  },
  split5: {
    label: "Last 5 vs prior 5",
    question: "Who just flipped?",
    note: "Last 5 regular-season games compared with the 5 before them — no overlap.",
    baselineLabel: "Prior 5",
    windowLabel: "Last 5",
    minAbsPpg: 3,
  },
};

const SEASON_MIN_GAMES = 20;
/** Rotation floor. Call-ups under 18 minutes a game stay off the list. */
const MIN_MPG = 18;
const TS_MIN_DENOM = 20;

export function regularSeasonGames(games: StatWindowGame[]): StatWindowGame[] {
  const seen = new Set<string>();
  const out: StatWindowGame[] = [];
  for (const game of games) {
    if (game.seasonType !== "regular") continue;
    if (!(game.minutesNum >= 1)) continue;
    if (!Number.isFinite(game.points)) continue;
    const id = String(game.gameId || `${game.date}:${game.points}`);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(game);
  }
  return out.sort(
    (a, b) => a.date.localeCompare(b.date) || a.gameId.localeCompare(b.gameId)
  );
}

function mpg(games: StatWindowGame[]): number {
  if (!games.length) return 0;
  const minutes = games.reduce((sum, game) => sum + game.minutesNum, 0);
  return minutes / games.length;
}

export function windowRate(games: StatWindowGame[]): WindowRate | null {
  if (!games.length) return null;
  const points = games.reduce((sum, game) => sum + game.points, 0);
  const fga = games.reduce((sum, game) => sum + (Number(game.fga) || 0), 0);
  const fta = games.reduce((sum, game) => sum + (Number(game.fta) || 0), 0);
  const denom = 2 * (fga + 0.44 * fta);
  return {
    games: games.length,
    ppg: points / games.length,
    ts: denom >= TS_MIN_DENOM ? points / denom : null,
  };
}

function delta(
  windowId: StatWindowId,
  recent: StatWindowGame[],
  baseline: StatWindowGame[]
): WindowDelta | null {
  if (mpg(recent) < MIN_MPG || mpg(baseline) < MIN_MPG) return null;
  const window = windowRate(recent);
  const base = windowRate(baseline);
  if (!window || !base) return null;
  const deltaTs =
    window.ts != null && base.ts != null ? window.ts - base.ts : null;
  return {
    windowId,
    windowGames: window.games,
    baselineGames: base.games,
    windowPpg: window.ppg,
    baselinePpg: base.ppg,
    deltaPpg: window.ppg - base.ppg,
    windowMpg: mpg(recent),
    baselineMpg: mpg(baseline),
    windowTs: window.ts,
    baselineTs: base.ts,
    deltaTs,
  };
}

/** One player's windows. Null fields mean the sample did not qualify. */
export function playerWindowDeltas(
  games: StatWindowGame[]
): Partial<Record<StatWindowId, WindowDelta>> {
  const regular = regularSeasonGames(games);
  const out: Partial<Record<StatWindowId, WindowDelta>> = {};
  if (regular.length >= SEASON_MIN_GAMES && mpg(regular) >= MIN_MPG) {
    const last5 = delta("last5", regular.slice(-5), regular);
    const last10 =
      regular.length >= 10
        ? delta("last10", regular.slice(-10), regular)
        : null;
    if (last5) out.last5 = last5;
    if (last10) out.last10 = last10;
  }
  if (regular.length >= 10) {
    const split = delta("split5", regular.slice(-5), regular.slice(-10, -5));
    if (split) out.split5 = split;
  }
  return out;
}

export function qualifiesWindow(delta: WindowDelta): boolean {
  return Math.abs(delta.deltaPpg) >= STAT_WINDOWS[delta.windowId].minAbsPpg;
}
