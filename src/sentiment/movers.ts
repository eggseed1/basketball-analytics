import type {
  PlayerSentimentProfile,
  SentimentMoverRow,
  SentimentSeriesPoint,
} from "@/sentiment/curated-types";
import { sentimentPlayerLabel } from "@/sentiment/player-label";
import { isRotationPlayer, type SeasonForm } from "@/sentiment/season-form";

const DAY_MS = 86_400_000;

/** Fan posts needed in the current window. Below this a swing is noise. */
export const MOVER_MIN_ITEMS = 20;
/** Fan posts needed in the previous window, so there is a real baseline. */
export const MOVER_MIN_PRIOR_ITEMS = 12;
/**
 * Pseudo-posts that pull each window toward the player's own 30-day average.
 * With 12, a window of 12 posts counts for half its raw distance from average.
 */
export const MOVER_SHRINK_ITEMS = 12;
/** Smaller shifts are not worth a row (4 points on the 0–100 mood scale). */
export const MOVER_MIN_DELTA = 0.08;

export type FanMoodShift = {
  /** Shrunk change in tone, current window minus previous window. */
  delta: number;
  itemsNow: number;
  itemsPrior: number;
};

type MoverFloors = {
  minItems?: number;
  minPriorItems?: number;
  shrinkItems?: number;
};

function dayMs(date: string): number {
  return Date.parse(`${date}T12:00:00Z`);
}

/** Count-weighted tone and item count for points `fromDays` to `toDays` back from the anchor. */
function windowStat(
  points: readonly SentimentSeriesPoint[],
  anchorMs: number,
  fromDays: number,
  toDays: number
): { items: number; mean: number | null } {
  let items = 0;
  let weighted = 0;
  for (const point of points) {
    const age = Math.round((anchorMs - dayMs(point.date)) / DAY_MS);
    if (age < fromDays || age >= toDays) continue;
    const n = point.count ?? 1;
    items += n;
    weighted += point.score * n;
  }
  return { items, mean: items ? weighted / items : null };
}

/** Newest day with fan data across profiles, so every player is judged on the same window. */
export function latestFanDate(profiles: readonly PlayerSentimentProfile[]): string | null {
  let latest: string | null = null;
  for (const profile of profiles) {
    const last = profile.series?.fan?.at(-1)?.date;
    if (last && (!latest || last > latest)) latest = last;
  }
  return latest;
}

/**
 * Change in fan tone between the last `lookbackDays` and the `lookbackDays`
 * before that. Windows are real dates, not array slots, and every post counts
 * once, so one day's single ±1 comment cannot stand in for the week. Null when
 * either window is too thin to trust.
 */
export function fanMoodShift(
  profile: PlayerSentimentProfile,
  lookbackDays: number,
  options: MoverFloors & { asOf?: string } = {}
): FanMoodShift | null {
  const series = profile.series?.fan;
  if (!series || series.length < 2) return null;
  const minItems = options.minItems ?? MOVER_MIN_ITEMS;
  const minPrior = options.minPriorItems ?? MOVER_MIN_PRIOR_ITEMS;
  const k = options.shrinkItems ?? MOVER_SHRINK_ITEMS;
  const anchor = dayMs(options.asOf ?? series[series.length - 1]!.date);

  const now = windowStat(series, anchor, 0, lookbackDays);
  const prior = windowStat(series, anchor, lookbackDays, lookbackDays * 2);
  if (now.mean == null || prior.mean == null) return null;
  if (now.items < minItems || prior.items < minPrior) return null;

  const base = windowStat(series, anchor, 0, lookbackDays * 4).mean ?? 0;
  const shrunk = (w: { items: number; mean: number }) =>
    base + (w.items * (w.mean - base)) / (w.items + k);
  const delta =
    shrunk({ items: now.items, mean: now.mean }) -
    shrunk({ items: prior.items, mean: prior.mean });
  return {
    delta: Math.round(delta * 1000) / 1000,
    itemsNow: now.items,
    itemsPrior: prior.items,
  };
}

export function toSentimentMoverRow(
  profile: PlayerSentimentProfile,
  shift: FanMoodShift,
  form?: SeasonForm
): SentimentMoverRow | null {
  const playerId = profile.playerIds[0];
  if (!playerId || !profile.fan) return null;
  return {
    playerId,
    displayName: sentimentPlayerLabel(playerId, profile.displayName),
    teamKey: profile.teamKey,
    fanScore: profile.fan.score,
    delta: shift.delta,
    mentionVolume: shift.itemsNow,
    priorVolume: shift.itemsPrior,
    origin: profile.fan.origin,
    asOf: profile.fan.asOf,
    ...(form ? { form } : {}),
  };
}

export function computeSentimentMovers(
  profiles: PlayerSentimentProfile[],
  options?: MoverFloors & {
    limit?: number;
    lookbackDays?: number;
    minDelta?: number;
    asOf?: string;
    /**
     * Season production by profile. When given, only regular rotation players
     * qualify, which keeps bench names with a handful of posts off the board.
     */
    formFor?: (profile: PlayerSentimentProfile) => SeasonForm | undefined;
  }
): { risers: SentimentMoverRow[]; fallers: SentimentMoverRow[] } {
  const limit = options?.limit ?? 4;
  const lookbackDays = options?.lookbackDays ?? 7;
  const minDelta = options?.minDelta ?? MOVER_MIN_DELTA;
  const asOf = options?.asOf ?? latestFanDate(profiles) ?? undefined;
  const scored: SentimentMoverRow[] = [];

  for (const profile of profiles) {
    const form = options?.formFor?.(profile);
    if (options?.formFor && !isRotationPlayer(form)) continue;
    const shift = fanMoodShift(profile, lookbackDays, { ...options, asOf });
    if (!shift || Math.abs(shift.delta) < minDelta) continue;
    const row = toSentimentMoverRow(profile, shift, form);
    if (row) scored.push(row);
  }

  return {
    risers: scored
      .filter((row) => row.delta > 0)
      .sort((a, b) => b.delta - a.delta)
      .slice(0, limit),
    fallers: scored
      .filter((row) => row.delta < 0)
      .sort((a, b) => a.delta - b.delta)
      .slice(0, limit),
  };
}
