/**
 * Formatting helpers + short value captions used near numbers.
 * Full pedagogy lives on /learn/[slug].
 */

export function explainDarko(impact: number): string {
  const abs = Math.abs(impact);
  const pts = abs.toFixed(1);
  if (impact >= 4) return `~${pts} pts/100 above average`;
  if (impact >= 2) return `~${pts} pts/100 above average`;
  if (impact >= 0.5) return `~${pts} pts/100 above average`;
  if (impact > -0.5) return `Near average`;
  if (impact > -2) return `~${pts} pts/100 below average`;
  return `~${pts} pts/100 below average`;
}

export function explainTs(ts: number): string {
  const pct = Math.round(ts * 1000) / 10;
  return `${pct}% TS`;
}

export function formatImpact(impact: number): string {
  const sign = impact >= 0 ? "+" : "";
  return `${sign}${impact.toFixed(2)}`;
}

export function formatPct(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}
