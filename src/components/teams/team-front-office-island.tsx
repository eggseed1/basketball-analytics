import Link from "next/link";

import { TeamFrontOfficeSummaryCard } from "@/components/teams/team-front-office-summary";
import {
  buildTeamFrontOfficeSummary,
  getCurrentFrontOfficeSeason,
  resolveFrontOfficeFranchiseId,
  resolveTeamFrontOfficeSlice,
} from "@/data/front-office/load-team-front-office";

export async function TeamFrontOfficeIsland({
  teamId,
  season,
}: {
  teamId: string;
  season: string;
}) {
  const franchiseId = resolveFrontOfficeFranchiseId(teamId);
  if (!franchiseId) return null;

  const frontOfficeSeason = getCurrentFrontOfficeSeason();
  const viewingHistoricalStats = season !== frontOfficeSeason;

  const slice = await resolveTeamFrontOfficeSlice(franchiseId, frontOfficeSeason);
  if (!slice) {
    return (
      <section
        id="front-office"
        className="space-y-2 border-t border-border/70 pt-8"
      >
        <h2 className="text-lg font-semibold">Front Office</h2>
        <p className="text-sm text-muted-foreground">
          Front-office snapshot unavailable for {frontOfficeSeason}.
        </p>
      </section>
    );
  }

  const summary = buildTeamFrontOfficeSummary(slice);

  return (
    <div className="flex flex-col gap-3 border-t border-border/70 pt-8">
      {viewingHistoricalStats ? (
        <p className="text-sm text-muted-foreground">
          Current {frontOfficeSeason} payroll and draft capital while browsing{" "}
          {season} team stats.{" "}
          <Link
            href={`/teams/${franchiseId}?season=${encodeURIComponent(frontOfficeSeason)}&tab=organization`}
            className="font-semibold underline"
          >
            Switch to {frontOfficeSeason}
          </Link>
        </p>
      ) : null}
      <TeamFrontOfficeSummaryCard summary={summary} />
    </div>
  );
}
