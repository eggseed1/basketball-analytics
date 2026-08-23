/**
 * P17.3 - temporal player-team identity contexts.
 *
 * PLAYER identity ≠ PLAYER-SEASON team ≠ CURRENT real-world team.
 * Branding must follow the explicit context, never playerId alone.
 */

import type { PlayerSeason } from "@/data/types";
import { resolveCanonicalTeam } from "@/data/identity/team-map";
import {
  canonicalSeasonFromStartYear,
  startYearFromCanonicalSeason,
} from "@/data/providers/historical/season-range";
import { resolveTeamBrand } from "@/lib/nba-brand";

export type PlayerTeamContextKind =
  | "CURRENT"
  | "SELECTED_SEASON"
  | "STINT"
  | "MULTI_TEAM_AGGREGATE";

/** MULTI_TEAM_AGGREGATE_BRAND = NEUTRAL */
export const MULTI_TEAM_AGGREGATE_BRAND = "NEUTRAL" as const;

const MULTI_TEAM_ABBR = new Set(["TOT", "2TM", "3TM", "4TM"]);

export function isMultiTeamSeasonRow(
  row: Pick<PlayerSeason, "teamId" | "teamAbbreviation"> | null | undefined
): boolean {
  if (!row) return false;
  const abbr = (row.teamAbbreviation ?? "").toUpperCase();
  return row.teamId === "TOT" || MULTI_TEAM_ABBR.has(abbr);
}

export function multiTeamDisplayLabel(
  row: Pick<PlayerSeason, "teamAbbreviation"> | null | undefined
): "TOT" | "Multiple" {
  const abbr = (row?.teamAbbreviation ?? "TOT").toUpperCase();
  if (abbr === "2TM" || abbr === "3TM" || abbr === "4TM") return "Multiple";
  return "TOT";
}

/**
 * Canonical brandable team key for UI (logo / wash / link).
 * Multi-team aggregates and raw NBA numeric leaks → undefined (neutral).
 */
export function brandableTeamKey(
  teamId: string | null | undefined
): string | undefined {
  const raw = teamId?.trim() ?? "";
  if (!raw || raw === "TOT") return undefined;
  const resolved = resolveCanonicalTeam(raw);
  if (resolved.status === "resolved") return resolved.team.canonicalTeamId;
  // Unresolved long numerics must never paint UI (raw NBA TEAM_ID leak).
  if (/^\d{6,}$/.test(raw)) return undefined;
  if (resolveTeamBrand(raw)) return raw;
  return undefined;
}

export function brandableTeamKeyFromRow(
  row: Pick<PlayerSeason, "teamId" | "teamAbbreviation"> | null | undefined
): string | undefined {
  if (!row || isMultiTeamSeasonRow(row)) return undefined;
  return brandableTeamKey(row.teamId);
}

/** Prefer TOT/aggregate row when present; else max gamesPlayed franchise stint. */
export function primaryTeamForSeason(
  career: PlayerSeason[],
  season: string
): PlayerSeason | null {
  const rows = career.filter((row) => row.season === season);
  if (!rows.length) return null;
  const aggregate = rows.find((row) => isMultiTeamSeasonRow(row));
  if (aggregate) return aggregate;
  return rows.reduce((best, row) =>
    row.gamesPlayed > best.gamesPlayed ? row : best
  );
}

/** Distinct franchise (non-TOT) teams for a season. */
export function seasonFranchiseStints(
  career: PlayerSeason[],
  season: string
): PlayerSeason[] {
  return career.filter(
    (row) => row.season === season && !isMultiTeamSeasonRow(row)
  );
}

/** One franchise stop on a player-season identity card. */
export type PlayerCardStint = {
  teamKey: string;
  teamLabel: string;
  position?: string | null;
};

/**
 * Franchise stops for a season, in source order.
 * NBA Stats lists TOT then clubs chronologically - the last item is the
 * last team the player was on that year.
 */
