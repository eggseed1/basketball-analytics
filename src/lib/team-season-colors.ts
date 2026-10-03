import type { CSSProperties } from "react";

import {
  distinctTeamColors,
  teamChartColor,
  type ChartSurface,
} from "@/lib/nba-brand";
import { normalizeTeamParam } from "@/lib/team-identity";

/** Team key → color for one chart. Build with `careerTeamPalette`. */
export type TeamPalette = Map<string, string>;

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

/**
 * Brand colors for every franchise in a career, assigned in the order the
 * player joined them so a later stint yields when its color matches an
 * earlier one (after a Raptors stint, the Pistons fall back to their blue).
 */
export function careerTeamPalette(
  seasons: string[],
  resolveKeys: (season: string) => string[],
  surface: ChartSurface = "light"
): TeamPalette {
  return distinctTeamColors(seasons.flatMap(resolveKeys), surface);
}

export function teamSeasonChartColors(
  teamKeys: string[],
  surface: ChartSurface = "light",
  palette?: TeamPalette
): string[] {
  const colors: string[] = [];
  const seen = new Set<string>();
  for (const key of teamKeys) {
    const color = palette?.get(key) ?? teamChartColor(key, { surface }).color;
    if (seen.has(color)) continue;
    seen.add(color);
    colors.push(color);
  }
  return colors;
}

/** Solid or multi-franchise split fill for season ticks, bars, and swatches. */
export function teamSeasonFillStyle(
  teamKeys: string[],
  surface: ChartSurface = "light",
  palette?: TeamPalette
): CSSProperties {
  const colors = teamSeasonChartColors(teamKeys, surface, palette);
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
 * Full career timeline track: a color stop at each season tick so adjacent
 * franchises blend across the gap between them. A traded-midseason tick
 * spreads its teams across the middle half of its slot.
 */
export function seasonTrackGradientStyle(
  seasons: string[],
  resolveKeys: (season: string) => string[],
  surface: ChartSurface = "light",
  palette?: TeamPalette
): CSSProperties {
  if (seasons.length === 0) return { backgroundColor: "#8e8e93" };
  if (seasons.length === 1) {
    return teamSeasonFillStyle(resolveKeys(seasons[0]!), surface, palette);
  }
  const last = seasons.length - 1;
  const slot = 100 / last;
  const stops: string[] = [];
  seasons.forEach((season, index) => {
    const center = index * slot;
    const colors = teamSeasonChartColors(resolveKeys(season), surface, palette);
    const list = colors.length ? colors : ["#8e8e93"];
    list.forEach((color, i) => {
      const offset =
        list.length === 1 ? 0 : (i / (list.length - 1) - 0.5) * slot * 0.5;
      const pos = Math.max(0, Math.min(100, center + offset));
      stops.push(`${color} ${pos.toFixed(2)}%`);
    });
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
