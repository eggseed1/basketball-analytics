import { resolveTeamBrand } from "@/lib/nba-brand";
import {
  RETIRED_JERSEY_PALETTES,
  type RetiredJerseyPalette,
  type RetiredJerseyRecord,
} from "@/content/awards/retired-jerseys";

/** Resolve arena-accurate colors for a retired jersey banner. */
export function resolveRetiredJerseyPalette(
  teamKey: string
): RetiredJerseyPalette {
  const key = teamKey.trim().toLowerCase();
  const known = RETIRED_JERSEY_PALETTES[key];
  if (known) return known;

  const brand = resolveTeamBrand(key);
  if (!brand) {
    return { number: "#1d1d1f", field: "#FFFFFF", border: "#1d1d1f" };
  }
  const primary = brand.primary.toLowerCase();
  const lightPrimary =
    primary === "#ffffff" ||
    primary === "#fff" ||
    primary === "#c4ced4" ||
    primary === "#b8c4ca";
  if (lightPrimary) {
    return {
      number: brand.secondary,
      field: "#FFFFFF",
      border: brand.secondary,
    };
  }
  return {
    number: brand.primary,
    field: "#FFFFFF",
    border: brand.primary,
  };
}

export type RetiredJerseyBadge = RetiredJerseyRecord & {
  palette: RetiredJerseyPalette;
  teamAbbr: string;
  /** Prefer ESPN team id for /teams/[teamId] routes. */
  teamHrefId?: string;
};
