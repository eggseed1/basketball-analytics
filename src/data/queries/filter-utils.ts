import type {
  BasketballFilters,
  Game,
  GameSummary,
  PlayerSeason,
} from "@/data/types";

/**
 * Single source of truth for PlayerSeason filtering.
 * Chart and table both consume query results — never re-filter in UI.
 */
export function applyPlayerSeasonFilters(
  seasons: PlayerSeason[],
  filters: BasketballFilters = {}
): PlayerSeason[] {
  return seasons.filter((row) => {
    if (filters.season && row.season !== filters.season) return false;

    if (filters.team && row.teamId !== filters.team) return false;

    if (filters.player) {
      const needle = filters.player.toLowerCase();
      const matchesId = row.playerId.toLowerCase() === needle;
      const matchesName = row.playerName.toLowerCase().includes(needle);
      if (!matchesId && !matchesName) return false;
    }

    if (
      filters.position &&
      filters.position !== "ALL" &&
      row.position !== filters.position
    ) {
      return false;
    }

    if (
      filters.minimumMinutes !== undefined &&
      row.minutes < filters.minimumMinutes
    ) {
      return false;
    }

    if (
      filters.minimumGames !== undefined &&
      row.gamesPlayed < filters.minimumGames
    ) {
      return false;
    }

    return true;
  });
}

export function toGameSummary(game: Game): GameSummary {
  const margin = game.homeScore - game.awayScore;
  return {
    ...game,
    totalPoints: game.homeScore + game.awayScore,
    margin,
    absMargin: Math.abs(margin),
  };
}

/**
 * Single filter path for game explore views (chart + table share results).
 */
export function applyGameFilters(
  games: Game[],
  filters: BasketballFilters = {}
): GameSummary[] {
  return games
    .filter((game) => {
      if (filters.season && game.season !== filters.season) return false;
      if (
        filters.team &&
        game.homeTeamId !== filters.team &&
        game.awayTeamId !== filters.team
      ) {
        return false;
      }
      if (filters.dateRange) {
        if (
          game.gameDate < filters.dateRange.start ||
          game.gameDate > filters.dateRange.end
        ) {
          return false;
        }
      }
      // Explore charts focus on completed games with scores.
      if (game.status && game.status !== "final") return false;
      if (game.homeScore === 0 && game.awayScore === 0) return false;
      return true;
    })
    .map(toGameSummary);
}

export function parseMinimumNumber(
  value: string | string[] | undefined
): number | undefined {
  if (value === undefined) return undefined;
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || raw.trim() === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}
