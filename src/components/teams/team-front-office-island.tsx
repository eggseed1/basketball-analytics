import Link from "next/link";

import { TeamFrontOfficeSummaryCard } from "@/components/teams/team-front-office-summary";
import {
  buildTeamFrontOfficeSummary,
  getCurrentFrontOfficeSeason,
  resolveFrontOfficeFranchiseId,
  resolveTeamFrontOfficeSlice,
} from "@/data/front-office/load-team-front-office";
import { getTeamContracts, getTeamFuturePicks } from "@/data/queries/team-contracts";
import { getTeamContractValue } from "@/data/runtime/contract-value";

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

  const base = buildTeamFrontOfficeSummary(slice);
  const contracts = getTeamContracts(franchiseId);
  const picks = getTeamFuturePicks(franchiseId);
  const held = (round: 1 | 2) =>
    picks ? picks.picks.filter((p) => p.round === round && p.holder === picks.teamAbbr).length : null;
  const lastYear = picks ? Math.max(...picks.picks.map((p) => p.year)) : null;
  const summary = {
    ...base,
    playerSalaryCommitments: contracts?.totals?.years[0] ?? base.playerSalaryCommitments,
    futureFirstsControlled: held(1) ?? base.futureFirstsControlled,
    futureSecondsControlled: held(2) ?? base.futureSecondsControlled,
    disclosures: [
      ...(contracts
        ? [`Payroll is the listed ${contracts.capSeason ?? frontOfficeSeason} total, guaranteed or not.`]
        : base.disclosures.filter((d) => /salary/i.test(d))),
      ...(picks
        ? [
            `Picks held counts every first or second the team holds through ${lastYear}, including ones it traded for. Picks it may only get under conditions aren't counted.`,
          ]
        : base.disclosures.filter((d) => !/salary/i.test(d))),
    ],
  };
  const labels = {
    salary: contracts ? "Payroll" : undefined,
    firsts: picks ? "Firsts held" : undefined,
    seconds: picks ? "Seconds held" : undefined,
  };

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
      <TeamFrontOfficeSummaryCard
        summary={summary}
        labels={labels}
        contractValue={getTeamContractValue(franchiseId)}
        contracts={contracts}
      />
    </div>
  );
}
