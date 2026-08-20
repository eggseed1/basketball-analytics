/**
 * Canonical half-court coordinate system + zone geometry (P18).
 *
 * Basket at (0, 0). x = left/right feet, y = baseline → half-court feet.
 * NBA liveData xLegacy/yLegacy are tenths of a foot from basket; we convert.
 */

export type ShotZoneId =
  | "RIM"
  | "PAINT_NON_RIM"
  | "SHORT_MIDRANGE"
  | "LONG_MIDRANGE"
  | "LEFT_CORNER_3"
  | "RIGHT_CORNER_3"
  | "ABOVE_BREAK_3"
  | "HEAVE"
  | "UNKNOWN";

export const SHOT_ZONE_LABELS: Record<ShotZoneId, string> = {
  RIM: "Rim",
  PAINT_NON_RIM: "Paint (non-rim)",
  SHORT_MIDRANGE: "Short midrange",
  LONG_MIDRANGE: "Long midrange",
  LEFT_CORNER_3: "Left corner 3",
  RIGHT_CORNER_3: "Right corner 3",
  ABOVE_BREAK_3: "Above-break 3",
  HEAVE: "Heave",
  UNKNOWN: "Unknown",
};

/** Minimum FGA before hot/cold categorization (not raw FG%). */
export const SMALL_SAMPLE_FGA_THRESHOLD = 5;

/** Minimum share of FGA with coordinates to present chart as complete. */
export const SHOT_CHART_COMPLETE_COVERAGE = 0.85;

export interface CanonicalCourtPoint {
  x: number;
  y: number;
}

/**
 * Normalize NBA CDN / stats PBP xLegacy,yLegacy (tenths of feet) into feet.
 * Does not invent coordinates — returns null when source zeros / missing.
 */
export function normalizeNbaLegacyCoords(
  xLegacy: unknown,
  yLegacy: unknown,
  opts?: { treatZeroAsMissing?: boolean }
): CanonicalCourtPoint | null {
  const xRaw = Number(xLegacy);
  const yRaw = Number(yLegacy);
  if (!Number.isFinite(xRaw) || !Number.isFinite(yRaw)) return null;
  if (opts?.treatZeroAsMissing !== false && xRaw === 0 && yRaw === 0) {
    return null;
  }
  // NBA legacy: typically tenths of a foot
  return { x: xRaw / 10, y: yRaw / 10 };
}

export function shotDistanceFeet(point: CanonicalCourtPoint): number {
  return Math.sqrt(point.x * point.x + point.y * point.y);
}

/**
 * Discrete zone assignment from canonical feet + optional 3PT flag.
 * Geometry frozen for P18.
 */
export function assignShotZone(
  point: CanonicalCourtPoint | null,
  shotType: "2PT" | "3PT" | null,
  distanceHint?: number | null
): ShotZoneId {
  if (!point) return "UNKNOWN";
  const dist =
    distanceHint != null && Number.isFinite(distanceHint)
      ? distanceHint
      : shotDistanceFeet(point);
  const { x, y } = point;

  if (dist >= 40) return "HEAVE";

  const isThree =
    shotType === "3PT" || dist >= 22; /* approx corner/arc */

  // Corners: deep y near baseline, |x| wide
  if (isThree && y <= 8.75 && x <= -22) return "LEFT_CORNER_3";
  if (isThree && y <= 8.75 && x >= 22) return "RIGHT_CORNER_3";
  if (isThree) return "ABOVE_BREAK_3";

  if (dist <= 4) return "RIM";
  // Restricted / paint box approx: |x|<=8, y<=13.75
  if (Math.abs(x) <= 8 && y <= 13.75) return "PAINT_NON_RIM";
  if (dist <= 14) return "SHORT_MIDRANGE";
  return "LONG_MIDRANGE";
}

export function zoneFgPct(fgm: number, fga: number): number | null {
  if (fga <= 0) return null;
  return fgm / fga;
}

export function isSmallSample(fga: number): boolean {
  return fga > 0 && fga < SMALL_SAMPLE_FGA_THRESHOLD;
}
