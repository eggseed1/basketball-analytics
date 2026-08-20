/**
 * NBA half-court geometry in feet, hoop at (0, 0).
 * +x is right (offensive view), +y is toward half-court.
 *
 * Official marks used here:
 * - Basket center is 5 ft 3 in from the baseline (4 ft backboard + 15 in to rim center).
 * - Free-throw line is 15 ft from the backboard → 13.75 ft from the hoop.
 * - Lane is 16 ft wide.
 * - 3-point arc is 23 ft 9 in from the hoop; corners are 22 ft from the hoop.
 */

export const NBA_COURT = {
  widthFt: 50,
  halfLengthFt: 47,
  hoopFromBaselineFt: 5.25,
  backboardFromHoopFt: 1.25,
  backboardWidthFt: 6,
  hoopRadiusFt: 0.75,
  restrictedRadiusFt: 4,
  laneHalfWidthFt: 8,
  /** Distance from hoop center to the free-throw line. */
  ftFromHoopFt: 13.75,
  ftCircleRadiusFt: 6,
  threeRadiusFt: 23.75,
  /** Corner 3 line, parallel to the sideline. */
  threeCornerFt: 22,
} as const;

/** Where the corner 3 meets the arc (y > 0). */
export const THREE_CORNER_Y_FT = Math.sqrt(
  NBA_COURT.threeRadiusFt ** 2 - NBA_COURT.threeCornerFt ** 2
);

export const COURT_VIEW = {
  xMin: -NBA_COURT.widthFt / 2,
  xMax: NBA_COURT.widthFt / 2,
  yMin: -NBA_COURT.hoopFromBaselineFt,
  yMax: NBA_COURT.halfLengthFt - NBA_COURT.hoopFromBaselineFt,
  pxPerFoot: 10,
} as const;

export const COURT_SVG = {
  width: (COURT_VIEW.xMax - COURT_VIEW.xMin) * COURT_VIEW.pxPerFoot,
  height: (COURT_VIEW.yMax - COURT_VIEW.yMin) * COURT_VIEW.pxPerFoot,
} as const;

export function courtX(xFt: number): number {
  return (xFt - COURT_VIEW.xMin) * COURT_VIEW.pxPerFoot;
}

export function courtY(yFt: number): number {
  return (COURT_VIEW.yMax - yFt) * COURT_VIEW.pxPerFoot;
}

function px(ft: number): number {
  return ft * COURT_VIEW.pxPerFoot;
}

export function hoopCircle(): { cx: number; cy: number; r: number } {
  return {
    cx: courtX(0),
    cy: courtY(0),
    r: px(NBA_COURT.hoopRadiusFt),
  };
}

function line(x1: number, y1: number, x2: number, y2: number): string {
  return `M ${courtX(x1)} ${courtY(y1)} L ${courtX(x2)} ${courtY(y2)}`;
}

/**
 * Circular arc in court feet, hoop-relative.
 * SVG y grows down, so sweep-flag 1 is clockwise on screen = the side toward
 * half-court (increasing court y) when going left-to-right.
 */
function arc(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  radiusFt: number,
  largeArc = false
): string {
  const r = px(radiusFt);
  const large = largeArc ? 1 : 0;
  return `A ${r} ${r} 0 ${large} 1 ${courtX(x2)} ${courtY(y2)}`;
}

/** Outer boundary: baseline, sidelines, half-court. */
export function courtBoundaryPath(): string {
  const { xMin, xMax, yMin, yMax } = COURT_VIEW;
  return [
    line(xMin, yMin, xMax, yMin),
    line(xMin, yMin, xMin, yMax),
    line(xMax, yMin, xMax, yMax),
    line(xMin, yMax, xMax, yMax),
  ].join(" ");
}

/** Lane from baseline to the free-throw line (16 ft × 19 ft). */
export function lanePath(): string {
  const w = NBA_COURT.laneHalfWidthFt;
  const y0 = COURT_VIEW.yMin;
  const y1 = NBA_COURT.ftFromHoopFt;
  return `M ${courtX(-w)} ${courtY(y0)} L ${courtX(-w)} ${courtY(y1)} L ${courtX(w)} ${courtY(y1)} L ${courtX(w)} ${courtY(y0)}`;
}

export function freeThrowLinePath(): string {
  const w = NBA_COURT.laneHalfWidthFt;
  const y = NBA_COURT.ftFromHoopFt;
  return line(-w, y, w, y);
}

/** Outer half of the free-throw circle (toward half-court). */
export function freeThrowCirclePath(): string {
  const y = NBA_COURT.ftFromHoopFt;
  const r = NBA_COURT.ftCircleRadiusFt;
  return `M ${courtX(-r)} ${courtY(y)} ${arc(-r, y, r, y, r)}`;
}

export function backboardPath(): string {
  const y = -NBA_COURT.backboardFromHoopFt;
  const half = NBA_COURT.backboardWidthFt / 2;
  return line(-half, y, half, y);
}

/** Restricted-area arc in front of the hoop (4 ft). */
export function restrictedPath(): string {
  const rr = NBA_COURT.restrictedRadiusFt;
  return `M ${courtX(-rr)} ${courtY(0)} ${arc(-rr, 0, rr, 0, rr)}`;
}

/**
 * NBA 3-point line: 22 ft corner segments from the baseline, then a
 * 23.75 ft circular arc centered on the hoop.
 */
export function threePointPath(): string {
  const c = NBA_COURT.threeCornerFt;
  const yArc = THREE_CORNER_Y_FT;
  const y0 = COURT_VIEW.yMin;
  const r = NBA_COURT.threeRadiusFt;
  return [
    `M ${courtX(-c)} ${courtY(y0)}`,
    `L ${courtX(-c)} ${courtY(yArc)}`,
    arc(-c, yArc, c, yArc, r),
    `L ${courtX(c)} ${courtY(y0)}`,
  ].join(" ");
}
