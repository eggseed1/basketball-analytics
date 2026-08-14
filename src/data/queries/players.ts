import { getDataProvider } from "@/data/providers";
import type {
  BasketballFilters,
  Player,
  PlayerGame,
  PlayerSeason,
} from "@/data/types";
import { applyPlayerSeasonFilters } from "./filter-utils";
import {
  getDarkoRatings,
  getHistoricalPlayerSeasons,
  getLebronRatings,
} from "./historical";
import { normalizePlayerName } from "@/lib/player-name";
import {
  listCanonicalSeasons,
  startYearFromCanonicalSeason,
} from "@/data/providers/historical/season-range";
import {
  fetchEspnAthleteBio,
  mergePlayerBio,
} from "@/data/providers/nba/athlete-bio";

export async function getPlayers(): Promise<Player[]> {
  return getDataProvider().getPlayers();
}

export async function getPlayer(playerId: string): Promise<Player | null> {
  const [base, bio] = await Promise.all([
    getDataProvider().getPlayer(playerId).catch(() => null),
    fetchEspnAthleteBio(playerId),
  ]);
  return mergePlayerBio(base, bio);
}

export async function getPlayerSeason(
  playerId: string,
  season: string
): Promise<PlayerSeason | null> {
  return getDataProvider().getPlayerSeason(playerId, season);
}

export async function getPlayerCareerSeasons(
  playerId: string
): Promise<PlayerSeason[]> {
  const seasons = await getDataProvider().getPlayerCareerSeasons(playerId);
  if (seasons.length === 0) return seasons;

  try {
    const darko = await getDarkoRatings().catch(() => []);
    const lebronSeasons = [...new Set(seasons.map((s) => s.season))];
    const lebronRows = (
      await Promise.all(
        lebronSeasons.map((season) =>
          getLebronRatings(season).catch(() => [])
        )
      )
    ).flat();

    const darkoByName = new Map(
      darko.map((row) => [normalizePlayerName(row.playerName), row])
    );
    const lebronByKey = new Map(
      lebronRows.map((row) => [
        `${normalizePlayerName(row.playerName)}:${row.season}`,
        row,
      ])
    );

    return seasons.map((row) => {
      const d = darkoByName.get(normalizePlayerName(row.playerName));
      // Live DARKO is a current-season snapshot — never stamp it onto other years.
      const darkoApplies = d != null && d.season === row.season;
      const l = lebronByKey.get(
        `${normalizePlayerName(row.playerName)}:${row.season}`
      );
      return {
        ...row,
        darkoDpm: darkoApplies ? d.impact : undefined,
        darkoOff: darkoApplies ? d.offensive : undefined,
        darkoDef: darkoApplies ? d.defensive : undefined,
        lebron: l?.impact,
        oLebron: l?.offensive,
        dLebron: l?.defensive,
        winsAdded: l?.winsAdded,
      };
    });
  } catch {
    return seasons;
  }
}

export async function getPlayerGameLog(
  playerId: string,
  season: string
): Promise<PlayerGame[]> {
  return getDataProvider().getPlayerGameLog(playerId, season);
}

/**
 * Returns player-season rows for a season, with optional filters applied
 * once in the query layer.
 */
export async function getPlayersBySeason(
  season: string,
  filters: Omit<BasketballFilters, "season"> = {}
): Promise<PlayerSeason[]> {
  const seasons = await getDataProvider().getPlayerSeasons(season);
  return applyPlayerSeasonFilters(seasons, { ...filters, season });
}

export async function getTeamPlayers(
  teamId: string,
  season: string,
  filters: Omit<BasketballFilters, "team" | "season"> = {}
): Promise<PlayerSeason[]> {
  const seasons = await getDataProvider().getPlayerSeasons(season);
  return applyPlayerSeasonFilters(seasons, {
    ...filters,
    season,
    team: teamId,
  });
}

/**
 * General-purpose filtered player-season query used by explore views.
 * Modern seasons prefer ESPN (+ impact overlays) and skip BDL entirely.
 */
export async function getFilteredPlayerSeasons(
  filters: BasketballFilters = {}
): Promise<PlayerSeason[]> {
  let seasons: PlayerSeason[] = [];
  const start = filters.season
    ? (() => {
        try {
          return startYearFromCanonicalSeason(filters.season);
        } catch {
          return null;
        }
      })()
    : null;

  // Modern: ESPN is enough and much faster than historical enrichment path.
  if (start != null && start >= 2000 && filters.season) {
    try {
      seasons = await getDataProvider().getPlayerSeasons(filters.season);
      // Attach DARKO quickly (name join); LEBRON is optional / non-blocking.
      const darko = await getDarkoRatings().catch(() => []);
      if (darko.length) {
        const darkoByName = new Map(
          darko.map((row) => [normalizePlayerName(row.playerName), row])
        );
        const boardSeason = filters.season;
        seasons = seasons.map((row) => {
          const d = darkoByName.get(normalizePlayerName(row.playerName));
          // Only overlay live DARKO onto the season the snapshot actually represents.
          if (!d || d.season !== boardSeason) return row;
          return {
            ...row,
            darkoDpm: d.impact,
            darkoOff: d.offensive,
            darkoDef: d.defensive,
          };
        });
      }
    } catch {
      seasons = [];
    }
  }

  if (seasons.length === 0 && filters.season) {
    try {
      seasons = await getHistoricalPlayerSeasons(filters.season);
    } catch {
      seasons = [];
    }
  }
  if (seasons.length === 0) {
    seasons = await getDataProvider().getPlayerSeasons(filters.season);
  }
  return applyPlayerSeasonFilters(seasons, filters);
}

export async function getAvailableSeasons(): Promise<string[]> {
  // Full NBA archive window for filters (1960 → current).
  return [...listCanonicalSeasons()].reverse();
}
