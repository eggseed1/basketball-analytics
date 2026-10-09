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
  | "onoff"
  | "games"
  | "splits"
  | "playoffs"
  | "organization"
  | "sentiment"
  | "payroll"
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
  { id: "offense", label: "Offense & Defense" },
  { id: "onoff", label: "On/Off" },
  { id: "games", label: "Games" },
  { id: "splits", label: "Splits" },
  { id: "playoffs", label: "Playoffs" },
  { id: "organization", label: "Organization" },
  { id: "sentiment", label: "Sentiment" },
  { id: "payroll", label: "Salary & Assets" },
  { id: "stats", label: "All Stats" },
];

/** The franchise history page that replaced the History tab. */
export function teamFranchiseHistoryHref(teamId: string, season?: string | null): string {
  const base = `/teams/${encodeURIComponent(teamId)}/history`;
  return season ? `${base}?season=${encodeURIComponent(season)}` : base;
}

export type TeamSalaryView = "summary" | "contracts" | "picks";

export const TEAM_SALARY_VIEWS: Array<{ id: TeamSalaryView; label: string }> = [
  { id: "summary", label: "Summary" },
  { id: "contracts", label: "Contracts" },
  { id: "picks", label: "Draft picks" },
];

export function parseTeamSalaryView(raw?: string | null): TeamSalaryView {
  return TEAM_SALARY_VIEWS.find((v) => v.id === raw)?.id ?? "summary";
}

/** Salary & Assets subtab; replaced the standalone payroll and draft-assets pages. */
export function teamSalaryHref(teamId: string, view: TeamSalaryView = "summary", season?: string | null): string {
  const q = new URLSearchParams();
  if (season) q.set("season", season);
  q.set("tab", "payroll");
  if (view !== "summary") q.set("view", view);
  return `/teams/${encodeURIComponent(teamId)}?${q.toString()}`;
}

export function parseTeamPageTab(raw?: string | null): TeamPageTab {
  if (raw === "rotation" || raw === "lineups") return "players";
  if (raw === "defense") return "offense";
  if (raw === "schedule") return "games";
  if (raw === "on-off") return "onoff";
  if (raw === "contracts" || raw === "cap" || raw === "salary" || raw === "assets") return "payroll";
  if (raw === "movement" || raw === "media") return "sentiment";
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
