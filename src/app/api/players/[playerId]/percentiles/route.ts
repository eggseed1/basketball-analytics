import { jsonError, jsonOk } from "@/app/api/_lib/http";
import { getPlayerCareerSeasonsCached } from "@/data/queries/request-cache";
import { resolvePlayerSeason } from "@/lib/player-destination";
import {
  loadPlayerPercentileMetrics,
  type PercentileLoadMode,
} from "@/lib/player-percentile-load";
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
    const modeParam = url.searchParams.get("mode");
    const mode: PercentileLoadMode =
      modeParam === "fast" ? "fast" : "full";
    const career = await getPlayerCareerSeasonsCached(playerId);
    if (career.length === 0) {
      return jsonError(new Error("Player not found"), 404);
    }
    const season = resolvePlayerSeason(career, seasonParam);
    const identityTeamKey = lastCardStint(
      cardStintsForSeason(career, season)
    )?.teamKey;
    const { resolvePlayerIdentityCached } = await import(
      "@/data/identity/player-identity-cache"
    );
    const identity = await resolvePlayerIdentityCached(playerId).catch(
      () => null
    );
    const { metrics, teamKey } = await loadPlayerPercentileMetrics(
      playerId,
      season,
      career,
      identityTeamKey,
      {
        mode,
        nbaId: identity?.nbaId ?? null,
        espnId: identity?.espnId ?? null,
      }
    );
    return jsonOk({
      playerId,
      season,
      teamKey,
      metrics,
      mode,
    });
  } catch (error) {
    return jsonError(error);
  }
}
