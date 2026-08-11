/**
 * Display helpers for canonical stats.
 * Percentages are stored as 0–1 fractions in the data layer.
 */

export function formatPct(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatNumber(value: number, digits = 0): string {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

export function formatMinutes(value: number): string {
  return formatNumber(Math.round(value));
}
