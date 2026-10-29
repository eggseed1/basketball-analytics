import { Suspense } from "react";
import { getTranslations } from "next-intl/server";

import { DestinationSectionSkeleton } from "@/components/continuity/destination-loading-frame";
import { TeamAssetsIsland } from "@/components/teams/team-assets-island";
import { TeamContractsPageView } from "@/components/teams/team-contracts-view";
import { TeamDraftHistorySection } from "@/components/teams/team-draft-history-section";
import { TeamFrontOfficeIsland } from "@/components/teams/team-front-office-island";
import { TeamPayrollView } from "@/components/teams/team-payroll-view";
import { TeamSalaryViewSwitch } from "@/components/teams/team-salary-view-switch";
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

async function TeamContractsIsland({
  routeTeamId,
  teamId,
  season,
}: {
  routeTeamId: string;
  teamId: string;
  season: string;
}) {
  const t = await getTranslations("TeamDetail");
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
        seasonHref={(other) => `${teamSalaryHref(routeTeamId, "contracts", other)}#payoff-heading`}
      />
    );
  }
  if (slice) return <TeamPayrollView data={buildTeamPayrollPresentation(slice)} />;
  return (
    <p className={cn(type.bodySm, "text-muted-foreground")}>
      {t("noPayroll")}
    </p>
  );
}

export async function TeamSalaryAssetsTab({
  routeTeamId,
  teamId,
  espnTeamId,
  abbreviation,
  season,
  view,
}: {
  /** The id in the current URL. Links keep it so switching views stays on this route. */
  routeTeamId: string;
  teamId: string;
  espnTeamId: string;
  abbreviation: string;
  season: string;
  view: TeamSalaryView;
}) {
  const t = await getTranslations("TeamDetail");
  const frontOfficeSeason = getCurrentFrontOfficeSeason();

  const viewLabels: Record<TeamSalaryView, string> = {
    summary: t("salarySummary"),
    contracts: t("salaryContracts"),
    picks: t("salaryPicks"),
  };
  return (
    <div data-motion-stack className="flex flex-col gap-6">
      <TeamSalaryViewSwitch
        active={view}
        ariaLabel={t("salaryViewAria")}
        items={TEAM_SALARY_VIEWS.map((item) => ({
          id: item.id,
          label: viewLabels[item.id],
          href: teamSalaryHref(routeTeamId, item.id, season),
        }))}
        note={
          season !== frontOfficeSeason ? (
            <p className={cn(type.caption, "text-muted-foreground")}>
              {t("salarySeasonNote", {
                booksSeason: frontOfficeSeason,
                season,
              })}
            </p>
          ) : null
        }
      >
        <SalaryViewContent
          routeTeamId={routeTeamId}
          teamId={teamId}
          espnTeamId={espnTeamId}
          abbreviation={abbreviation}
          season={season}
          view={view}
        />
      </TeamSalaryViewSwitch>
    </div>
  );
}

function SalaryViewContent({
  routeTeamId,
  teamId,
  espnTeamId,
  abbreviation,
  season,
  view,
}: {
  routeTeamId: string;
  teamId: string;
  espnTeamId: string;
  abbreviation: string;
  season: string;
  view: TeamSalaryView;
}) {
  return (
    <>
      {view === "summary" ? (
        <>
          <Suspense
            fallback={<DestinationSectionSkeleton context="section-salary" />}
          >
            <TeamFrontOfficeIsland teamId={teamId} />
          </Suspense>
          <Suspense
            fallback={<DestinationSectionSkeleton context="section-salary" />}
          >
            <TeamAssetsIsland
              teamId={espnTeamId}
              abbreviation={abbreviation}
              view="summary"
            />
          </Suspense>
        </>
      ) : null}

      {view === "contracts" ? (
        <Suspense
          fallback={<DestinationSectionSkeleton context="section-salary" />}
        >
          <TeamContractsIsland
            routeTeamId={routeTeamId}
            teamId={teamId}
            season={season}
          />
        </Suspense>
      ) : null}

      {view === "picks" ? (
        <>
          <Suspense
            fallback={<DestinationSectionSkeleton context="section-salary" />}
          >
            <TeamAssetsIsland
              teamId={espnTeamId}
              abbreviation={abbreviation}
              view="picks"
            />
          </Suspense>
          <TeamDraftHistorySection teamId={espnTeamId} />
        </>
      ) : null}
    </>
  );
}
