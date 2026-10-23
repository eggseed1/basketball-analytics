import { jsonError, jsonOk } from "@/app/api/_lib/http";
import { getGamePossessions } from "@/data/queries/game-possessions";
import { getGameShellCached } from "@/data/queries/request-cache";
import { buildPossessionExplorerModel } from "@/lib/possession-explorer";

/**
 * Possession Explorer view model for client-on-open loading.
 * Keeps the heavy reconstruction off the game page HTML stream.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ gameId: string }> }
) {
  try {
    const { gameId } = await context.params;
    const [shell, possessionResult] = await Promise.all([
      getGameShellCached(gameId),
      getGamePossessions(gameId).catch(() => null),
    ]);
    const game = shell?.game;
    const teamInput = {
      homeTeamId: game?.homeTeamId ?? null,
      awayTeamId: game?.awayTeamId ?? null,
      homeAbbreviation: game?.homeTeamAbbr ?? null,
      awayAbbreviation: game?.awayTeamAbbr ?? null,
      homeDisplayName: game?.homeTeamName ?? null,
      awayDisplayName: game?.awayTeamName ?? null,
    };

    const model = possessionResult
      ? buildPossessionExplorerModel(possessionResult, teamInput)
      : buildPossessionExplorerModel(
          {
            status: "unavailable",
            gameId,
            reason: "pbp_fetch_failed",
            message: "Play-by-play fetch failed for this game.",
            capability: {
              rawPbpAvailable: false,
              rawEventCount: 0,
              scoreTimelineAvailable: false,
              possessionsDerived: false,
              reconstructedPossessionsAvailable: false,
              officialPossessionTotalsAvailable: false,
              possessionCalibrationGrade: "not_comparable",
              lineupsDerived: false,
              source: null,
              provenance: null,
              status: "unavailable",
            },
          },
          teamInput
        );

    return jsonOk({ data: model, gameId });
  } catch (error) {
    return jsonError(error);
  }
}
