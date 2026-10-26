import { getRuntimeSnapshotGames } from "@/data/runtime/game-snapshot";
import { nbaTodayIso } from "@/lib/nba-calendar-date";
import { isCurrentNbaSeason } from "@/lib/nba-season-status";
import { regularGamesThrough } from "@/lib/standings-preseason-guard";

type ScheduledGame = {
  season: string;
  gameType?: string;
  gameDate: string;
  homeTeamId: string;
  awayTeamId: string;
};

/**
 * The current season's player board still has last year's counting stats when
 * the regular-season schedule has not reached those games.
 *
 * October 15 is only a soft handoff to league-dash. Opening night is later,
 * and that feed can keep returning the finished season until tip-off.
 */
export async function playerBoardAwaitingTip(
  season: string,
  rows: readonly { gamesPlayed: number }[],
  now = new Date(),
  games?: readonly ScheduledGame[]
): Promise<boolean> {
  if (season.trim().toUpperCase() === "ALL") return false;
  if (!isCurrentNbaSeason(season, now)) return false;
  const slate = games ?? (await getRuntimeSnapshotGames(season));
  const scheduled = await regularGamesThrough(slate, season, nbaTodayIso(now));
  if (!scheduled) return false;
  let maxScheduled = 0;
  for (const count of scheduled.values()) {
    if (count > maxScheduled) maxScheduled = count;
  }
  if (maxScheduled === 0) return true;
  const maxPlayed = rows.reduce(
    (max, row) => Math.max(max, row.gamesPlayed || 0),
    0
  );
  // A few games of snapshot lag should not blank a real early-season board.
  return maxPlayed > maxScheduled + 8;
}
