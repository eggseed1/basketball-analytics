export type GradeBand =
  | "poor"
  | "below"
  | "average"
  | "good"
  | "great"
  | "elite";

/**
 * Baseball Savant RdBu: poor = blue, average = ice, elite = red.
 * Stops are [percentile, rgb].
 */
const SAVANT_STOPS: Array<[number, [number, number, number]]> = [
  [0, [13, 71, 161]],
  [20, [21, 101, 192]],
  [40, [66, 165, 245]],
  [50, [148, 163, 184]],
  [65, [239, 154, 154]],
  [80, [229, 57, 53]],
  [100, [183, 28, 28]],
];

export const SAVANT_LEGEND = {
  poor: "rgb(21, 101, 192)",
  average: "rgb(148, 163, 184)",
  great: "rgb(229, 57, 53)",
} as const;

function rgbCss(rgb: [number, number, number]) {
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

function mixRgb(
  a: [number, number, number],
  b: [number, number, number],
  t: number
): [number, number, number] {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function savantRgb(percentile: number): [number, number, number] {
  const p = Math.max(0, Math.min(100, percentile));
  for (let i = 1; i < SAVANT_STOPS.length; i++) {
    const [p1, c1] = SAVANT_STOPS[i - 1];
    const [p2, c2] = SAVANT_STOPS[i];
    if (p <= p2) {
      return mixRgb(c1, c2, (p - p1) / Math.max(1, p2 - p1));
    }
  }
  return SAVANT_STOPS[SAVANT_STOPS.length - 1][1];
}

/** Continuous Savant fill for a percentile pip / swatch. */
export function percentileSavantColor(percentile: number): string {
  return rgbCss(savantRgb(percentile));
}

/** Dark text on the icy mid-scale so the number stays readable. */
export function percentileSavantForeground(percentile: number): string {
  const [r, g, b] = savantRgb(percentile);
  const luma = (r * 299 + g * 587 + b * 114) / 1000;
  return luma > 165 ? "#111111" : "#ffffff";
}

export const GRADE_BAND_FILL: Record<GradeBand, string> = {
  poor: percentileSavantColor(10),
  below: percentileSavantColor(30),
  average: percentileSavantColor(50),
  good: percentileSavantColor(65),
  great: percentileSavantColor(82),
  elite: percentileSavantColor(96),
};

export const GRADE_BAND_LEGEND: Array<[GradeBand, string]> = [
  ["poor", "Poor"],
  ["below", "Below"],
  ["average", "Avg"],
  ["good", "Good"],
  ["great", "Great"],
  ["elite", "Elite"],
];

/** Full-track blue → ice → red, matching Baseball Savant percentile bars. */
export const GRADE_BAND_GRADIENT = `linear-gradient(90deg, ${SAVANT_STOPS.map(
  ([pct, rgb]) => `${rgbCss(rgb)} ${pct}%`
).join(", ")})`;

/** Frozen grade bands used on player percentiles / simple DRBL surface. */
export function gradeFromPercentile(percentile: number): {
  band: GradeBand;
  label: string;
} {
  const p = Math.max(0, Math.min(100, percentile));
  if (p < 20) return { band: "poor", label: "Poor" };
  if (p < 40) return { band: "below", label: "Below average" };
  if (p < 55) return { band: "average", label: "Average" };
  if (p < 75) return { band: "good", label: "Good" };
  if (p < 90) return { band: "great", label: "Great" };
  return { band: "elite", label: "Elite" };
}
