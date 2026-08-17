/**
 * Public product labels for DRBL value metrics.
 * Presentation only — does not change R1 Points / P1 / model semantics.
 */

/** Frozen P1 (points per win) — display/docs only; never refit here. */
export const P1_POINTS_PER_WIN = 37.490662671779255;

export const DRBL_PUBLIC_RATE_LABEL = "DRBL/100";
export const WINS_ABOVE_R1_LABEL = "Wins Above R1";
/** Compact contexts only — always pair with tooltip / MetricHelp. */
export const WINS_ABOVE_R1_COMPACT = "WAR1";
export const R1_POINTS_LABEL = "R1 Points";

export function formatWinsAboveR1(
  value: number | null | undefined,
  digits = 1
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

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
