import type { BasketballFilters, Position } from "@/data/types";
import { parseMinimumNumber } from "@/data/queries/filter-utils";
import { parseDraftClassParam } from "@/lib/draft-class";
import { normalizeTeamParam } from "@/lib/team-identity";

const POSITIONS: Position[] = ["PG", "SG", "SF", "PF", "C"];

function first(
  value: string | string[] | undefined
): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

/** Explore season dropdown "All seasons" — cross-season player search scope. */
export function isAllSeasonsParam(
  value: string | string[] | null | undefined
): boolean {
  const raw = Array.isArray(value) ? value[0] : value;
  return String(raw ?? "").trim().toUpperCase() === "ALL";
}

export function parseConferenceParam(
  value: string | string[] | undefined
): "East" | "West" | undefined {
  const raw = first(value)?.trim();
  if (!raw) return undefined;
  if (raw === "East" || raw.toLowerCase() === "east") return "East";
  if (raw === "West" || raw.toLowerCase() === "west") return "West";
  return undefined;
}

/**
 * Maps Next.js searchParams into the shared BasketballFilters type.
 * Used by server pages so chart + table share one filtered query result.
 *
 * `?team=` accepts canonical ESPN id, abbreviation, brand slug, or
 * namespaced `espn:` / `bdl:` keys. Normalized to canonical id + abbr.
 */
export function filtersFromSearchParams(
  params: Record<string, string | string[] | undefined>
): BasketballFilters {
  const season = first(params.season);
  const teamRaw = first(params.team);
  const player = first(params.player);
  const positionRaw = first(params.position);
  const conference = parseConferenceParam(params.conference);
  const draftClass = parseDraftClassParam(params.draftClass);
  const minimumMinutes = parseMinimumNumber(params.minimumMinutes);
  const minimumGames = parseMinimumNumber(params.minimumGames);
  const start = first(params.startDate);
  const end = first(params.endDate);

  const position =
    positionRaw && POSITIONS.includes(positionRaw as Position)
      ? (positionRaw as Position)
      : positionRaw === "ALL"
        ? "ALL"
        : undefined;

  const normalized =
    teamRaw && teamRaw !== "ALL" ? normalizeTeamParam(teamRaw) : null;

  return {
    season,
    // Canonical ESPN id when resolvable; otherwise preserve raw for diagnostics.
    team: normalized?.canonicalTeamId ?? (teamRaw && teamRaw !== "ALL" ? teamRaw : undefined),
    teamAbbr: normalized?.abbr,
    player: player || undefined,
    position,
    conference,
    draftClass,
    minimumMinutes,
    minimumGames,
    dateRange:
      start || end
        ? {
            start: start ?? "1900-01-01",
            end: end ?? "2100-12-31",
          }
        : undefined,
  };
}
