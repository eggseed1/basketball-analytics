import type {
  BasketballFilters,
  Game,
  GameSummary,
  PlayerSeason,
} from "@/data/types";
import { expandPlayerSeasonTeamMatchIds } from "@/lib/team-identity";
import {
  ensureGameTeamIdentity,
  inferGameTeamProvider,
} from "@/lib/game-team-identity";

/**
 * Single source of truth for PlayerSeason filtering.
 * Chart and table both consume query results - never re-filter in UI.
 *
 * `filters.team` is treated as a loose team identity (canonical ESPN id, abbr,
 * brand slug, or namespaced provider key) and expanded via player-season ids
 * only — never BDL schedule ids (BDL OKC 21 is ESPN PHX).
 */
export function applyPlayerSeasonFilters(
  seasons: PlayerSeason[],
  filters: BasketballFilters = {}
): PlayerSeason[] {
  const teamIds = filters.team
    ? new Set(expandPlayerSeasonTeamMatchIds(filters.team))
    : null;

  return seasons.filter((row) => {
    if (filters.season && row.season !== filters.season) return false;

    if (teamIds && !teamIds.has(row.teamId)) return false;

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
  const normalized = ensureGameTeamIdentity(
    game,
    game.teamIdProvider ?? inferGameTeamProvider(game)
  );
  const margin = normalized.homeScore - normalized.awayScore;
  return {
    ...normalized,
    totalPoints: normalized.homeScore + normalized.awayScore,
    margin,
    absMargin: Math.abs(margin),
  };
}

/**
 * Single filter path for game explore views (chart + table share results).
 *
 * Prefer abbreviation (set by URL normalization) so ESPN↔BDL numeric collisions
 * cannot mix franchises. Fall back to exact `filters.team` match for callers that
 * already pass a provider-scoped schedule id (e.g. Season Evidence → BDL id).
 */
export function applyGameFilters(
  games: Game[],
  filters: BasketballFilters = {}
): GameSummary[] {
  const teamAbbr = filters.teamAbbr?.trim().toUpperCase();

  return games
    .map((game) =>
      ensureGameTeamIdentity(
        game,
        game.teamIdProvider ?? inferGameTeamProvider(game)
      )
    )
    .filter((game) => {
      if (filters.season && game.season !== filters.season) return false;
      if (teamAbbr) {
        const home = (game.homeTeamAbbr ?? "").toUpperCase();
        const away = (game.awayTeamAbbr ?? "").toUpperCase();
        if (home !== teamAbbr && away !== teamAbbr) return false;
      } else if (filters.team) {
        const needle = String(filters.team);
        // Canonical team ids only for bare numerics. Matching providerTeamId
        // against ESPN ids collides (ESPN 25 OKC ≠ BDL 25 POR).
        // Namespaced keys (`bdl:25`) may match provider ids explicitly.
        if (needle.includes(":")) {
          const providerId = needle.slice(needle.indexOf(":") + 1);
          const homeMatch = game.homeProviderTeamId === providerId;
          const awayMatch = game.awayProviderTeamId === providerId;
          if (!homeMatch && !awayMatch) return false;
        } else {
          const homeMatch = game.homeTeamId === needle;
          const awayMatch = game.awayTeamId === needle;
          if (!homeMatch && !awayMatch) return false;
        }
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
