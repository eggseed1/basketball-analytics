import {
  PlayerSentimentGames,
  type SentimentGameTrack,
} from "@/components/players/player-sentiment-games";
import { getPlayerGameLogCached } from "@/data/queries/request-cache";
import { resolvePlayerSentimentHistory } from "@/data/runtime/sentiment-history-store";
import { buildSentimentGameRows, firstHistoryDate } from "@/sentiment/game-reaction";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/lib/nba-season-phase";

/** Seasons whose games could fall on or after the first tracked sentiment day. */
function seasonsSince(firstDate: string, now = new Date()): string[] {
  const out: string[] = [];
  for (let start = currentNbaStartYear(now); start >= 1996; start -= 1) {
    if (`${start + 1}-07-01` < firstDate) break;
    out.push(canonicalSeasonFromStartYear(start));
  }
  return out;
}

async function loadSentimentGameTrack(
  playerId: string,
  profileIds: string[]
): Promise<SentimentGameTrack> {
  const history = await resolvePlayerSentimentHistory([playerId, ...profileIds]);
  const firstDate = firstHistoryDate(history);
  if (!history || !firstDate) {
    return { rows: [], firstDate: null, lastGameDate: null };
  }
  const logs = await Promise.all(
    seasonsSince(firstDate).map((season) =>
      getPlayerGameLogCached(playerId, season).catch(() => [])
    )
  );
  const games = logs.flat().filter((g) => !g.didNotPlay && g.minutes > 0);
  const lastGameDate = games.reduce<string | null>(
    (latest, g) => (!latest || g.gameDate > latest ? g.gameDate : latest),
    null
  );
  return { rows: buildSentimentGameRows(games, history), firstDate, lastGameDate };
}

export async function PlayerSentimentGamesIsland({
  playerId,
  playerName,
  profileIds,
}: {
  playerId: string;
  playerName: string;
  profileIds: string[];
}) {
  const track = await loadSentimentGameTrack(playerId, profileIds).catch(() => null);
  return <PlayerSentimentGames playerName={playerName} track={track} />;
}
