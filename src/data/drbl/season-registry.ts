/**
 * Website bridge to the canonical DRBL season registry.
 * Single source — do not hardcode DRBL season lists in UI components.
 *
 * Nightly bake can publish the live season via `drbl-published-seasons.json`
 * without committing a registry edit (CI has contents:read only).
 */
import published from "@/data/runtime/drbl-published-seasons.json";
import {
  isSeasonInPublishedFile,
  mergeDrblSeasonLists,
  seasonsFromPublishedFile,
  type DrblPublishedSeasonsFile,
} from "@/data/drbl/published-seasons";
import {
  SEASON_REGISTRY,
  getSeasonEntry,
  listDrblSeasons as listRegistryDrblSeasons,
  listCanonicalR1Seasons as listRegistryCanonicalR1Seasons,
  isDrblSeason as isRegistryDrblSeason,
  type SeasonRegistryEntry,
  type HistoricalSupportTier,
  type ModelProductStatus,
  DRBL_V1_ABILITY_VERSION,
  DRBL_V1_R1_POINTS_VERSION,
  DRBL_V1_R1_WINEQ_VERSION,
  HISTORICAL_NORMALIZATION_VERSION,
  HISTORICAL_SUPPORT_CONTRACT_VERSION,
} from "../../../drbl/historical/season-registry";

export {
  SEASON_REGISTRY,
  getSeasonEntry,
  type SeasonRegistryEntry,
  type HistoricalSupportTier,
  type ModelProductStatus,
  DRBL_V1_ABILITY_VERSION,
  DRBL_V1_R1_POINTS_VERSION,
  DRBL_V1_R1_WINEQ_VERSION,
  HISTORICAL_NORMALIZATION_VERSION,
  HISTORICAL_SUPPORT_CONTRACT_VERSION,
};

const publishedFile = published as DrblPublishedSeasonsFile;

function runtimePublishedSeasons(): string[] {
  return seasonsFromPublishedFile(publishedFile);
}

export function listDrblSeasons(): string[] {
  return mergeDrblSeasonLists(
    listRegistryDrblSeasons(),
    runtimePublishedSeasons()
  );
}

export function listCanonicalR1Seasons(): string[] {
  // Runtime-published seasons use the same R1 / WAR1 fields in the overlay.
  return mergeDrblSeasonLists(
    listRegistryCanonicalR1Seasons(),
    runtimePublishedSeasons()
  );
}

export function isDrblSeason(season: string): boolean {
  if (isRegistryDrblSeason(season)) return true;
  return isSeasonInPublishedFile(publishedFile, season);
}
