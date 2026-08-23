import type { PlayerAccoladeBadge } from "@/data/queries/player-awards";

export const HOF_OUTLINE_CLASS = "hof-outline";
export const HOF_PAGE_FRAME_CLASS = "hof-page-frame";

export function isHallOfFamePlayer(
  badges: Pick<PlayerAccoladeBadge, "award">[]
): boolean {
  return badges.some((badge) => badge.award.id === "hof");
}
