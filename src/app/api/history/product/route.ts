import { jsonError, jsonOk } from "@/app/api/_lib/http";
import {
  getHistoricalProductGame,
  getHistoricalGameSummaries,
  getHistorySeasonManifest,
  listHistoryProductSeasons,
  searchHistoricalProductGames,
} from "@/data/history/product";
import { getSeasonCapabilities } from "@/lib/history/capabilities";

/** Compact historical product API — never includes research GameRotation / experimental DRBL. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const season = url.searchParams.get("season");
  const gameId = url.searchParams.get("gameId");
  const teamId = url.searchParams.get("teamId") ?? undefined;
  const playerId = url.searchParams.get("playerId") ?? undefined;
  const date = url.searchParams.get("date") ?? undefined;
  const view = url.searchParams.get("view") ?? "summary";

  if (gameId) {
    const artifact = getHistoricalProductGame(gameId, season ?? undefined);
    if (!artifact) return jsonError("Historical product game not found", 404);
    // API firewall: strip anything research-related (none stored)
    const safe = {
      historyVersion: artifact.historyVersion,
      season: artifact.season,
        summary: artifact.summary,
      playerGames: view === "full" || view === "summary" ? artifact.playerGames : undefined,
      teamGames: view === "full" ? artifact.teamGames : undefined,
      scoreTimeline:
        view === "full" || view === "flow" ? artifact.scoreTimeline : undefined,
      gameFlow: view === "full" || view === "flow" ? artifact.gameFlow : undefined,
      events: view === "full" || view === "events" ? artifact.events : undefined,
      capabilities: getSeasonCapabilities(artifact.season),
      firewall: {
        researchGameRotation: false,
        experimentalDRBL: false,
        legacyWAR: false,
      },
    };
    return jsonOk(safe);
  }

  if (season) {
    if (teamId || playerId || date) {
      return jsonOk({
        season,
        games: searchHistoricalProductGames({ season, teamId, playerId, date }),
        capabilities: getSeasonCapabilities(season),
      });
    }
    return jsonOk({
      season,
      manifest: getHistorySeasonManifest(season),
      games: getHistoricalGameSummaries(season),
      capabilities: getSeasonCapabilities(season),
    });
  }

  return jsonOk({
    historyVersion: "drbl-history-v1",
    seasons: listHistoryProductSeasons(),
    note: "Pass season= or gameId=",
  });
}