export function cardStintsForSeason(
  career: PlayerSeason[],
  season: string
): PlayerCardStint[] {
  const seen = new Set<string>();
  const out: PlayerCardStint[] = [];
  for (const row of seasonFranchiseStints(career, season)) {
    const key = brandableTeamKeyFromRow(row);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      teamKey: key,
      teamLabel:
        resolveTeamBrand(key)?.abbr ??
        row.teamAbbreviation ??
        row.teamName,
      position: row.position ?? null,
    });
  }
  return out;
}

export function lastCardStint(
  stints: PlayerCardStint[]
): PlayerCardStint | undefined {
  return stints.at(-1);
}

/**
 * Distinct franchise stops across a career, in first-appearance order
 * (earliest season first). Skips TOT / multi-team aggregate rows.
 */
export function cardStintsForCareer(
  career: PlayerSeason[]
): PlayerCardStint[] {
  const chronological = [...career].sort((a, b) =>
    a.season.localeCompare(b.season)
  );
  const seen = new Set<string>();
  const out: PlayerCardStint[] = [];
  for (const row of chronological) {
    if (isMultiTeamSeasonRow(row)) continue;
    const key = brandableTeamKeyFromRow(row);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      teamKey: key,
      teamLabel:
        resolveTeamBrand(key)?.abbr ??
        row.teamAbbreviation ??
        row.teamName,
      position: null,
    });
  }
  return out;
}

/** Map a precomputed team-id history list into card stints (deduped, order kept). */
export function cardStintsFromTeamKeys(
  teamKeys: readonly string[] | null | undefined
): PlayerCardStint[] {
  if (!teamKeys?.length) return [];
  const seen = new Set<string>();
  const out: PlayerCardStint[] = [];
  for (const raw of teamKeys) {
    const key = brandableTeamKey(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      teamKey: key,
      teamLabel: resolveTeamBrand(key)?.abbr ?? key,
      position: null,
    });
  }
  return out;
}

/** Append any teams from `extra` that are not already in `primary`. */
export function mergeCardStints(
  primary: PlayerCardStint[],
  extra: PlayerCardStint[]
): PlayerCardStint[] {
  if (!extra.length) return primary;
  const seen = new Set(primary.map((s) => s.teamKey));
  const out = [...primary];
  for (const stint of extra) {
    if (!stint.teamKey || seen.has(stint.teamKey)) continue;
    seen.add(stint.teamKey);
    out.push(stint);
  }
  return out;
}

/**
 * Retired / inactive for identity UI: no games in the current season and
 * last recorded season is before the current product season.
 */
export function isRetiredPlayerCareer(input: {
  lastSeason?: string | null;
  isActive?: boolean | null;
  nowSeason: string;
  hasCurrentSeasonGames?: boolean;
  /** Roster row for current season (0 GP) still counts as active. */
  hasCurrentSeasonRoster?: boolean;
}): boolean {
  if (input.hasCurrentSeasonGames || input.hasCurrentSeasonRoster) return false;
  if (input.isActive === true) return false;
  if (input.isActive === false) return true;
  if (!input.lastSeason) return false;
  if (input.lastSeason >= input.nowSeason) return false;
  try {
    const nowStart = startYearFromCanonicalSeason(input.nowSeason);
    const priorSeason = canonicalSeasonFromStartYear(nowStart - 1);
    if (input.lastSeason === priorSeason) return false;
  } catch {
    // fall through
  }
  return input.lastSeason < input.nowSeason;
}

export function seasonHasMultipleFranchises(
  career: PlayerSeason[],
  season: string
): boolean {
  const ids = new Set(
    seasonFranchiseStints(career, season)
      .map((r) => brandableTeamKey(r.teamId))
      .filter(Boolean)
  );
  return ids.size > 1;
}

export type ResolvedSeasonTeamContext = {
  kind: PlayerTeamContextKind;
  season: string;
  row: PlayerSeason | null;
  /** Brand / logo / wash key - undefined when NEUTRAL. */
  brandTeamKey: string | undefined;
  /** Display label (abbr, TOT, Multiple, or team name). */
  displayLabel: string | null;
  /** Single-team destination link team id. */
  teamLinkId: string | undefined;
};

