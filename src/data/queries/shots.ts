import { getDataProvider } from "@/data/providers";
import type { Shot, ShotFilters } from "@/data/types";

export async function getShots(filters: ShotFilters = {}): Promise<Shot[]> {
  return getDataProvider().getShots(filters);
}
