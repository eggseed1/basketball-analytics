import {
  buildTeamFrontOfficeSummary,
  isCurrentFrontOfficeSeason,
  loadTeamFrontOfficeSlice,
  resolveFrontOfficeFranchiseId,
} from "@/data/front-office/load-team-front-office";
import { TeamFrontOfficeSummaryCard } from "@/components/teams/team-front-office-summary";
import Link from "next/link";

export async function TeamFrontOfficeIsland({
  teamId,
  season,
}: {
  teamId: string;
  season: string;
}) {
  const franchiseId = resolveFrontOfficeFranchiseId(teamId);
  if (!franchiseId) return null;

  if (!isCurrentFrontOfficeSeason(season)) {
    return (
      <section
        id="front-office"
        className="space-y-2 border-t border-border/70 pt-8"
      >
        <h2 className="text-lg font-semibold">Front Office</h2>
        <p className="text-sm text-muted-foreground">
          Current payroll and draft assets are not mixed into this historical
          season view ({season}).
        </p>
        <Link
          href={`/teams/${franchiseId}/payroll`}
          className="inline-flex text-sm font-semibold underline"
        >
          View current franchise front office
        </Link>
      </section>
    );
  }

  const slice = loadTeamFrontOfficeSlice(franchiseId);
  if (!slice) {
    return (
      <section
        id="front-office"
        className="space-y-2 border-t border-border/70 pt-8"
      >
        <h2 className="text-lg font-semibold">Front Office</h2>
        <p className="text-sm text-muted-foreground">
          Front-office snapshot unavailable.
        </p>
      </section>
    );
  }

  const summary = buildTeamFrontOfficeSummary(slice);
  return <TeamFrontOfficeSummaryCard summary={summary} />;
}
