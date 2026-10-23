/**
 * FiveThirtyEight RAPTOR coverage (open data) ends after 2021-22.
 * Explore / ASK treat later seasons as unavailable rather than blank columns.
 */

export const LATEST_RAPTOR_SEASON = "2021-22";
export const EARLIEST_RAPTOR_SEASON = "1976-77";

/** RAPTOR board columns (plus WAR from the same bake). */
export const RAPTOR_BOARD_COLUMNS = [
  "raptor",
  "oRaptor",
  "dRaptor",
  "winsAdded",
] as const;

/**
 * True when a single canonical season can have RAPTOR rows.
 * `ALL` / blank stay true so mixed boards still show columns when any season has data.
 */
export function isRaptorSeasonAvailable(canonicalSeason: string): boolean {
  const season = String(canonicalSeason ?? "").trim();
  if (!season || season.toUpperCase() === "ALL") return true;
  if (!/^\d{4}-\d{2}$/.test(season)) return false;
  return (
    season >= EARLIEST_RAPTOR_SEASON && season <= LATEST_RAPTOR_SEASON
  );
}
