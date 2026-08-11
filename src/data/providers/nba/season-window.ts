/**
 * Approximate calendar bounds for an NBA season string (YYYY-YY).
 * Used to filter schedule events that may span adjacent seasons.
 */
export function seasonDateBounds(season: string): {
  start: string;
  end: string;
} {
  const match = /^(\d{4})-(\d{2})$/.exec(season.trim());
  if (!match) {
    throw new Error(`Invalid canonical season "${season}".`);
  }
  const startYear = Number(match[1]);
  const endYear = startYear + 1;
  return {
    start: `${startYear}-10-01`,
    end: `${endYear}-06-30`,
  };
}

export function isDateInSeason(gameDate: string, season: string): boolean {
  if (!gameDate) return false;
  const { start, end } = seasonDateBounds(season);
  return gameDate >= start && gameDate <= end;
}
