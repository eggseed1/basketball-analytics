import { MatchupWashCard } from "@/components/brand/team-wash-card";
import { PossessionExplorer } from "@/components/games/possession-explorer";
import { getGamePossessions } from "@/data/queries/game-possessions";
import { getGameShellCached } from "@/data/queries/request-cache";
import { buildPossessionExplorerModel } from "@/lib/possession-explorer";

/**
 * Server island — loads validated possessions and ships only the view model
 * to the client. Never import getGamePossessions into client components.
 */
export async function PossessionExplorerIsland({
  gameId,
  awayTeamKey,
  homeTeamKey,
}: {
  gameId: string;
  awayTeamKey?: string;
  homeTeamKey?: string;
}) {
  const [shell, possessionResult] = await Promise.all([
    getGameShellCached(gameId),
    getGamePossessions(gameId).catch(() => null),
  ]);

  const game = shell?.game;
  const teamInput = {
    homeTeamId: game?.homeTeamId ?? homeTeamKey ?? null,
    awayTeamId: game?.awayTeamId ?? awayTeamKey ?? null,
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

  const washAway =
    model.status === "available"
      ? model.teams.away.canonicalTeamId
      : awayTeamKey ?? game?.awayTeamId ?? "away";
  const washHome =
    model.status === "available"
      ? model.teams.home.canonicalTeamId
      : homeTeamKey ?? game?.homeTeamId ?? "home";

  return (
    <MatchupWashCard
      awayTeamKey={washAway}
      homeTeamKey={washHome}
      intensity="subtle"
      className="flex flex-col gap-4 p-4 sm:p-5"
    >
      <PossessionExplorer model={model} />
    </MatchupWashCard>
  );
}
