import type { Game } from "./game";
import type { PlayerGame } from "./player-game";

/**
 * Full box score for one game: header + every player line.
 */
export interface GameBoxScore {
  game: Game;
  players: PlayerGame[];
}
