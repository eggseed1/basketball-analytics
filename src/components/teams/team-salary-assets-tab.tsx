import { Suspense } from "react";

import { DestinationSectionSkeleton } from "@/components/continuity/destination-loading-frame";
import { TransitionLink } from "@/components/continuity/query-nav";
import { TeamAssetsIsland } from "@/components/teams/team-assets-island";
import { TeamContractsPageView } from "@/components/teams/team-contracts-view";
import { TeamDraftHistorySection } from "@/components/teams/team-draft-history-section";
import { TeamFrontOfficeIsland } from "@/components/teams/team-front-office-island";
import { TeamPayrollView } from "@/components/teams/team-payroll-view";
import {
  buildTeamPayrollPresentation,
  getCurrentFrontOfficeSeason,
  resolveFrontOfficeFranchiseId,
  resolveTeamFrontOfficeSlice,
} from "@/data/front-office/load-team-front-office";
import { getTeamContracts } from "@/data/queries/team-contracts";
import { type } from "@/lib/design-system";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { TEAM_SALARY_VIEWS, teamSalaryHref, type TeamSalaryView } from "@/lib/team-destination";
import { cn } from "@/lib/utils";

async function TeamContractsIsland({ teamId, season }: { teamId: string; season: string }) {
  const franchiseId = resolveFrontOfficeFranchiseId(teamId);
  const contracts = franchiseId ? getTeamContracts(franchiseId) : null;
  const slice = franchiseId ? await resolveTeamFrontOfficeSlice(franchiseId) : null;
  if (franchiseId && contracts) {
    const teamKey = (resolveTeamBrand(franchiseId) ?? resolveTeamBrand(contracts.code))?.abbr ?? contracts.code;
    return (
      <TeamContractsPageView
        teamKey={teamKey}
        franchiseId={franchiseId}
        contracts={contracts}
        capContext={slice ? buildTeamPayrollPresentation(slice).capContext : null}
        season={season}
        seasonHref={(other) => `${teamSalaryHref(teamId, "contracts", other)}#payoff-heading`}
      />
    );
  }
  if (slice) return <TeamPayrollView data={buildTeamPayrollPresentation(slice)} />;
  return (
    <p className={cn(type.bodySm, "text-muted-foreground")}>
      No validated payroll is published for this franchise.
    </p>
  );
}

export function TeamSalaryAssetsTab({
  teamId,
  espnTeamId,
  abbreviation,
  season,
  view,
}: {
  teamId: string;
  espnTeamId: string;
  abbreviation: string;
  season: string;
  view: TeamSalaryView;
}) {
  const frontOfficeSeason = getCurrentFrontOfficeSeason();

  return (
    <div data-motion-stack className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <nav className="flex flex-wrap gap-1.5" aria-label="Salary and assets views">
          {TEAM_SALARY_VIEWS.map((item) => (
            <TransitionLink
              key={item.id}
              href={teamSalaryHref(teamId, item.id, season)}
              scroll={false}
              aria-current={view === item.id ? "page" : undefined}
              className={cn(
                type.caption,
                "glass-pill rounded-md px-2.5 py-1 font-semibold transition-colors",
                view === item.id ? "glass-pill-active" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {item.label}
            </TransitionLink>
          ))}
        </nav>
        {season !== frontOfficeSeason ? (
          <p className={cn(type.caption, "text-muted-foreground")}>
            Salary and draft picks are the franchise&apos;s current {frontOfficeSeason} books. They don&apos;t change with
            the {season} season picked above.
          </p>
        ) : null}
      </div>

      {view === "summary" ? (
        <>
          <Suspense fallback={<DestinationSectionSkeleton label="Loading salary…" />}>
            <TeamFrontOfficeIsland teamId={teamId} />
          </Suspense>
          <Suspense fallback={<DestinationSectionSkeleton label="Loading cap and assets…" />}>
            <TeamAssetsIsland teamId={espnTeamId} abbreviation={abbreviation} view="summary" />
          </Suspense>
        </>
      ) : null}

      {view === "contracts" ? (
        <Suspense fallback={<DestinationSectionSkeleton label="Loading contracts…" />}>
          <TeamContractsIsland teamId={teamId} season={season} />
        </Suspense>
      ) : null}

      {view === "picks" ? (
        <>
          <Suspense fallback={<DestinationSectionSkeleton label="Loading draft picks…" />}>
            <TeamAssetsIsland teamId={espnTeamId} abbreviation={abbreviation} view="picks" />
          </Suspense>
          <TeamDraftHistorySection teamId={espnTeamId} />
        </>
      ) : null}
    </div>
  );
}
