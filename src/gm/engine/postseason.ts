import type { GmBoxScore, GmLeagueState, GmPlayoffGame, GmPlayoffSeries } from "@/gm/types";

/** New saves store ids. Older records can still find their retained official box. */
export function postseasonBox(
  league: GmLeagueState,
  game: GmPlayoffGame,
  kind: "play_in" | "playoffs",
  used = new Set<string>(),
): GmBoxScore | undefined {
  const box = league.boxScores.find(box => !used.has(box.id) && (
    game.boxScoreId ? box.id === game.boxScoreId : game.gameId ? box.gameId === game.gameId :
      box.season === league.season && box.postseason === kind &&
      box.homeTeamId === game.homeTeamId && box.awayTeamId === game.awayTeamId &&
      box.homeScore === game.homeScore && box.awayScore === game.awayScore
  ));
  if (box) used.add(box.id);
  return box;
}

export function seriesGameBoxes(league: GmLeagueState, series: GmPlayoffSeries) {
  const used = new Set<string>();
  // Old records lack ids. Resolve repeated identical scores in calendar order.
  const ordered = { ...league, boxScores: [...league.boxScores].sort((a, b) => a.day - b.day) };
  return (series.games ?? []).map(game => postseasonBox(ordered, game, "playoffs", used));
}
