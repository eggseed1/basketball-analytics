import { TeamAssetsSection } from "@/components/teams/team-assets-section";
import {
  buildTeamDraftAssetsPresentation,
  buildTeamPayrollPresentation,
  getCurrentFrontOfficeSeason,
  resolveFrontOfficeFranchiseId,
  resolveTeamFrontOfficeSlice,
} from "@/data/front-office/load-team-front-office";
import { getTeamAssets } from "@/data/queries/team-assets";
import { getTeamContracts, getTeamFuturePicks } from "@/data/queries/team-contracts";
import type { TeamAssetLedger } from "@/data/types/team-assets";

export async function TeamAssetsIsland({
  teamId,
  abbreviation,
  view,
}: {
  teamId: string;
  abbreviation: string;
  view: "summary" | "picks";
}) {
  const franchiseId = resolveFrontOfficeFranchiseId(teamId);
  const frontOfficeSeason = getCurrentFrontOfficeSeason();
  const frontOffice = franchiseId
    ? await resolveTeamFrontOfficeSlice(franchiseId, frontOfficeSeason)
    : null;
  const payroll = frontOffice
    ? buildTeamPayrollPresentation(frontOffice)
    : null;
  const draftAssets = frontOffice
    ? buildTeamDraftAssetsPresentation(frontOffice)
    : null;
  const contracts = franchiseId ? getTeamContracts(franchiseId) : null;
  const futurePicks = franchiseId ? getTeamFuturePicks(franchiseId) : null;

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

  const picks = view === "picks";

  return (
    <section
      id={picks ? "draft-picks" : "assets"}
      className="scroll-mt-16 flex flex-col gap-3"
      aria-label={picks ? "Draft picks and rights" : "Cap and assets"}
    >
      <div>
        <h2 className="text-[20px] font-bold tracking-tight">
          {picks ? <>Draft picks &amp; rights</> : <>Cap &amp; assets</>}
        </h2>
        <p className="text-[14px] text-muted-foreground">
          {picks
            ? "Every future first and second the team holds, plus unsigned draft rights."
            : contracts
              ? `${frontOfficeSeason} cap position, trade exceptions and the asset ledger.`
              : `${frontOfficeSeason} payroll and cap space from the current roster snapshot${
                  assetLedger.structuredLedgerAvailable
                    ? " plus the structured asset ledger (picks, exceptions, rights)."
                    : "."
                }`}
        </p>
      </div>
      <div className="sports-card p-4 sm:p-5">
        <TeamAssetsSection
          ledger={assetLedger}
          payroll={payroll}
          draftAssets={draftAssets}
          contracts={contracts}
          futurePicks={futurePicks}
          view={view}
        />
      </div>
    </section>
  );
}
