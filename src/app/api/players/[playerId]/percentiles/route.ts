import { jsonError, jsonOk } from "@/app/api/_lib/http";
import { getPlayerCareerSeasons } from "@/data/queries";
import { resolvePlayerSeason } from "@/lib/player-destination";
import { loadPlayerPercentileMetrics } from "@/lib/player-percentile-load";
import {
  cardStintsForSeason,
  lastCardStint,
} from "@/lib/player-team-context";

/** Percentile ranking payload for one player-season (client slider / cache). */
export async function GET(
  request: Request,
  context: { params: Promise<{ playerId: string }> }
) {
  try {
    const { playerId } = await context.params;
    const url = new URL(request.url);
    const seasonParam = url.searchParams.get("season");
    const career = await getPlayerCareerSeasons(playerId);
    if (career.length === 0) {
      return jsonError(new Error("Player not found"), 404);
    }
    const season = resolvePlayerSeason(career, seasonParam);
    const identityTeamKey = lastCardStint(
      cardStintsForSeason(career, season)
    )?.teamKey;
    const { metrics, teamKey } = await loadPlayerPercentileMetrics(
      playerId,
      season,
      career,
      identityTeamKey
    );
    return jsonOk({
      playerId,
      season,
      teamKey,
      metrics,
    });
  } catch (error) {
    return jsonError(error);
  }
}
