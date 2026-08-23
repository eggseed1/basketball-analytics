import type { TeamPayrollPresentation } from "@/data/types/front-office";
import { PayrollCommitmentsChart } from "@/components/teams/payroll-commitments-chart";
import { PayrollContractTimeline } from "@/components/teams/payroll-contract-timeline";
import { TeamPayrollTable } from "@/components/teams/team-payroll-table";
import { formatUsdCompact, formatUsdDollars } from "@/lib/format-money";

export function TeamPayrollView({ data }: { data: TeamPayrollPresentation }) {
  const seasons = Array.from(
    new Set(data.contractRows.flatMap((r) => r.years.map((y) => y.season)))
  ).sort();

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Payroll &amp; Contracts
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          {data.team.displayName}
        </h1>
        <p className="text-sm text-muted-foreground">
          Season {data.season} · Snapshot {data.snapshotStatus.toLowerCase()} ·
          Updated {new Date(data.updatedAt).toLocaleString("en-US")}
        </p>
      </header>

      <section aria-labelledby="cap-context-heading" className="space-y-3">
        <h2 id="cap-context-heading" className="text-lg font-semibold">
          Cap context
        </h2>
        <p className="text-xs text-muted-foreground">
          Status:{" "}
          <span className="font-semibold text-foreground">
            {data.capContext.status === "OFFICIAL"
              ? "Official"
              : data.capContext.status === "PROJECTED"
                ? "Projected"
                : "Unknown"}
          </span>
          {data.capContext.status === "PROJECTED"
            ? " — projected values are not official."
            : null}
        </p>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(
            [
              ["Salary Cap", data.capContext.salaryCap],
              ["Luxury Tax", data.capContext.luxuryTax],
              ["First Apron", data.capContext.firstApron],
              ["Second Apron", data.capContext.secondApron],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {label}
                {data.capContext.status === "PROJECTED" ? " (Projected)" : ""}
              </dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums">
                {formatUsdCompact(value)}
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-muted-foreground">
          Source: {data.capContext.source}
          {data.capContext.sourceDate
            ? ` · ${data.capContext.sourceDate}`
            : ""}
        </p>
      </section>

      <section aria-labelledby="commitments-heading" className="space-y-3">
        <h2 id="commitments-heading" className="text-lg font-semibold">
          Player salary commitments
        </h2>
        <p className="text-3xl font-semibold tabular-nums">
          {data.summary.playerSalaryCommitments == null
            ? "Unavailable"
            : formatUsdDollars(data.summary.playerSalaryCommitments)}
        </p>
        <p className="text-sm text-muted-foreground">
          {data.summary.playersWithSalary} players with known salary ·{" "}
          {data.summary.playersWithoutSalary} roster players without matched
          salary (shown as — , never $0)
        </p>
        <PayrollCommitmentsChart bars={data.futureCommitments} />
      </section>

      <PayrollContractTimeline rows={data.contractRows} seasons={seasons} />

      <TeamPayrollTable data={data} />

      <section className="space-y-2 text-xs text-muted-foreground">
        <h2 className="text-sm font-semibold text-foreground">Disclosures</h2>
        <ul className="list-disc space-y-1 pl-5">
          {data.disclosures.map((d) => (
            <li key={d}>{d}</li>
          ))}
          <li>
            Capabilities — payroll: {data.capabilities.PAYROLL}; contracts:{" "}
            {data.capabilities.CONTRACTS}; full cap accounting:{" "}
            {data.capabilities.FULL_CAP_ACCOUNTING}
          </li>
        </ul>
      </section>
    </div>
  );
}
