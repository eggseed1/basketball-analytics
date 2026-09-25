/**
 * Website bridge to the canonical DRBL season registry.
 * Single source — do not hardcode DRBL season lists in UI components.
 *
 * Nightly bake can publish the live season via `drbl-published-seasons.json`
 * without committing a registry edit (CI has contents:read only).
 */
import published from "@/data/runtime/drbl-published-seasons.json";
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

type PublishedFile = {
  minGames?: number;
  seasons?: Record<string, { gamesProcessed?: number }>;
};

const publishedFile = published as PublishedFile;
const minGames = Number(publishedFile.minGames) || 50;

function runtimePublishedSeasons(): string[] {
  const out: string[] = [];
  for (const [season, meta] of Object.entries(publishedFile.seasons ?? {})) {
    const games = Number(meta?.gamesProcessed) || 0;
    if (games >= minGames) out.push(season);
  }
  return out;
}

export function listDrblSeasons(): string[] {
  return [
    ...new Set([...listRegistryDrblSeasons(), ...runtimePublishedSeasons()]),
  ].sort();
}

export function listCanonicalR1Seasons(): string[] {
  // Runtime-published seasons use the same R1 / WAR1 fields in the overlay.
  return [
    ...new Set([
      ...listRegistryCanonicalR1Seasons(),
      ...runtimePublishedSeasons(),
    ]),
  ].sort();
}

export function isDrblSeason(season: string): boolean {
  if (isRegistryDrblSeason(season)) return true;
  return runtimePublishedSeasons().includes(season);
}
