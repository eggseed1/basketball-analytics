/**
 * Game / matchup visual theme - derived only from canonical TEAM_BRANDS.
 * Away = gradient start (left); home = gradient end (right).
 * UI chrome only - not analytics.
 */

import type { CSSProperties } from "react";

import { resolveTeamBrand, type TeamBrand } from "@/lib/nba-brand";

/** Neutral wash when a side cannot resolve a usable brand color. */
export const MATCHUP_THEME_NEUTRAL = "#8e8e93";

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function isValidCssHex(color: string | null | undefined): boolean {
  if (!color) return false;
  return HEX_RE.test(color.trim());
}

/**
 * Prefer primary; if primary is black/white (poor wash) or invalid, try secondary;
 * then neutral. Never invent hues.
 */
export function brandWashColor(brand: TeamBrand | undefined): string {
  if (!brand) return MATCHUP_THEME_NEUTRAL;
  const primary = brand.primary?.trim() ?? "";
  const secondary = brand.secondary?.trim() ?? "";
  if (isValidCssHex(primary) && !isNearNeutralInk(primary)) {
    return primary;
  }
  if (isValidCssHex(secondary) && !isNearNeutralInk(secondary)) {
    return secondary;
  }
  if (isValidCssHex(primary)) return primary;
  if (isValidCssHex(secondary)) return secondary;
  return MATCHUP_THEME_NEUTRAL;
}

function isNearNeutralInk(hex: string): boolean {
  const h = hex.trim().toLowerCase();
  return (
    h === "#000" ||
    h === "#000000" ||
    h === "#fff" ||
    h === "#ffffff" ||
    h === "#c4ced4" // Spurs / similar silver - weak wash alone
  );
}

/**
 * Page-atmosphere pair from a franchise palette.
 * Drops black / white / silver so the gradient reads as the team color.
 */
export function brandAtmosphereColors(
  primary?: string | null,
  secondary?: string | null
): { colorA: string; colorB: string } | null {
  const p = primary?.trim() ?? "";
  const s = secondary?.trim() ?? "";
  const colorful = [p, s].filter(
    (c) => isValidCssHex(c) && !isNearNeutralInk(c)
  );
  if (colorful.length >= 2) {
    return { colorA: colorful[0]!, colorB: colorful[1]! };
  }
  if (colorful.length === 1) {
    return { colorA: colorful[0]!, colorB: colorful[0]! };
  }
  if (isValidCssHex(p)) return { colorA: p, colorB: p };
  if (isValidCssHex(s)) return { colorA: s, colorB: s };
  return null;
}

export type GameMatchupTheme = {
  awayBrand: TeamBrand | undefined;
  homeBrand: TeamBrand | undefined;
  awayPrimary: string;
  homePrimary: string;
  awaySecondary: string;
  homeSecondary: string;
  /** Color used on the away (left) side of the wash. */
  awayWash: string;
  /** Color used on the home (right) side of the wash. */
  homeWash: string;
  awayResolved: boolean;
  homeResolved: boolean;
  /** Both sides resolved to a non-neutral brand wash. */
  fullyResolved: boolean;
  cssVars: CSSProperties;
};

/**
 * Deterministic matchup theme.
 * Ordering is always away → home (never alphabetical).
 */
export function buildGameMatchupTheme(
  awayTeamKey?: string | null,
  homeTeamKey?: string | null
): GameMatchupTheme {
  const awayBrand = resolveTeamBrand(awayTeamKey);
  const homeBrand = resolveTeamBrand(homeTeamKey);
  const awayWash = brandWashColor(awayBrand);
  const homeWash = brandWashColor(homeBrand);
  const awayPrimary = isValidCssHex(awayBrand?.primary)
    ? awayBrand!.primary
    : MATCHUP_THEME_NEUTRAL;
  const homePrimary = isValidCssHex(homeBrand?.primary)
    ? homeBrand!.primary
    : MATCHUP_THEME_NEUTRAL;
  const awaySecondary = isValidCssHex(awayBrand?.secondary)
    ? awayBrand!.secondary
    : awayPrimary;
  const homeSecondary = isValidCssHex(homeBrand?.secondary)
    ? homeBrand!.secondary
    : homePrimary;

  return {
    awayBrand,
    homeBrand,
    awayPrimary,
    homePrimary,
    awaySecondary,
    homeSecondary,
    awayWash,
    homeWash,
    awayResolved: Boolean(awayBrand),
    homeResolved: Boolean(homeBrand),
    fullyResolved: Boolean(awayBrand && homeBrand),
    cssVars: {
      "--away-color": awayWash,
      "--home-color": homeWash,
    } as CSSProperties,
  };
}

/** Stable string fingerprint for tests (ordering-sensitive). */
export function matchupThemeFingerprint(theme: GameMatchupTheme): string {
  return `${theme.awayWash}|${theme.homeWash}`;
}
