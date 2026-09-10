/**
 * Shared field-size / rank-end slicing for Explore visualizations.
 */

import {
  takePlayerRaceFieldSlice,
  type PlayerRaceFieldSize,
  type PlayerRaceRankEnd,
} from "@/lib/player-race-tracker";

/**
 * Sort a peer pool and keep top / bottom / both ends (pins always retained).
 */
export function applyVizFieldFilter<T>(
  points: T[],
  options: {
    fieldSize: PlayerRaceFieldSize;
    rankEnd: PlayerRaceRankEnd;
    keyOf: (point: T) => string;
    sortValue: (point: T) => number;
    /** Default true. */
    higherIsBetter?: boolean;
    isPinned?: (point: T) => boolean;
  }
): T[] {
  if (!points.length) return [];

  const higher = options.higherIsBetter !== false;
  const pinned = options.isPinned
    ? points.filter((point) => options.isPinned!(point))
    : [];
  const unpinned = options.isPinned
    ? points.filter((point) => !options.isPinned!(point))
    : points;

  const sorted = [...unpinned].sort((a, b) => {
    const av = options.sortValue(a);
    const bv = options.sortValue(b);
    if (av !== bv) return higher ? bv - av : av - bv;
    return options.keyOf(a).localeCompare(options.keyOf(b));
  });

  const field =
    options.fieldSize === "all"
      ? sorted
      : takePlayerRaceFieldSlice(
          sorted,
          options.fieldSize,
          options.rankEnd,
          options.keyOf
        );

  if (!pinned.length) return field;

  const seen = new Set(field.map(options.keyOf));
  const extras = pinned.filter((point) => {
    const key = options.keyOf(point);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return extras.length ? [...field, ...extras] : field;
}

/** Parse URL `end` without tying defaults to a race metric. */
export function parseVizRankEnd(
  raw: string | null | undefined,
  defaultEnd: PlayerRaceRankEnd = "high"
): PlayerRaceRankEnd {
  const value = String(raw ?? "").trim().toLowerCase();
  if (
    value === "low" ||
    value === "bottom" ||
    value === "tail" ||
    value === "negative" ||
    value === "neg"
  ) {
    return "low";
  }
  if (
    value === "both" ||
    value === "span" ||
    value === "ends" ||
    value === "split"
  ) {
    return "both";
  }
  if (
    value === "high" ||
    value === "top" ||
    value === "leaders" ||
    value === "positive" ||
    value === "pos"
  ) {
    return "high";
  }
  return defaultEnd;
}
