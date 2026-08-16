import type { BasketballFilters, Position } from "@/data/types";
import { parseMinimumNumber } from "@/data/queries";
import { normalizeTeamParam } from "@/lib/team-identity";

type SearchParamValue = string | string[] | undefined;

export type ExploreSearchParams = {
  season?: SearchParamValue;
  team?: SearchParamValue;
  player?: SearchParamValue;
  position?: SearchParamValue;
  minimumMinutes?: SearchParamValue;
  minimumGames?: SearchParamValue;
};

function first(value: SearchParamValue): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

const POSITIONS = new Set<Position>(["PG", "SG", "SF", "PF", "C"]);

/**
 * Maps URL search params → BasketballFilters for the query layer.
 * Normalizes `?team=` through the canonical identity layer.
 */
export function filtersFromSearchParams(
  params: ExploreSearchParams,
  defaultSeason: string
): BasketballFilters {
  const season = first(params.season) || defaultSeason;
  const teamRaw = first(params.team);
  const player = first(params.player);
  const positionRaw = first(params.position);
  const position =
    positionRaw && POSITIONS.has(positionRaw as Position)
      ? (positionRaw as Position)
      : positionRaw === "ALL"
        ? "ALL"
        : undefined;

  const normalized =
    teamRaw && teamRaw !== "ALL" ? normalizeTeamParam(teamRaw) : null;

  return {
    season,
    team:
      normalized?.canonicalTeamId ??
      (teamRaw && teamRaw !== "ALL" ? teamRaw : undefined),
    teamAbbr: normalized?.abbr,
    player: player || undefined,
    position,
    minimumMinutes: parseMinimumNumber(params.minimumMinutes),
    minimumGames: parseMinimumNumber(params.minimumGames),
  };
}
