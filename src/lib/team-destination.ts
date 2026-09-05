/**
 * Team destination identity when season board is missing.
 * Never fabricates PPG/diff - identity only from canonical + era maps.
 */

import { ESPN_TEAM_META } from "@/data/providers/nba/team-meta";
import {
  resolveCanonicalTeam,
  type CanonicalTeam,
} from "@/data/identity/team-map";
import { resolveTeamEra } from "@/data/identity/team-era";
import {
  resolveHistoricalTeamBrand,
  type HistoricalBrandPresentation,
  type HistoricalTeamBrand,
} from "@/lib/historical-team-brand";

export type TeamIdentityFallback = {
  teamId: string;
  abbreviation: string;
  fullName: string;
  conference: "East" | "West";
  historicalBrand: HistoricalTeamBrand | null;
  canonical: CanonicalTeam;
};

/**
 * Resolve franchise identity without a season board row.
 * Used for historical Time Machine destinations when ESPN by-team fails.
 */
export function resolveTeamIdentityFallback(
  teamKey: string,
  season: string,
  presentation: HistoricalBrandPresentation = "era"
): TeamIdentityFallback | null {
  const resolved = resolveCanonicalTeam(teamKey);
  if (resolved.status !== "resolved") return null;
  const canonical = resolved.team;
  const era = resolveTeamEra(canonical.canonicalTeamId, season);
  const historicalBrand = resolveHistoricalTeamBrand(
    canonical.canonicalTeamId,
    season,
    presentation
  );
  const meta = ESPN_TEAM_META[canonical.canonicalTeamId];
  return {
    teamId: canonical.canonicalTeamId,
    abbreviation:
      historicalBrand?.abbreviation ??
      era?.abbr ??
      canonical.abbr,
    fullName:
      historicalBrand?.displayName ??
      era?.displayName ??
      canonical.displayName,
    conference: meta?.conference ?? "West",
    historicalBrand,
    canonical,
  };
}

export type TeamPageTab =
  | "overview"
  | "players"
  | "offense"
  | "defense"
  | "lineups"
  | "games"
  | "splits"
  | "playoffs"
  | "history"
  | "organization"
  | "stats";

export type TeamSeasonKind =
  | "regular"
  | "playoffs"
  | "cup"
  | "playin"
  | "preseason";

export type TeamRateMode =
  | "totals"
  | "perGame"
  | "per36"
  | "per75"
  | "per100";

export const TEAM_PAGE_TABS: Array<{ id: TeamPageTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "players", label: "Players" },
  { id: "offense", label: "Offense" },
  { id: "defense", label: "Defense" },
  { id: "lineups", label: "Rotation" },
  { id: "games", label: "Games" },
  { id: "splits", label: "Splits" },
  { id: "playoffs", label: "Playoffs" },
  { id: "history", label: "History" },
  { id: "organization", label: "Organization" },
  { id: "stats", label: "All Stats" },
];

export function parseTeamPageTab(raw?: string | null): TeamPageTab {
  if (raw === "rotation") return "lineups";
  const hit = TEAM_PAGE_TABS.find((t) => t.id === raw);
  return hit?.id ?? "overview";
}

export function parseTeamSeasonKind(raw?: string | null): TeamSeasonKind {
  if (
    raw === "playoffs" ||
    raw === "cup" ||
    raw === "playin" ||
    raw === "preseason"
  ) {
    return raw;
  }
  return "regular";
}

export function parseTeamRateMode(raw?: string | null): TeamRateMode {
  if (
    raw === "totals" ||
    raw === "per36" ||
    raw === "per75" ||
    raw === "per100"
  ) {
    return raw;
  }
  return "perGame";
}

/** Season type / rate filters only where they change the tab's ledger. */
export function teamContextBarVisibility(tab: TeamPageTab): {
  seasonType: boolean;
  rate: boolean;
} {
  switch (tab) {
    case "overview":
    case "players":
    case "offense":
    case "defense":
    case "lineups":
    case "splits":
    case "stats":
      return { seasonType: true, rate: true };
    case "games":
      return { seasonType: true, rate: false };
    case "playoffs":
      return { seasonType: false, rate: true };
    case "history":
    case "organization":
    default:
      return { seasonType: false, rate: false };
  }
}

export type TeamPageHrefOpts = {
  season: string;
  tab?: TeamPageTab;
  seasonType?: TeamSeasonKind;
  rate?: TeamRateMode;
  fromHistory?: boolean;
  themeMode?: "historical" | "modern";
};

export function teamPageHref(teamId: string, opts: TeamPageHrefOpts): string {
  const q = new URLSearchParams();
  q.set("season", opts.season);
  if (opts.tab && opts.tab !== "overview") q.set("tab", opts.tab);
  if (opts.seasonType && opts.seasonType !== "regular") {
    q.set("seasonType", opts.seasonType);
  }
  if (opts.rate && opts.rate !== "perGame") q.set("rate", opts.rate);
  if (opts.fromHistory) {
    q.set("from", "history");
    q.set("theme", opts.themeMode === "modern" ? "modern" : "historical");
  }
  return `/teams/${encodeURIComponent(teamId)}?${q.toString()}`;
}
