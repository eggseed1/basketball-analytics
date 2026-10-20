/**
 * Basketball-Reference stores ending calendar year in league URLs:
 * 2024-25 → NBA_2025_advanced.html
 */
export function brefSeasonYear(canonicalSeason: string): number {
  const match = /^(\d{4})-(\d{2})$/.exec(canonicalSeason.trim());
  if (!match) {
    throw new Error(`Invalid season "${canonicalSeason}"`);
  }
  return Number(match[1]) + 1;
}
