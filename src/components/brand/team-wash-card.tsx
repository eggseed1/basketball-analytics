"use client";

import type { CSSProperties, ReactNode } from "react";

import { GlassSurface } from "@/components/brand/glass-surface";
import {
  MATCHUP_THEME_NEUTRAL,
  brandWashColor,
  buildGameMatchupTheme,
} from "@/lib/game-matchup-theme";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { cn } from "@/lib/utils";

/**
 * Team-tinted liquid-glass card.
 * For game matchups prefer {@link MatchupWashCard}.
 * No teamKey → neutral frost (multi-team aggregate / unresolved).
 */
export function TeamWashCard({
  teamKey,
  secondaryTeamKey,
  className,
  children,
  as: Tag = "section",
}: {
  teamKey?: string | null;
  /** Optional second brand (e.g. career first team → current). */
  secondaryTeamKey?: string | null;
  className?: string;
  children: ReactNode;
  as?: "section" | "div" | "aside" | "header";
}) {
  const primary = resolveTeamBrand(teamKey);
  const secondary = resolveTeamBrand(secondaryTeamKey);
  const left = brandWashColor(primary);
  const right = secondary
    ? brandWashColor(secondary)
    : primary && isValidSecondary(primary.secondary)
      ? primary.secondary
      : brandWashColor(primary);

  return (
    <GlassSurface
      as={Tag}
      accentColor={primary || secondary ? left : MATCHUP_THEME_NEUTRAL}
      accentColorB={primary || secondary ? right : "#aeaeb2"}
      className={cn(className)}
    >
      {children}
    </GlassSurface>
  );
}

function isValidSecondary(color?: string): boolean {
  if (!color) return false;
  const h = color.trim().toLowerCase();
  if (h === "#fff" || h === "#ffffff") return false;
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(h);
}

/**
 * Matchup wash: away (left) → home (right), from canonical team brands.
 */
export function MatchupWashCard({
  awayTeamKey,
  homeTeamKey,
  intensity = "hero",
  className,
  children,
  as: Tag = "section",
}: {
  awayTeamKey?: string | null;
  homeTeamKey?: string | null;
  /** Hero = stronger atmosphere; subtle = quieter section accents. */
  intensity?: "hero" | "subtle";
  className?: string;
  children: ReactNode;
  as?: "section" | "div" | "aside" | "header";
}) {
  const theme = buildGameMatchupTheme(awayTeamKey, homeTeamKey);

  return (
    <GlassSurface
      as={Tag}
      accentColor={theme.awayWash}
      accentColorB={theme.homeWash}
      className={className}
      data-matchup-away={theme.awayBrand?.abbr ?? "-"}
      data-matchup-home={theme.homeBrand?.abbr ?? "-"}
      data-matchup-intensity={intensity}
    >
      {children}
    </GlassSurface>
  );
}

/** Neutral vars when no brands - avoids Apple blue/purple CSS defaults. */
export const NEUTRAL_WASH_STYLE = {
  "--away-color": MATCHUP_THEME_NEUTRAL,
  "--home-color": "#aeaeb2",
} as CSSProperties;
