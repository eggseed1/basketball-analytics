import { TeamArcSection } from "@/components/teams/team-arc-section";
import {
  getTeamSeasonArc,
  listTeamArcCandidateSeasons,
  teamArcDefaultWindow,
} from "@/data/queries";
import type { TeamSeasonStats } from "@/data/types";
import { buildTeamArcModel } from "@/lib/team-arc";

export async function TeamArcIsland({
  teamRouteKey,
  teamId,
  teamName,
  abbreviation,
  season,
  priorSeason,
  showingFullArc,
  teamEspnId,
  currentBoard,
  priorBoard,
}: {
  teamRouteKey: string;
  teamId: string;
  teamName: string;
  abbreviation: string;
  season: string;
  priorSeason: string;
  showingFullArc: boolean;
  teamEspnId: string;
  currentBoard: TeamSeasonStats[];
  priorBoard: TeamSeasonStats[];
}) {
  const arcCandidates = listTeamArcCandidateSeasons({ latest: season });
  const arcSeasons = showingFullArc
    ? arcCandidates
    : teamArcDefaultWindow(season);

  const arcLoad = await getTeamSeasonArc({
    teamId,
    abbreviation,
    seasons: arcSeasons,
    preloadedBoards: {
      [season]: currentBoard,
      ...(priorBoard.length ? { [priorSeason]: priorBoard } : {}),
    },
  });

  const arc = buildTeamArcModel({
    rows: arcLoad.rows,
    viewingSeason: season,
    showingFull: showingFullArc,
    fullCandidateCount: arcCandidates.length,
    missingSeasons: arcLoad.missingSeasons,
    failedSeasons: arcLoad.failedSeasons,
  });

  return (
    <section
      id="arc"
      className="scroll-mt-16 flex flex-col gap-3"
      aria-label="Team Arc"
    >
      <div className="sports-card p-4 sm:p-5">
        <TeamArcSection
          arc={arc}
          teamRouteKey={teamRouteKey}
          teamId={teamId}
          teamName={teamName}
          viewingSeason={season}
          teamEspnId={teamEspnId}
        />
      </div>
    </section>
  );
}
