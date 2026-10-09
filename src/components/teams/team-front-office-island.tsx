import { TeamFrontOfficeSummaryCard } from "@/components/teams/team-front-office-summary";
import {
  buildTeamFrontOfficeSummary,
  getCurrentFrontOfficeSeason,
  resolveFrontOfficeFranchiseId,
  resolveTeamFrontOfficeSlice,
} from "@/data/front-office/load-team-front-office";
import { getTeamContracts, getTeamFuturePicks } from "@/data/queries/team-contracts";
import { getTeamContractValue } from "@/data/runtime/contract-value";
import { PayrollSalaryStack } from "@/components/teams/viz/payroll-salary-stack";
import { VizCard } from "@/components/teams/viz/viz-kit";

export async function TeamFrontOfficeIsland({ teamId }: { teamId: string }) {
  const franchiseId = resolveFrontOfficeFranchiseId(teamId);
  if (!franchiseId) return null;

  const frontOfficeSeason = getCurrentFrontOfficeSeason();

  const slice = await resolveTeamFrontOfficeSlice(franchiseId, frontOfficeSeason);
  if (!slice) {
    return (
      <section id="front-office" className="space-y-2">
        <h2 className="text-[20px] font-bold tracking-tight">Salary &amp; Assets</h2>
        <p className="text-[14px] text-muted-foreground">
          Payroll snapshot unavailable for {frontOfficeSeason}.
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
    <div className="flex flex-col gap-3">
      <TeamFrontOfficeSummaryCard
        summary={summary}
        labels={labels}
        contractValue={getTeamContractValue(franchiseId)}
        contracts={contracts}
      />
      {contracts && contracts.rows.length && contracts.seasons.length ? (
        <VizCard
          title="Who the money is tied up in"
          accentKey={contracts.code ?? franchiseId}
          subtitle="Listed salary by season, one block per contract, biggest deals at the bottom. Hover a player to trace his deal across the years."
          footnote={
            contracts.salaryCap
              ? `The dashed line is the ${contracts.capSeason ?? frontOfficeSeason} salary cap. Later caps aren't set yet, so they aren't drawn.`
              : undefined
          }
        >
          <PayrollSalaryStack
            seasons={contracts.seasons}
            salaryCap={contracts.salaryCap ?? null}
            capSeason={contracts.capSeason ?? null}
            rows={[...contracts.rows]
              .sort((a, b) => (b.years[0]?.amount ?? 0) - (a.years[0]?.amount ?? 0))
              .map((r) => ({
                id: r.brefId,
                name: r.name,
                cells: r.years.map((c) =>
                  c ? { amount: c.amount, option: c.option, notGuaranteed: c.notGuaranteed ?? false } : null
                ),
              }))}
          />
        </VizCard>
      ) : null}
    </div>
  );
}
