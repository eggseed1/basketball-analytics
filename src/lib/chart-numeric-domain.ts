/**
 * Numeric axis domains that always contain the data (plus padding).
 * Prevents scatter / race markers from rendering past the plot edge.
 */

export type FitNumericDomainOptions = {
  /** Allow domain below 0 (impact, BPM, etc.). */
  allowNegative?: boolean;
  /** Force 0 into the domain when useful for bipolar metrics. */
  includeZero?: boolean;
  /** Pad as a fraction of the data span. Default 0.12. */
  padRatio?: number;
  /** Minimum pad in data units. Default 0.75. */
  padAbsolute?: number;
  /** Minimum domain width. */
  minSpan?: number;
};

/**
 * Fit `[lo, hi]` to every finite value so extremes stay inside the plot
 * (with room for marker radius). Never hard-caps the max/min.
 */
export function fitNumericDomain(
  values: Iterable<number>,
  options: FitNumericDomainOptions = {}
): [number, number] {
  const nums: number[] = [];
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) nums.push(value);
  }
  if (!nums.length) return [0, 1];

  const dataMin = Math.min(...nums);
  const dataMax = Math.max(...nums);
  const allowNegative = options.allowNegative === true;
  const padRatio = options.padRatio ?? 0.12;
  const padAbsolute = options.padAbsolute ?? 0.75;
  const minSpan = options.minSpan ?? 1;

  const rawSpan = dataMax - dataMin;
  const span = Math.max(rawSpan, minSpan);
  const pad = Math.max(padAbsolute, span * padRatio);

  let lo = dataMin - pad;
  let hi = dataMax + pad;

  if (options.includeZero) {
    lo = Math.min(lo, 0);
    hi = Math.max(hi, 0);
  }

  // Non-negative series: pin the floor at 0 when it doesn't clip data.
  if (!allowNegative && dataMin >= -1e-9) {
    lo = Math.max(0, lo);
  }

  if (hi <= lo) hi = lo + minSpan;

  // Absolute guarantee — never clip an observed value.
  if (lo > dataMin) lo = dataMin - pad;
  if (hi < dataMax) hi = dataMax + pad;
  if (!allowNegative && dataMin >= -1e-9 && lo < 0) lo = 0;
  if (hi < dataMax) hi = dataMax + Math.max(pad, padAbsolute);
  if (hi <= lo) hi = lo + minSpan;

  return [lo, hi];
}
