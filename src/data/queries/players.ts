import { getDataProvider } from "@/data/providers";
import { listDrblSeasons } from "@/data/drbl/season-registry";
import { availableCanonicalSeasons } from "@/data/providers/nba/season";
import {
  fetchBrefAdvancedSeason,
  brefLookupKey,
  normalizePlayerName,
} from "@/data/providers/nba/bref-scraper";
import {
  brefStaleMs,
  brefTtlMs,
  darkoStaleMs,
  darkoTtlMs,
} from "@/data/providers/nba/cache-policy";
import { fetchDarkoSeason } from "@/data/providers/nba/darko-scraper";
import { fetchDrblSeason } from "@/data/providers/nba/drbl-loader";
import type {
  BasketballFilters,
  Player,
  PlayerGame,
  PlayerSeason,
} from "@/data/types";
import { applyPlayerSeasonFilters } from "./filter-utils";

export async function getPlayers(season?: string): Promise<Player[]> {
  return getDataProvider().getPlayers(season);
}

export async function getPlayer(
  playerId: string,
  season?: string
): Promise<Player | null> {
  return getDataProvider().getPlayer(playerId, season);
}

export async function getPlayerSeason(
  playerId: string,
  season: string
): Promise<PlayerSeason | null> {
  return getDataProvider().getPlayerSeason(playerId, season);
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
 */
export async function getFilteredPlayerSeasons(
  filters: BasketballFilters = {}
): Promise<PlayerSeason[]> {
  const seasons = await getDataProvider().getPlayerSeasons(filters.season);
  return applyPlayerSeasonFilters(seasons, filters);
}

export async function getAvailableSeasons(): Promise<string[]> {
  // Box-score explore seasons (broad). DRBL availability is gated separately
  // by the canonical season registry — never invent DRBL for unsupported years.
  return availableCanonicalSeasons();
}

/** DRBL-published seasons only (single source: drbl/historical/season-registry). */
export async function getDrblAvailableSeasons(): Promise<string[]> {
  return listDrblSeasons();
}

/** All season rows for one player (across available seasons). */
export async function getPlayerCareerSeasons(
  playerId: string
): Promise<PlayerSeason[]> {
  const provider = getDataProvider();
  if (typeof provider.getPlayerCareerSeasons === "function") {
    return provider.getPlayerCareerSeasons(playerId);
  }
  const seasons = await provider.getPlayerSeasons();
  return seasons
    .filter((row) => row.playerId === playerId)
    .sort((a, b) => b.season.localeCompare(a.season));
}

/**
 * Career rows enriched with DARKO + BRef advanced so timeline charts can
 * show impact metrics (DPM, PER, VORP, BPM) across seasons — not just
 * counting stats from playercareerstats.
 */
export async function getPlayerCareerTimelineSeasons(
  playerId: string
): Promise<PlayerSeason[]> {
  const career = await getPlayerCareerSeasons(playerId);
  if (career.length === 0) return [];

  const uniqueSeasons = [...new Set(career.map((row) => row.season))];
  // Cap expensive scrapes — recent seasons matter most for the timeline.
  const overlaySeasons = [...uniqueSeasons]
    .sort((a, b) => b.localeCompare(a))
    .slice(0, 8);

  const overlays = await Promise.all(
    overlaySeasons.map(async (season) => {
      const [darkoRows, brefRows, drblRows] = await Promise.all([
        fetchDarkoSeason(season, {
          ttlMs: darkoTtlMs(season),
          staleMs: darkoStaleMs(season),
        }).catch(() => []),
        fetchBrefAdvancedSeason(season, {
          ttlMs: brefTtlMs(season),
          staleMs: brefStaleMs(season),
        }).catch(() => []),
        fetchDrblSeason(season).catch(() => []),
      ]);
      const darkoById = new Map(darkoRows.map((row) => [row.nbaId, row]));
      const brefByKey = new Map(
        brefRows.map((row) => [
          brefLookupKey(row.playerName, row.teamAbbr),
          row,
        ])
      );
      const brefByName = new Map(
        brefRows.map((row) => [normalizePlayerName(row.playerName), row])
      );
      const drblById = new Map(drblRows.map((row) => [row.playerId, row]));
      return { season, darkoById, brefByKey, brefByName, drblById };
    })
  );

  const bySeason = new Map(overlays.map((o) => [o.season, o]));

  return career
    .map((row) => {
      const overlay = bySeason.get(row.season);
      if (!overlay) return row;
      const darko = overlay.darkoById.get(playerId);
      const abbr = (row.teamAbbreviation ?? "").toUpperCase();
      const bref =
        overlay.brefByKey.get(brefLookupKey(row.playerName, abbr)) ??
        overlay.brefByName.get(normalizePlayerName(row.playerName));
      const drbl = overlay.drblById.get(playerId);

      return {
        ...row,
        dpm: darko?.dpm ?? row.dpm,
        oDpm: darko?.oDpm ?? row.oDpm,
        dDpm: darko?.dDpm ?? row.dDpm,
        boxDpm: darko?.boxDpm ?? row.boxDpm,
        onOffDpm: darko?.onOffDpm ?? row.onOffDpm,
        per: bref?.per ?? row.per,
        ows: bref?.ows ?? row.ows,
        dws: bref?.dws ?? row.dws,
        winShares: bref?.winShares ?? row.winShares,
        winSharesPer48: bref?.winSharesPer48 ?? row.winSharesPer48,
        obpm: bref?.obpm ?? row.obpm,
        dbpm: bref?.dbpm ?? row.dbpm,
        bpm: bref?.bpm ?? row.bpm,
        vorp: bref?.vorp ?? row.vorp,
        usagePct: row.usagePct || bref?.usagePct || 0,
        trueShootingPct: row.trueShootingPct || bref?.trueShootingPct || 0,
        drbl100: drbl?.drbl100 ?? row.drbl100,
        rawAbilityRate: drbl?.rawAbilityRate ?? row.rawAbilityRate,
        drblPossessions:
          drbl?.actualPossessions ??
          drbl?.possessions ??
          row.drblPossessions,
        abilityModelVersion:
          (drbl as { abilityModelVersion?: string } | undefined)
            ?.abilityModelVersion ?? row.abilityModelVersion,
        drblRank: drbl?.rank ?? row.drblRank,
        drblP: drbl?.drblP ?? row.drblP,
        drblLn: drbl?.drblLn ?? row.drblLn,
        drblB: drbl?.drblB ?? row.drblB,
        drblO: drbl?.drblO ?? row.drblO,
        drblD: drbl?.drblD ?? row.drblD,
        sdv100: drbl?.sdv100 ?? row.sdv100,
        shotMaking100: drbl?.shotMaking100 ?? row.shotMaking100,
        epvShootMean: drbl?.epvShootMean ?? row.epvShootMean,
        vContMean: drbl?.vContMean ?? row.vContMean,
        r1Points:
          drbl?.r1Points != null && Number.isFinite(drbl.r1Points)
            ? drbl.r1Points
            : (row.r1Points ?? null),
        r1WinEquivalents:
          drbl?.r1WinEquivalents != null &&
          Number.isFinite(drbl.r1WinEquivalents)
            ? drbl.r1WinEquivalents
            : (row.r1WinEquivalents ?? null),
        r1PointValueVersion:
          drbl?.r1PointValueVersion ?? row.r1PointValueVersion ?? null,
        r1WinEquivalentVersion:
          drbl?.r1WinEquivalentVersion ?? row.r1WinEquivalentVersion ?? null,
        drblWar: drbl?.drblWar ?? row.drblWar,
        drblSeasonalImpact: drbl?.seasonalImpact ?? row.drblSeasonalImpact,
        drblL: drbl?.drblL ?? row.drblL,
        drblMeanLeverage: drbl?.meanLeverage ?? row.drblMeanLeverage,
        drblDisagreement: drbl?.disagreement ?? row.drblDisagreement,
        drblUncertainty: drbl?.uncertainty ?? row.drblUncertainty,
        drblIntervalLo: drbl?.intervalLo ?? row.drblIntervalLo,
        drblIntervalHi: drbl?.intervalHi ?? row.drblIntervalHi,
      };
    })
    .sort((a, b) => a.season.localeCompare(b.season));
}
