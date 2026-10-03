import type { Game } from "@/data/types";

/**
 * Regular-season games that count in the standings. Excludes Play-In,
 * playoffs, preseason, and the NBA Cup Championship.
 */
export function countsTowardStandings(
  game: Pick<Game, "gameType" | "cupChampionship">
): boolean {
  return game.gameType === "regular" && !game.cupChampionship;
}
