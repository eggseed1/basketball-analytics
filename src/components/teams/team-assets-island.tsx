import { TeamAssetsSection } from "@/components/teams/team-assets-section";
import {
  buildTeamDraftAssetsPresentation,
  buildTeamPayrollPresentation,
  getCurrentFrontOfficeSeason,
  resolveFrontOfficeFranchiseId,
  resolveTeamFrontOfficeSlice,
} from "@/data/front-office/load-team-front-office";
import { getTeamAssets } from "@/data/queries/team-assets";
import type { TeamAssetLedger } from "@/data/types/team-assets";

export async function TeamAssetsIsland({
  teamId,
  abbreviation,
  season,
  teamKey,
}: {
  teamId: string;
  abbreviation: string;
  season: string;
  teamKey: string;
}) {
  const franchiseId = resolveFrontOfficeFranchiseId(teamId);
  const frontOfficeSeason = getCurrentFrontOfficeSeason();
  const viewingHistoricalStats = season !== frontOfficeSeason;
  const frontOffice = franchiseId
    ? await resolveTeamFrontOfficeSlice(franchiseId, frontOfficeSeason)
    : null;
  const payroll = frontOffice
    ? buildTeamPayrollPresentation(frontOffice)
    : null;
  const draftAssets = frontOffice
    ? buildTeamDraftAssetsPresentation(frontOffice)
    : null;

  const assetLedger = await getTeamAssets({
    teamId,
    abbreviation,
    season: frontOfficeSeason,
    minimumGames: 10,
  }).catch(
    (): TeamAssetLedger => ({
      teamId,
      asOfSeason: frontOfficeSeason,
      asOfDate: null,
      methodologyVersion: "1.0",
      lineageMethodologyVersion: "1.0",
      structuredLedgerAvailable: false,
      genealogyUiReady: false,
      playerBoardStatus: "error",
      warning: "Team assets temporarily unavailable.",
      categories: [
        {
          id: "players",
          label: "Players",
          availability: "provider_error",
          count: 0,
          note: "Team assets temporarily unavailable.",
        },
      ],
      players: [],
      draftCapital: [],
      tradeExceptions: [],
      draftRights: [],
      notes: ["Team assets temporarily unavailable."],
    })
  );

  return (
    <section
      id="assets"
      className="scroll-mt-16 flex flex-col gap-3"
      aria-label="Cap and assets"
    >
      <div>
        <h2 className="text-[20px] font-bold tracking-tight">
          Cap &amp; assets
        </h2>
        <p className="text-[14px] text-muted-foreground">
          {frontOfficeSeason} payroll, cap space, and draft picks from the
          current roster snapshot.
          {viewingHistoricalStats ? (
            <>
              {" "}
              Team stats elsewhere on this page are {season}.
            </>
          ) : null}
        </p>
      </div>
      <div className="sports-card p-4 sm:p-5">
        <TeamAssetsSection
          ledger={assetLedger}
          payroll={payroll}
          draftAssets={draftAssets}
          payrollHref={
            franchiseId ? `/teams/${franchiseId}/payroll` : undefined
          }
          draftAssetsHref={
            franchiseId ? `/teams/${franchiseId}/draft-assets` : undefined
          }
        />
      </div>
    </section>
  );
}
