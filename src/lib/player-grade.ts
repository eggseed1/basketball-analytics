export type GradeBand =
  | "poor"
  | "below"
  | "average"
  | "good"
  | "great"
  | "elite";

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
