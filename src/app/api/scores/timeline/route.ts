import { jsonError, jsonOk } from "@/app/api/_lib/http";
import { withBudget } from "@/data/queries/budget";
import { getGamePlayByPlay } from "@/data/queries/games";
import { SCORE_DELAY_MAX_SECONDS } from "@/lib/score-delay";
import { recentPoints, scoreTimeline, type ScorePoint } from "@/lib/score-timeline";

const MAX_GAMES = 16;
const BUDGET_MS = 3_500;
/** The longest delay plus a margin for slow polls. */
const WINDOW_MS = (SCORE_DELAY_MAX_SECONDS + 120) * 1000;

/**
 * Score points from each game's play-by-play for the last few minutes, so a
 * viewer on a score delay sees the game as it stood that long ago right away.
 * Query: ids=id1,id2
 */
export async function GET(request: Request) {
  try {
    const ids = [
      ...new Set(
        (new URL(request.url).searchParams.get("ids") ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter((s) => /^[A-Za-z0-9_-]{1,40}$/.test(s))
      ),
    ].slice(0, MAX_GAMES);
    const since = Date.now() - WINDOW_MS;
    const entries = await Promise.all(
      ids.map(async (id): Promise<[string, ScorePoint[]]> => {
        const { value } = await withBudget(getGamePlayByPlay(id).catch(() => null), BUDGET_MS, null);
        return [id, value ? recentPoints(scoreTimeline(value.events), since) : []];
      })
    );
    return jsonOk({ data: Object.fromEntries(entries) });
  } catch (error) {
    return jsonError(error);
  }
}
