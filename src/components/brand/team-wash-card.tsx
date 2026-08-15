import type { CSSProperties, ReactNode } from "react";

import {
  MATCHUP_THEME_NEUTRAL,
  brandWashColor,
  buildGameMatchupTheme,
} from "@/lib/game-matchup-theme";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { cn } from "@/lib/utils";

/**
 * Soft dual-tone wash for a single team or career dual-brand.
 * For game matchups prefer {@link MatchupWashCard}.
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
  // Dual brand → second team's primary wash; single brand → that team's secondary wash.
  const right = secondary
    ? brandWashColor(secondary)
    : primary && isValidSecondary(primary.secondary)
      ? primary.secondary
      : brandWashColor(primary);

  return (
    <Tag
      className={cn(
        "sports-card score-card-wash overflow-hidden",
        className
      )}
      style={
        {
          "--away-color": left,
          "--home-color": right,
        } as CSSProperties
      }
    >
      {children}
    </Tag>
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
    <Tag
      className={cn(
        "sports-card matchup-wash overflow-hidden",
        intensity === "subtle" && "matchup-wash--subtle",
        className
      )}
      style={theme.cssVars}
      data-matchup-away={theme.awayBrand?.abbr ?? "—"}
      data-matchup-home={theme.homeBrand?.abbr ?? "—"}
    >
      {children}
    </Tag>
  );
}

/** Neutral vars when no brands — avoids Apple blue/purple CSS defaults. */
export const NEUTRAL_WASH_STYLE = {
  "--away-color": MATCHUP_THEME_NEUTRAL,
  "--home-color": "#aeaeb2",
} as CSSProperties;
