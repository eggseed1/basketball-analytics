/**
 * Team Arc assembly — multi-year performance history.
 * Transition deltas reuse analyzeTeamProfile noise floors (not a second methodology).
 */

import { analyzeTeamProfile } from "@/analytics";
import type { TeamSeasonStats } from "@/data/types";
import { formatNumber, formatPct } from "@/lib/format";
import {
  TEAM_ARC_DEFAULT_WINDOW,
  TEAM_ARC_EARLIEST_SEASON,
  teamArcDefaultWindow,
} from "@/data/queries/team-arc";

export { TEAM_ARC_DEFAULT_WINDOW, TEAM_ARC_EARLIEST_SEASON, teamArcDefaultWindow };

export type TeamArcSeasonRow = {
  season: string;
  /** Point differential — primary cross-season signal. */
  avgDiff: number;
  avgDiffDisplay: string;
  trueShootingPct: number | null;
  tsDisplay: string;
  effectiveFieldGoalPct: number | null;
  efgDisplay: string;
  /** Offense proxy: team PPG when finite. */
  ppg: number | null;
  ppgDisplay: string;
  /** Defense proxy: opponent PPG when finite. */
  oppPpg: number | null;
  oppPpgDisplay: string;
  gamesPlayed: number;
  thin: boolean;
};

export type TeamArcTransition = {
  fromSeason: string;
  toSeason: string;
  changes: Array<{
    id: string;
    label: string;
    deltaDisplay: string;
    direction: "up" | "down" | "flat";
  }>;
  summary: string;
};

export type TeamArcModel = {
  label: "Team Arc";
  coverageNote: string;
  earliestAvailable: string | null;
  latestAvailable: string | null;
  windowSize: number;
  showingFull: boolean;
  hasMoreHistory: boolean;
  rows: TeamArcSeasonRow[];
  /** All rows when full; same as rows when not. */
  allRows: TeamArcSeasonRow[];
  transitions: TeamArcTransition[];
  continuityNote: string;
};

function finiteOrNull(n: number): number | null {
  return Number.isFinite(n) ? n : null;
}

export function toTeamArcSeasonRow(row: TeamSeasonStats): TeamArcSeasonRow {
  const ts = finiteOrNull(row.trueShootingPct);
  const efg = finiteOrNull(row.effectiveFieldGoalPct);
  const ppg = finiteOrNull(row.ppg);
  const opp = finiteOrNull(row.oppPpg);
  const thin = row.gamesPlayed > 0 && row.gamesPlayed < 20;
  return {
    season: row.season,
    avgDiff: row.avgDiff,
    avgDiffDisplay: `${row.avgDiff >= 0 ? "+" : ""}${formatNumber(row.avgDiff, 1)}`,
    trueShootingPct: ts,
    tsDisplay: ts != null && ts > 0 ? formatPct(ts) : "—",
    effectiveFieldGoalPct: efg,
    efgDisplay: efg != null && efg > 0 ? formatPct(efg) : "—",
    ppg,
    ppgDisplay: ppg != null && ppg > 0 ? formatNumber(ppg, 1) : "—",
    oppPpg: opp,
    oppPpgDisplay: opp != null && opp > 0 ? formatNumber(opp, 1) : "—",
    gamesPlayed: row.gamesPlayed,
    thin,
  };
}

/**
 * Consecutive-season transitions via analyzeTeamProfile.vsPrior
 * (same noise floors as Identity "What's changing?").
 */
export function buildTeamArcTransitions(
  chronoNewestFirst: TeamSeasonStats[],
  limit = 4
): TeamArcTransition[] {
  const chrono = [...chronoNewestFirst].sort((a, b) =>
    a.season.localeCompare(b.season)
  );
  const out: TeamArcTransition[] = [];
  for (let i = 1; i < chrono.length; i++) {
    const prior = chrono[i - 1]!;
    const team = chrono[i]!;
    const analysis = analyzeTeamProfile({
      team,
      league: [team],
      prior,
    });
    const changes = analysis.vsPrior?.changes ?? [];
    if (!changes.length) continue;
    out.push({
      fromSeason: prior.season,
      toSeason: team.season,
      changes,
      summary:
        analysis.vsPrior?.finding?.body ??
        `${prior.season} → ${team.season}: ${changes
          .map((c) => `${c.label} ${c.deltaDisplay}`)
          .join(" · ")}`,
    });
  }
  // Prefer largest absolute first change as ranking proxy — already sorted by analyzeTeamProfile abs within pair.
  // Surface the most recent meaningful transitions first.
  return out.reverse().slice(0, limit);
}

