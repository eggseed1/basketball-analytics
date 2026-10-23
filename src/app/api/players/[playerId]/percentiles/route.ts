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
    const includeComps =
      url.searchParams.get("comps") === "1" ||
      url.searchParams.get("comps") === "true";
    const career = await getPlayerCareerSeasonsCached(playerId);
    if (career.length === 0) {
      // Empty career is usually a cold ASSETS / budget miss, not a missing
      // player — 503 so the client retries instead of "Couldn't load".
      return jsonError(new Error("Career board still loading"), 503);
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
    const { metrics, teamKey, profileComps, profileHistoricalComps } =
      await loadPlayerPercentileMetrics(
      playerId,
      season,
      career,
      identityTeamKey,
      {
        mode,
        includeComps,
        nbaId: identity?.nbaId ?? null,
        espnId: identity?.espnId ?? null,
      }
    );
    return jsonOk({
      playerId,
      season,
      teamKey,
      metrics,
      profileComps,
      profileHistoricalComps,
      mode,
    });
  } catch (error) {
    return jsonError(error);
  }
}
