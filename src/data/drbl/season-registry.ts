/**
 * Website bridge to the canonical DRBL season registry.
 * Single source - do not hardcode DRBL season lists in UI components.
 */
export {
  SEASON_REGISTRY,
  getSeasonEntry,
  listDrblSeasons,
  listCanonicalR1Seasons,
  isDrblSeason,
  type SeasonRegistryEntry,
  type HistoricalSupportTier,
  type ModelProductStatus,
  DRBL_V1_ABILITY_VERSION,
  DRBL_V1_R1_POINTS_VERSION,
  DRBL_V1_R1_WINEQ_VERSION,
  HISTORICAL_NORMALIZATION_VERSION,
  HISTORICAL_SUPPORT_CONTRACT_VERSION,
} from "../../../drbl/historical/season-registry";
