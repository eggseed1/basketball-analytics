import type { ComparisonDimension } from "@/analytics";
import { CATEGORY_ORDER } from "@/analytics/compare-players";

/**
 * Impact and on/off style stats centered on zero. A percent gap between two raw
 * values is meaningless here (0.5 vs 0.1 reads as an 80% gap), so without a
 * league pool they get no 0–100 position.
 */
const ZERO_CENTERED = new Set([
  "plusMinus",
  "net",
  "ows",
  "dws",
  "ws",
  "ws48",
  "obpm",
  "dbpm",
  "bpm",
  "vorp",
  "darko",
  "darkoOff",
  "darkoDef",
  "raptor",
  "oRaptor",
  "dRaptor",
  "winsAdded",
  "war1",
  "drbl100",
  "drblO",
  "drblD",
]);

/** Both sides ranked in a peer pool, so the two positions share one scale. */
export function hasPeerPercentiles(d: ComparisonDimension): boolean {
  return (
    d.aPercentile != null &&
    d.bPercentile != null &&
    Number.isFinite(d.aPercentile) &&
    Number.isFinite(d.bPercentile)
  );
}

/** Raw values where "percent of the larger number" is a fair comparison. */
function ratioComparable(d: ComparisonDimension): boolean {
  if (ZERO_CENTERED.has(d.id)) return false;
  const { aValue: a, bValue: b } = d;
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) {
    return false;
  }
  return a >= 0 && b >= 0;
}

/**
 * Signed gap for one dimension: percentile points when both sides have a peer
 * percentile, otherwise the percent gap between raw values (positive favors A).
 * Null when neither scale is honest for this row.
 */
export function compareGap(d: ComparisonDimension): number | null {
  if (hasPeerPercentiles(d)) return d.aPercentile! - d.bPercentile!;
  if (d.delta == null || !ratioComparable(d)) return null;
  const a = d.aValue!;
  const b = d.bValue!;
  const peak = Math.max(a, b);
  if (peak <= 0) return 0;
  const share = (Math.abs(a - b) / peak) * 100;
  return d.delta > 0 ? share : d.delta < 0 ? -share : 0;
}

/**
 * 0–100 position for one side of a matchup dimension. Peer percentile when both
 * sides have one; otherwise the leader sits at 100 and the trailer is shortened
 * by the percent gap (lower-is-better stats included). Null when the row has no
 * honest shared scale, such as a zero-centered stat on career rows.
 */
export function compareScore(
  d: ComparisonDimension,
  side: "a" | "b"
): number | null {
  if (hasPeerPercentiles(d)) {
    const pct = side === "a" ? d.aPercentile! : d.bPercentile!;
    return Math.max(0, Math.min(100, pct));
  }
  const gap = compareGap(d);
  if (gap == null) return null;
  const leads = side === "a" ? gap >= 0 : gap <= 0;
  return leads ? 100 : Math.max(0, 100 - Math.abs(gap));
}

export const RADAR_MAX_AXES = 8;

/**
 * Round-robin across categories so the radar covers the whole sheet. One radar
 * never mixes percentile axes with raw-gap axes.
 */
export function pickRadarAxes(
  dimensions: ComparisonDimension[],
  max = RADAR_MAX_AXES
): ComparisonDimension[] {
  const ranked = dimensions.filter(hasPeerPercentiles);
  const scored =
    ranked.length >= 3
      ? ranked
      : dimensions.filter(
          (d) =>
            !hasPeerPercentiles(d) &&
            compareScore(d, "a") != null &&
            compareScore(d, "b") != null
        );
  const buckets = CATEGORY_ORDER.map((group) =>
    scored.filter((d) => d.group === group)
  ).filter((rows) => rows.length);
  const picked: ComparisonDimension[] = [];
  for (let round = 0; picked.length < max; round += 1) {
    let added = false;
    for (const rows of buckets) {
      const d = rows[round];
      if (!d) continue;
      picked.push(d);
      added = true;
      if (picked.length >= max) break;
    }
    if (!added) break;
  }
  return picked;
}
