/**
 * Display helpers for canonical stats.
 * Percentages are stored as 0-1 fractions in the data layer.
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

/** 1 → 1st, 2 → 2nd, 3 → 3rd, 11 → 11th, 21 → 21st, … */
export function formatOrdinal(n: number): string {
  const v = Math.round(n);
  const mod100 = v % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${v}th`;
  switch (v % 10) {
    case 1:
      return `${v}st`;
    case 2:
      return `${v}nd`;
    case 3:
      return `${v}rd`;
    default:
      return `${v}th`;
  }
}
