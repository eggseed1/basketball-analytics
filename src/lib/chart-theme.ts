"use client";

import { useOwnerTheme } from "@/components/design-system/theme-provider";
import {
  teamBrandBarColor,
  teamBrandTint,
  teamChartColor,
  type ChartSurface,
} from "@/lib/nba-brand";

export type ChartLineEmphasis = "muted" | "default" | "selected" | "focus";

export function chartLineStrokeOpacity(
  emphasis: ChartLineEmphasis,
  isDark: boolean
): number {
  if (isDark) {
    switch (emphasis) {
      case "muted":
        return 0.24;
      case "default":
        return 0.62;
      case "selected":
        return 0.95;
      case "focus":
        return 1;
    }
  }
  switch (emphasis) {
    case "muted":
      return 0.12;
    case "default":
      return 0.28;
    case "selected":
      return 0.9;
    case "focus":
      return 1;
  }
}

export function chartReferenceStrokeOpacity(isDark: boolean): number {
  return isDark ? 0.52 : 0.35;
}

export function chartGridStroke(isDark: boolean): string {
  return isDark ? "var(--border)" : "var(--border)";
}

export function chartGridStrokeOpacity(isDark: boolean): number {
  return isDark ? 0.55 : 0.45;
}

export function chartPeriodLineOpacity(isDark: boolean): number {
  return isDark ? 0.22 : 0.12;
}

/** Semantic chart colors from DRBL tokens (prefer over ad-hoc hex). */
export const chartSemantic = {
  grid: "color-mix(in oklab, var(--foreground) 8%, transparent)",
  axis: "var(--text-secondary)",
  positive: "var(--accent-positive)",
  negative: "var(--accent-negative)",
  warning: "var(--accent-warning)",
  info: "var(--accent-info)",
  neutral: "var(--accent-neutral)",
  selected: "var(--accent-selected)",
  tooltipBg: "var(--material-elevated-bg)",
  tooltipBorder: "var(--material-elevated-border)",
  percentilePoor: "var(--percentile-poor)",
  percentileAverage: "var(--percentile-average)",
  percentileElite: "var(--percentile-elite)",
} as const;

export function useChartTheme() {
  const { resolvedDark } = useOwnerTheme();
  const surface: ChartSurface = resolvedDark ? "dark" : "light";

  return {
    isDark: resolvedDark,
    surface,
    semantic: chartSemantic,
    teamColor: (teamId?: string | null) => teamChartColor(teamId, { surface }),
    teamBarColor: (teamId?: string | null) =>
      teamBrandBarColor(teamId, { surface }),
    teamTint: (teamId?: string | null, opacity?: number) =>
      teamBrandTint(teamId, opacity, { surface }),
    lineOpacity: (emphasis: ChartLineEmphasis) =>
      chartLineStrokeOpacity(emphasis, resolvedDark),
    referenceOpacity: () => chartReferenceStrokeOpacity(resolvedDark),
    gridOpacity: () => chartGridStrokeOpacity(resolvedDark),
    periodLineOpacity: () => chartPeriodLineOpacity(resolvedDark),
  };
}
