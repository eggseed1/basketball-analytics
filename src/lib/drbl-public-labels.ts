/**
 * Public product labels for DRBL value metrics.
 * Presentation only — does not change R1 Points / P1 / model semantics.
 *
 * CONTRACT:
 *   internal field: r1WinEquivalents
 *   public display: WAR1
 */

/** Frozen P1 (points per win) — display/docs only; never refit here. */
export const P1_POINTS_PER_WIN = 37.490662671779255;

export const DRBL_PUBLIC_RATE_LABEL = "DRBL/100";

/** Canonical public display name for r1WinEquivalents. */
export const WAR1_LABEL = "WAR1";

/**
 * @deprecated Use WAR1_LABEL. Kept as a compile-time alias for migration.
 */
export const WINS_ABOVE_R1_LABEL = WAR1_LABEL;

/** Compact contexts — same as primary (WAR1 is already compact). */
export const WAR1_COMPACT = "WAR1";

/** @deprecated Use WAR1_COMPACT */
export const WINS_ABOVE_R1_COMPACT = WAR1_COMPACT;

export const R1_POINTS_LABEL = "R1 Points";

/** Canonical Learn destination for WAR1. */
export const WAR1_LEARN_HREF = "/learn/drbl/war1";

/** Flat StatGuide slug route — redirects to WAR1_LEARN_HREF. */
export const WAR1_LEARN_FLAT_HREF = "/learn/war1";

/** @deprecated Same as WAR1_LEARN_HREF */
export const WAR1_LEARN_NESTED_HREF = WAR1_LEARN_HREF;

/** Retired primary labels — must not appear as current metric headings. */
export const WAR1_RETIRED_PRIMARY_LABELS = [
  "Wins Above R1",
  "R1 Win Eq.",
  "R1 WinEq",
  "R1 Win Equivalent",
  "R1 Win Equivalents",
  "Wins over R1",
  "Win Equivalent",
  "Win Equivalents",
] as const;

export function formatWar1(
  value: number | null | undefined,
  digits = 1
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** @deprecated Use formatWar1 */
export const formatWinsAboveR1 = formatWar1;

export function formatR1PointsAdvanced(
  value: number | null | undefined,
  digits = 1
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}
