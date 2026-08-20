import { getDataProvider } from "@/data/providers";
import { resolveNbaIdForDrbl } from "@/data/identity/player-identity";
import type { Shot, ShotFilters } from "@/data/types";

export async function getShots(filters: ShotFilters = {}): Promise<Shot[]> {
  if (!filters.player) {
    return getDataProvider().getShots(filters);
  }
  const nbaId = await resolveNbaIdForDrbl(filters.player);
  const statsId =
    nbaId && nbaId !== filters.player ? nbaId : filters.player;
  const shots = await getDataProvider().getShots({
    ...filters,
    player: statsId,
  });
  if (shots.length > 0 || statsId === filters.player) return shots;
  return getDataProvider().getShots(filters);
}
