import { Suspense } from "react";

import type { AnalyticalFinding, TeamTrait } from "@/analytics";
import { LeagueStrips, NetLadder } from "@/components/teams/overview/league-context";
import { SeasonFlowChart } from "@/components/teams/overview/season-flow-chart";
import { TeamDnaRadar } from "@/components/teams/overview/team-dna-radar";
import { QuarterProfile, SplitsPanel, StrengthsPanel } from "@/components/teams/overview/team-overview-panels";
import { TeamScoringShareIsland } from "@/components/teams/overview/team-scoring-share-island";
import type { TeamSeasonStats } from "@/data/types";
import { type } from "@/lib/design-system";
import {
  buildLeagueStrips,
  buildNetLadder,
  buildQuarterProfile,
  buildSeasonHighlights,
  buildSeasonTrajectory,
  buildSplitsBundle,
  buildTeamDna,
  traitBars,
} from "@/lib/team-overview-data";
import type { RankedMetric } from "@/lib/team-page-metrics";
import { cn } from "@/lib/utils";

export function TeamOverviewVisuals({
  team,
  league,
  ranked,
  traits,
  howTheyWin,
  season,
}: {
  team: TeamSeasonStats;
  league: TeamSeasonStats[];
  ranked: RankedMetric[];
  traits: TeamTrait[];
  howTheyWin: AnalyticalFinding[];
  season: string;
}) {
  const teamId = team.teamId;
  const teamKey = team.abbreviation;
  const trajectory = buildSeasonTrajectory(teamId, season);
  const highlights = buildSeasonHighlights(teamId, season, trajectory);
  const quarters = buildQuarterProfile(teamId, season);
  const splits = buildSplitsBundle(teamId, season);
  const dna = buildTeamDna(ranked);
  const strips = buildLeagueStrips(team, league);
  const ladder = buildNetLadder(league);
  const strengths = traitBars(traits.filter((t) => t.percentile >= 67).sort((a, b) => b.percentile - a.percentile).slice(0, 3));
  const weaknesses = traitBars(traits.filter((t) => t.percentile <= 33).sort((a, b) => a.percentile - b.percentile).slice(0, 3));

  return (
    <div className="flex flex-col gap-4">
      {trajectory.length ? (
        <SeasonFlowChart games={trajectory} highlights={highlights} teamKey={teamKey} season={season} />
      ) : null}

      <TeamDnaRadar axes={dna} teamKey={teamKey} season={season} />

      <div className="grid grid-flow-row-dense gap-4 lg:grid-cols-2">
        <StrengthsPanel strengths={strengths} weaknesses={weaknesses} howTheyWin={howTheyWin} />
        <Suspense fallback={<div className="sports-card h-72 animate-pulse" aria-label="Loading scoring share" />}>
          <TeamScoringShareIsland teamId={teamId} teamKey={teamKey} season={season} />
        </Suspense>
        <QuarterProfile rows={quarters.rows} games={quarters.games} season={season} />
        <SplitsPanel splits={splits} season={season} />
      </div>

      <NetLadder rows={ladder} teamId={teamId} teamKey={teamKey} conference={team.conference ?? ""} season={season} />
      <LeagueStrips strips={strips} teamKey={teamKey} season={season} />

      <p className={cn(type.micro, "text-muted-foreground")}>
        Rates and ranks come from season team totals. Game-by-game charts use final scores from the
        schedule. Neither adjusts for opponent strength.
      </p>
    </div>
  );
}