export function buildTeamArcModel(options: {
  rows: TeamSeasonStats[];
  viewingSeason: string;
  showingFull: boolean;
  windowSize?: number;
  earliestSeason?: string;
  /** How many seasons exist in the documented arc range (for “show full”). */
  fullCandidateCount?: number;
  missingSeasons?: string[];
  failedSeasons?: string[];
}): TeamArcModel {
  const windowSize = options.windowSize ?? TEAM_ARC_DEFAULT_WINDOW;
  const earliest = options.earliestSeason ?? TEAM_ARC_EARLIEST_SEASON;
  const allSorted = [...options.rows].sort((a, b) =>
    b.season.localeCompare(a.season)
  );
  const allRows = allSorted.map(toTeamArcSeasonRow);
  const windowSeasons = new Set(
    teamArcDefaultWindow(options.viewingSeason, windowSize, earliest)
  );
  const windowRows = options.showingFull
    ? allRows
    : allRows.filter((r) => windowSeasons.has(r.season));
  const rows = windowRows;
  const earliestAvailable = allRows.length
    ? allRows[allRows.length - 1]!.season
    : null;
  const latestAvailable = allRows[0]?.season ?? null;
  const fullCandidateCount =
    options.fullCandidateCount ??
    teamArcDefaultWindow(options.viewingSeason, 999, earliest).length;
  const hasMoreHistory =
    !options.showingFull && fullCandidateCount > windowSize;

  const coverageBits = [
    earliestAvailable && latestAvailable
      ? `Team-season board rows available ${earliestAvailable} → ${latestAvailable} for this ESPN team id.`
      : `No team-season board rows in the requested window.`,
    `Cross-season metrics limited to stable ESPN counting/efficiency fields (point differential, TS%, eFG%, PPG, opp PPG).`,
    `Arc coverage starts ${earliest} (documented team-board reliability floor) — earlier seasons are not implied as zeros.`,
  ];
  if (options.missingSeasons?.length) {
    coverageBits.push(
      `Absent from board in ${options.missingSeasons.slice(0, 4).join(", ")}${
        options.missingSeasons.length > 4 ? "…" : ""
      }.`
    );
  }
  if (options.failedSeasons?.length) {
    coverageBits.push(
      `Provider failure for ${options.failedSeasons.slice(0, 3).join(", ")}${
        options.failedSeasons.length > 3 ? "…" : ""
      }.`
    );
  }

  return {
    label: "Team Arc",
    coverageNote: coverageBits.join(" "),
    earliestAvailable,
    latestAvailable,
    windowSize,
    showingFull: options.showingFull,
    hasMoreHistory,
    rows,
    allRows,
    transitions: buildTeamArcTransitions(allSorted, 4),
    continuityNote:
      "Continuity follows this team's ESPN id across seasons — not a merged multi-franchise genealogy.",
  };
}

export function teamArcSeasonHref(teamRouteKey: string, season: string): string {
  return `/teams/${encodeURIComponent(teamRouteKey)}?season=${encodeURIComponent(season)}`;
}

/** Team Profile Season Evidence anchor for a season (same page when viewing). */
export function teamArcEvidenceHref(
  teamRouteKey: string,
  season: string
): string {
  return `${teamArcSeasonHref(teamRouteKey, season)}#evidence`;
}

export function teamArcFullHref(
  teamRouteKey: string,
  season: string,
  showingFull: boolean
): string {
  const params = new URLSearchParams();
  params.set("season", season);
  if (showingFull) params.set("arc", "full");
  return `/teams/${encodeURIComponent(teamRouteKey)}?${params.toString()}`;
}

export function teamArcGamesHref(teamId: string, season: string): string {
  const params = new URLSearchParams();
  params.set("season", season);
  params.set("team", teamId);
  return `/explore/games?${params.toString()}`;
}
