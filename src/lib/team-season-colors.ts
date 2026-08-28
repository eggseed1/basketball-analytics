import type { CSSProperties } from "react";

import {
  teamChartColor,
  type ChartSurface,
} from "@/lib/nba-brand";
import { normalizeTeamParam } from "@/lib/team-identity";

export function normalizeSeasonTeamKeys(
  keys?: string[] | null,
  fallback?: string
): string[] {
  if (keys?.length) {
    return [...new Set(keys.filter((key) => key && key !== "TOT"))];
  }
  if (fallback && fallback !== "TOT") return [fallback];
  return [];
}

export function teamSeasonChartColors(
  teamKeys: string[],
  surface: ChartSurface = "light"
): string[] {
  const colors: string[] = [];
  const seen = new Set<string>();
  for (const key of teamKeys) {
    const { color } = teamChartColor(key, { surface });
    if (seen.has(color)) continue;
    seen.add(color);
    colors.push(color);
  }
  return colors;
}

/** Solid or multi-franchise gradient fill for season ticks, bars, and swatches. */
export function teamSeasonFillStyle(
  teamKeys: string[],
  surface: ChartSurface = "light"
): CSSProperties {
  const colors = teamSeasonChartColors(teamKeys, surface);
  if (colors.length === 0) return { backgroundColor: "#8e8e93" };
  if (colors.length === 1) return { backgroundColor: colors[0] };
  const stops = colors
    .map((color, index) => {
      const start = (index / colors.length) * 100;
      const end = ((index + 1) / colors.length) * 100;
      return `${color} ${start}% ${end}%`;
    })
    .join(", ");
  return { background: `linear-gradient(90deg, ${stops})` };
}

/**
 * Full career timeline track: color stops at each season tick so adjacent
 * franchises blend across the gap instead of a hard midpoint cut.
 */
export function seasonTrackGradientStyle(
  seasons: string[],
  resolveKeys: (season: string) => string[],
  surface: ChartSurface = "light"
): CSSProperties {
  if (seasons.length === 0) return { backgroundColor: "#8e8e93" };
  if (seasons.length === 1) {
    return teamSeasonFillStyle(resolveKeys(seasons[0]!), surface);
  }
  const last = seasons.length - 1;
  const stops = seasons.map((season, index) => {
    const colors = teamSeasonChartColors(resolveKeys(season), surface);
    const color = colors[0] ?? "#8e8e93";
    const pos = (index / last) * 100;
    return `${color} ${pos}%`;
  });
  return { background: `linear-gradient(90deg, ${stops.join(", ")})` };
}

export function teamSeasonLabel(teamKeys: string[]): string {
  if (!teamKeys.length) return "—";
  if (teamKeys.length === 1) {
    const key = teamKeys[0]!;
    return (
      normalizeTeamParam(key)?.displayName ?? teamChartColor(key).abbr
    );
  }
  const abbrs = teamKeys
    .map((key) => teamChartColor(key).abbr)
    .filter((abbr) => abbr !== "-");
  if (abbrs.length <= 3) return abbrs.join(" · ");
  return `${abbrs.slice(0, 2).join(" · ")} +${abbrs.length - 2}`;
}

export function teamSeasonIsMulti(teamKeys: string[]): boolean {
  return teamKeys.length > 1;
}
