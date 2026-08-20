/**
 * Era-aware team brand / logo resolution for Time Machine and historical surfaces.
 *
 * Pipeline:
 *   season → team-era identity → verified historical logo
 *          → historical text mark + era palette
 *          → current logo (only when historically appropriate)
 *          → neutral text mark
 */

import {
  getCanonicalTeamById,
  resolveCanonicalTeam,
  type CanonicalTeam,
} from "@/data/identity/team-map";
import { resolveTeamEra, type TeamEra } from "@/data/identity/team-era";
import {
  resolveHistoricalTeamPalette,
  type HistoricalTeamBrandPalette,
} from "@/lib/historical-team-palette";
import { teamLogoUrl } from "@/lib/nba-brand";

export type HistoricalLogoSource =
  | "historical_verified"
  | "historical_text"
  | "current"
  | "text_fallback";

export type HistoricalTeamBrand = {
  displayName: string;
  abbreviation: string;
  /** Absolute path or CDN URL when an image may be shown; null for text marks. */
  logoUrl: string | null;
  source: HistoricalLogoSource;
  /** Era palette for monograms; null when unverified / current image path. */
  palette: HistoricalTeamBrandPalette | null;
  /** True when the resolved identity differs from today's franchise label. */
  isHistorical: boolean;
  canonicalTeamId: string;
  city: string;
  nickname: string;
};

/**
 * Verified historical logo assets (owned/licensed only).
 * Key: `${canonicalId}:${abbr}` or bare `abbr` for unambiguous historical marks.
 * Path: site-root URL under /logos/historical/
 *
 * Intentionally empty until real assets are committed - do not scrape.
 */
export const HISTORICAL_TEAM_LOGO_ASSETS: Readonly<
  Record<string, { path: string; label: string }>
> = {
  // Example when assets exist:
  // "25:SEA": { path: "/logos/historical/sea-1970s.svg", label: "Seattle SuperSonics (era mark)" },
};

/** Kept for call-site clarity; logo safety rules are identical for both. */
export type HistoricalBrandPresentation = "era" | "modern_surface";

function lookupVerifiedHistoricalLogo(
  canonicalId: string,
  abbr: string
): string | null {
  const keyExact = `${canonicalId}:${abbr.toUpperCase()}`;
  const byExact = HISTORICAL_TEAM_LOGO_ASSETS[keyExact];
  if (byExact) return byExact.path;
  const byAbbr = HISTORICAL_TEAM_LOGO_ASSETS[abbr.toUpperCase()];
  if (byAbbr) return byAbbr.path;
  return null;
}

/**
 * Eras that must NOT reuse today's CDN logo even when abbr collides
 * (e.g. CHA Bobcats vs CHA Hornets).
 */
function blocksCurrentLogo(era: TeamEra): boolean {
  if (era.nickname === "Bobcats") return true;
  if (era.nickname === "Bullets") return true;
  if (era.nickname === "SuperSonics") return true;
  if (era.city === "New Jersey" && era.nickname === "Nets") return true;
  if (era.city === "San Diego" && era.nickname === "Clippers") return true;
  if (era.city === "San Diego" && era.nickname === "Rockets") return true;
  if (era.city === "Kansas City" && era.nickname === "Kings") return true;
  if (era.city === "Cincinnati" && era.nickname === "Royals") return true;
  if (era.city === "Buffalo" && era.nickname === "Braves") return true;
  if (era.city === "New Orleans" && era.nickname === "Jazz") return true;
  if (era.city === "Vancouver" && era.nickname === "Grizzlies") return true;
  if (era.city === "Charlotte" && era.abbr === "CHH") return true;
  return false;
}

/** Today's franchise mark is safe only when the era identity matches current branding. */
function mayUseCurrentLogo(
  era: TeamEra | null,
  team: CanonicalTeam | null
): boolean {
  if (!team) return false;
  if (!era) return true;
  if (blocksCurrentLogo(era)) return false;
  return (
    era.abbr.toUpperCase() === team.abbr.toUpperCase() &&
    era.displayName === team.displayName
  );
}

function currentFranchiseLogoUrl(team: CanonicalTeam): string | null {
  return teamLogoUrl(team.abbr) ?? teamLogoUrl(team.canonicalTeamId) ?? null;
}

function baseFields(
  displayName: string,
  abbreviation: string,
  canonicalId: string,
  city: string,
  nickname: string,
  isHistorical: boolean
) {
  return {
    displayName,
    abbreviation,
    isHistorical,
    canonicalTeamId: canonicalId,
    city,
    nickname,
  };
}

/**
 * Resolve display brand for a franchise in a season.
 *
 * Order:
 * 1. verified historical logo
 * 2. historical text mark + historical colors
 * 3. current logo only when historically appropriate
 * 4. neutral text fallback
 */
export function resolveHistoricalTeamBrand(
  teamId: string | number | null | undefined,
  season: string | null | undefined,
  _presentation: HistoricalBrandPresentation = "era"
): HistoricalTeamBrand | null {
  const raw = String(teamId ?? "").trim();
  if (!raw) return null;

  const resolved = resolveCanonicalTeam(raw);
  const team =
    resolved.status === "resolved"
      ? resolved.team
      : getCanonicalTeamById(raw) ?? null;
  const canonicalId = team?.canonicalTeamId ?? raw;
  const era =
    season && season.trim()
      ? resolveTeamEra(canonicalId, season.trim())
      : null;

  const displayName = era?.displayName ?? team?.displayName ?? raw;
  const abbreviation = era?.abbr ?? team?.abbr ?? raw.toUpperCase();
  const city = era?.city ?? "";
  const nickname = era?.nickname ?? "";
  const isHistorical = Boolean(
    era &&
      team &&
      (era.displayName !== team.displayName ||
        era.abbr.toUpperCase() !== team.abbr.toUpperCase() ||
        blocksCurrentLogo(era))
  );

  const fields = baseFields(
    displayName,
    abbreviation,
    canonicalId,
    city,
    nickname,
    isHistorical
  );

  const verified = era
    ? lookupVerifiedHistoricalLogo(canonicalId, era.abbr)
    : null;

  const palette =
    era != null
      ? resolveHistoricalTeamPalette({
          canonicalTeamId: canonicalId,
          abbr: era.abbr,
          nickname: era.nickname,
        })
      : null;

  if (verified) {
    return {
      ...fields,
      logoUrl: verified,
      source: "historical_verified",
      palette,
    };
  }

  // Historical text + colors before any current-logo substitution.
  if (isHistorical && palette) {
    return {
      ...fields,
      logoUrl: null,
      source: "historical_text",
      palette,
    };
  }

  if (mayUseCurrentLogo(era, team) && team) {
    const url = currentFranchiseLogoUrl(team);
    if (url) {
      return {
        ...fields,
        logoUrl: url,
        source: "current",
        palette: null,
      };
    }
  }

  // Historical identity without a verified palette - neutral mark (never modern CDN).
  if (isHistorical) {
    return {
      ...fields,
      logoUrl: null,
      source: "text_fallback",
      palette: null,
    };
  }

  return {
    ...fields,
    logoUrl: null,
    source: "text_fallback",
    palette: null,
  };
}

/** Brand for one side of a game - never the opposing franchise's modern mark. */
export function resolveGameSideBrand(
  canonicalTeamId: string,
  season: string | null | undefined,
  presentation: HistoricalBrandPresentation = "era"
): HistoricalTeamBrand | null {
  return resolveHistoricalTeamBrand(canonicalTeamId, season, presentation);
}

export type { HistoricalTeamBrandPalette };
