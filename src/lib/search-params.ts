import type { BasketballFilters, Position } from "@/data/types";
import { parseMinimumNumber } from "@/data/queries";

const POSITIONS: Position[] = ["PG", "SG", "SF", "PF", "C"];

function first(
  value: string | string[] | undefined
): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

/**
 * Maps Next.js searchParams into the shared BasketballFilters type.
 * Used by server pages so chart + table share one filtered query result.
 */
export function filtersFromSearchParams(
  params: Record<string, string | string[] | undefined>
): BasketballFilters {
  const season = first(params.season);
  const team = first(params.team);
  const player = first(params.player);
  const positionRaw = first(params.position);
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

  return {
    season,
    team: team && team !== "ALL" ? team : undefined,
    player: player || undefined,
    position,
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
