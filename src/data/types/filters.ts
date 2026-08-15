import type { Position } from "./player";

/**
 * Shared filter bag for player/season/shot queries.
 * Filtering is applied once in the query layer so chart + table stay in sync.
 */
export interface BasketballFilters {
  season?: string;
  /**
   * Provider-scoped team id for the schedule source being filtered.
   * For historical/BDL rows this must be a BDL team id — never a bare ESPN id.
   * Prefer resolving via `@/data/identity/team-map` before setting this.
   */
  team?: string;
  /** Cross-provider-safe franchise filter when game rows include abbreviations. */
  teamAbbr?: string;
  player?: string;
  position?: Position | "ALL";
  minimumMinutes?: number;
  minimumGames?: number;
  dateRange?: {
    start: string;
    end: string;
  };
}

/**
 * Narrow filters used by shot queries (extends the shared bag).
 */
export interface ShotFilters extends BasketballFilters {
  made?: boolean;
  shotType?: "2PT" | "3PT";
  gameId?: string;
}