export function resolveSelectedSeasonTeamContext(
  career: PlayerSeason[],
  season: string
): ResolvedSeasonTeamContext {
  const row = primaryTeamForSeason(career, season);
  if (!row) {
    return {
      kind: "SELECTED_SEASON",
      season,
      row: null,
      brandTeamKey: undefined,
      displayLabel: null,
      teamLinkId: undefined,
    };
  }
  if (isMultiTeamSeasonRow(row) || seasonHasMultipleFranchises(career, season)) {
    return {
      kind: "MULTI_TEAM_AGGREGATE",
      season,
      row,
      brandTeamKey: undefined,
      displayLabel: multiTeamDisplayLabel(row),
      teamLinkId: undefined,
    };
  }
  const key = brandableTeamKeyFromRow(row);
  return {
    kind: "SELECTED_SEASON",
    season,
    row,
    brandTeamKey: key,
    displayLabel:
      resolveTeamBrand(key)?.abbr ??
      row.teamAbbreviation ??
      row.teamName ??
      null,
    teamLinkId: key,
  };
}

/**
 * Pick one board row for a player in a season board that may contain stints.
 * Prefer max GP among matching ids. If multiple franchises, prefer a TOT-like
 * row when present; otherwise still return max-GP stint (caller brands via context).
 */
export function pickPlayerSeasonBoardRow(
  rows: PlayerSeason[],
  playerId: string
): PlayerSeason | null {
  const matches = rows.filter((row) => row.playerId === playerId);
  if (!matches.length) return null;
  const aggregate = matches.find((row) => isMultiTeamSeasonRow(row));
  if (aggregate) return aggregate;
  return matches.reduce((best, row) =>
    row.gamesPlayed > best.gamesPlayed ? row : best
  );
}

/**
 * Enrich career totals with rich board stats without overwriting team identity.
 */
export function enrichCareerRowKeepTeam(
  careerRow: PlayerSeason,
  rich: PlayerSeason | null
): PlayerSeason {
  if (!rich) return careerRow;
  return {
    ...rich,
    // Temporal identity: career row team wins for this season/stint.
    teamId: careerRow.teamId,
    teamName: careerRow.teamName,
    teamAbbreviation: careerRow.teamAbbreviation,
    teamIdProvider: careerRow.teamIdProvider ?? rich.teamIdProvider,
    providerTeamId: careerRow.providerTeamId ?? rich.providerTeamId,
    nbaTeamId: careerRow.nbaTeamId ?? rich.nbaTeamId,
    playerName: rich.playerName.startsWith("Player ")
      ? careerRow.playerName
      : rich.playerName || careerRow.playerName,
    season: careerRow.season,
    playerId: careerRow.playerId || rich.playerId,
    gamesPlayed: careerRow.gamesPlayed || rich.gamesPlayed,
    gamesStarted: careerRow.gamesStarted || rich.gamesStarted,
    minutes: careerRow.minutes || rich.minutes,
  };
}

/** Current-team precedence for profile/search (not historical season brand). */
export type CurrentTeamSource =
  | "CURRENT_SEASON_PLAYER_ROW"
  | "PROVIDER_PROFILE"
  | "LATEST_CAREER_ROW"
  | "UNRESOLVED";

export function resolveCurrentTeamId(input: {
  currentSeasonRowTeamId?: string | null;
  providerCurrentTeamId?: string | null;
  latestCareerTeamId?: string | null;
}): { teamId: string | undefined; source: CurrentTeamSource } {
  const fromSeason = brandableTeamKey(input.currentSeasonRowTeamId);
  if (fromSeason) {
    return { teamId: fromSeason, source: "CURRENT_SEASON_PLAYER_ROW" };
  }
  const fromProvider = brandableTeamKey(input.providerCurrentTeamId);
  if (fromProvider) {
    return { teamId: fromProvider, source: "PROVIDER_PROFILE" };
  }
  const fromCareer = brandableTeamKey(input.latestCareerTeamId);
  if (fromCareer) {
    return { teamId: fromCareer, source: "LATEST_CAREER_ROW" };
  }
  return { teamId: undefined, source: "UNRESOLVED" };
}
