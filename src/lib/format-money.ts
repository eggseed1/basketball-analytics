/**
 * Canonical money display for front-office surfaces.
 * Storage is integer USD dollars; never format floats from binary money.
 */

export function formatUsdDollars(dollars: number | null | undefined): string {
  if (dollars == null || !Number.isFinite(dollars)) return "—";
  const n = Math.trunc(dollars);
  return `$${n.toLocaleString("en-US")}`;
}

/** Compact summary cards only (tables stay precise). */
export function formatUsdCompact(dollars: number | null | undefined): string {
  if (dollars == null || !Number.isFinite(dollars)) return "—";
  const n = Math.trunc(dollars);
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000_000) {
    return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`;
  }
  if (abs >= 1_000_000) {
    return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  }
  if (abs >= 1_000) {
    return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  }
  return `${sign}${formatUsdDollars(abs)}`;
}

/** Compact with an explicit sign, for gaps such as contract surplus. Under $50K reads as $0.0M. */
export function formatUsdSignedCompact(dollars: number): string {
  if (Math.abs(dollars) < 50_000) return "$0.0M";
  const text = formatUsdCompact(Math.abs(dollars));
  return dollars > 0 ? `+${text}` : `-${text}`;
}

export function millionsToIntegerDollars(millions: number): number {
  return Math.round(millions * 1_000_000);
}
