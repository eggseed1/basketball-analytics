import type { SentimentSeriesPoint } from "@/sentiment/curated-types";

/** Daily tone history baked to public/runtime/sentiment-history/{playerId}.json. */
export type SentimentHistoryFile = {
  playerIds: string[];
  builtAt: string;
  fan: SentimentSeriesPoint[];
  media: SentimentSeriesPoint[];
};

/** Fewer items than this in the reaction window leaves the cell blank. */
export const GAME_REACTION_MIN_ITEMS = 3;

/** Correlations need at least this many games with tone on both sides. */
export const GAME_REACTION_MIN_CORRELATION_GAMES = 10;

export type GameReaction = {
  /** Count-weighted mean tone, −1..1. Null below the item floor. */
  score: number | null;
  count: number;
};

export type SentimentGameRow = {
  gameId: string;
  date: string;
  season: string;
  seasonType: "regular" | "playoffs";
  opponentTeamId: string;
  isHome: boolean;
  minutes: number;
  points: number;
  rebounds: number;
  assists: number;
  /** Null when the player took no shots. */
  tsPct: number | null;
  fan: GameReaction;
  media: GameReaction;
};

type GameLike = {
  gameId: string;
  gameDate: string;
  season: string;
  seasonType?: "regular" | "playoffs";
  opponentTeamId: string;
  isHome: boolean;
  minutes: number;
  points: number;
  rebounds: number;
  assists: number;
  fieldGoalsAttempted: number;
  freeThrowsAttempted: number;
  didNotPlay?: boolean;
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function nextDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Tone on game day and the day after. Evening tips land postgame reaction on
 * the next UTC day, so a one-day window would miss most of it.
 */
export function gameReaction(
  points: SentimentSeriesPoint[],
  gameDate: string,
  minItems = GAME_REACTION_MIN_ITEMS
): GameReaction {
  const days = new Set([gameDate, nextDay(gameDate)]);
  let count = 0;
  let weighted = 0;
  for (const point of points) {
    if (!days.has(point.date)) continue;
    const n = point.count ?? 1;
    count += n;
    weighted += point.score * n;
  }
  return { score: count >= minItems ? round2(weighted / count) : null, count };
}

export function firstHistoryDate(history: SentimentHistoryFile | null): string | null {
  if (!history) return null;
  const dates = [history.fan[0]?.date, history.media[0]?.date].filter(
    (d): d is string => Boolean(d)
  );
  return dates.length ? dates.sort()[0]! : null;
}

function trueShooting(points: number, fga: number, fta: number): number | null {
  const attempts = 2 * (fga + 0.44 * fta);
  return attempts > 0 ? points / attempts : null;
}

/** Games on or after the first tracked sentiment day, oldest first. */
export function buildSentimentGameRows(
  games: GameLike[],
  history: SentimentHistoryFile | null
): SentimentGameRow[] {
  const since = firstHistoryDate(history);
  if (!history || !since) return [];
  const seen = new Set<string>();
  return games
    .filter((g) => !g.didNotPlay && g.minutes > 0 && g.gameDate >= since)
    .filter((g) => (seen.has(g.gameId) ? false : (seen.add(g.gameId), true)))
    .sort((a, b) => a.gameDate.localeCompare(b.gameDate))
    .map((g) => ({
      gameId: g.gameId,
      date: g.gameDate,
      season: g.season,
      seasonType: g.seasonType ?? "regular",
      opponentTeamId: g.opponentTeamId,
      isHome: g.isHome,
      minutes: g.minutes,
      points: g.points,
      rebounds: g.rebounds,
      assists: g.assists,
      tsPct: trueShooting(g.points, g.fieldGoalsAttempted, g.freeThrowsAttempted),
      fan: gameReaction(history.fan, g.gameDate),
      media: gameReaction(history.media, g.gameDate),
    }));
}

/** Pearson r. Null when there are too few pairs or one side never moves. */
export function pearson(pairs: Array<[number, number]>): number | null {
  if (pairs.length < 3) return null;
  const n = pairs.length;
  const mx = pairs.reduce((s, [x]) => s + x, 0) / n;
  const my = pairs.reduce((s, [, y]) => s + y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const [x, y] of pairs) {
    sxy += (x - mx) * (y - my);
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
  }
  if (sxx === 0 || syy === 0) return null;
  return round2(sxy / Math.sqrt(sxx * syy));
}
