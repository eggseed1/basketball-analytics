import { getRuntimeSnapshotGames } from "@/data/runtime/game-snapshot";
import type { Game } from "@/data/types";
import { pregameHomeMargin, type WinProbGameResult } from "@/lib/game-win-probability";

function finals(season: string, types: ReadonlySet<Game["gameType"]>): WinProbGameResult[] {
  return getRuntimeSnapshotGames(season)
    .filter((g) => g.status === "final" && types.has(g.gameType) && g.homeScore !== g.awayScore)
    .map((g) => ({
      date: g.gameDate,
      homeTeamId: g.homeTeamId,
      awayTeamId: g.awayTeamId,
      homeScore: g.homeScore,
      awayScore: g.awayScore,
    }));
}

const SEASON_GAMES = new Set<Game["gameType"]>(["regular", "play-in", "playoff"]);
const PRIOR_GAMES = new Set<Game["gameType"]>(["regular"]);

/**
 * Expected home margin before tip-off from games played earlier that season and
 * last season's results. Seasons outside the snapshot fall back to home court alone.
 */
export function runtimePregameMargin(
  game: Pick<Game, "season" | "gameDate" | "homeTeamId" | "awayTeamId">
): number {
  const start = Number(game.season.slice(0, 4));
  const prior = Number.isFinite(start) ? `${start - 1}-${String(start).slice(2)}` : null;
  return pregameHomeMargin({
    homeTeamId: game.homeTeamId,
    awayTeamId: game.awayTeamId,
    date: game.gameDate,
    seasonGames: finals(game.season, SEASON_GAMES),
    priorSeasonGames: prior ? finals(prior, PRIOR_GAMES) : undefined,
  });
}
