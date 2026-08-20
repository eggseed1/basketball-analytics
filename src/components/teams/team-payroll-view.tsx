import Link from "next/link";

import type { TeamPayrollPresentation } from "@/data/types/front-office";
import { PayrollCommitmentsChart } from "@/components/teams/payroll-commitments-chart";
import { PayrollContractTimeline } from "@/components/teams/payroll-contract-timeline";
import { formatUsdCompact, formatUsdDollars } from "@/lib/format-money";

function optionLabel(opt: string): string {
  switch (opt) {
    case "PLAYER_OPTION":
      return "PO";
    case "TEAM_OPTION":
      return "TO";
    case "NONE":
      return "—";
    case "UNKNOWN":
      return "?";
    default:
      return opt.slice(0, 3);
  }
}

function guaranteeLabel(g: string): string {
  switch (g) {
    case "FULLY_GUARANTEED":
      return "FG";
    case "PARTIALLY_GUARANTEED":
      return "PG";
    case "NON_GUARANTEED":
      return "NG";
    case "UNKNOWN":
      return "Unknown";
    default:
      return g;
  }
}

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

      <section aria-labelledby="payroll-table-heading" className="space-y-3">
        <h2 id="payroll-table-heading" className="text-lg font-semibold">
          Contract table
        </h2>
        <p className="text-sm text-muted-foreground">
          Option / guarantee: text labels (PO / TO / Unknown). Color is not the
          only signal. Year horizon is dynamic from source — not hard-coded.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="sticky left-0 bg-background py-2 pr-3 font-semibold">
                  Player
                </th>
                <th className="py-2 pr-3 font-semibold">Age</th>
                {seasons.map((s) => (
                  <th key={s} className="py-2 pr-3 font-semibold tabular-nums">
                    {s}
                  </th>
                ))}
                <th className="py-2 font-semibold">Guaranteed</th>
              </tr>
            </thead>
            <tbody>
              {data.contractRows.map((row) => (
                <tr
                  key={row.contractId}
                  className="border-b border-border/60 align-top"
                >
                  <td className="sticky left-0 bg-background py-2 pr-3">
                    <Link
                      href={row.href}
                      className="font-medium underline-offset-2 hover:underline"
                    >
                      {row.playerName}
                    </Link>
                  </td>
                  <td className="py-2 pr-3 tabular-nums text-muted-foreground">
                    {row.age == null ? "—" : row.age}
                  </td>
                  {seasons.map((s) => {
                    const y = row.years.find((yy) => yy.season === s);
                    if (!y) {
                      return (
                        <td key={s} className="py-2 pr-3 text-muted-foreground">
                          —
                        </td>
                      );
                    }
                    return (
                      <td key={s} className="py-2 pr-3">
                        <div className="tabular-nums font-medium">
                          {formatUsdDollars(y.salary)}
                        </div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          <span title="Option status">
                            Opt {optionLabel(y.optionType)}
                          </span>
                          {" · "}
                          <span title="Guarantee status">
                            Guar {guaranteeLabel(y.guaranteeStatus)}
                          </span>
                        </div>
                      </td>
                    );
                  })}
                  <td className="py-2 tabular-nums text-muted-foreground">
                    {formatUsdDollars(row.guaranteedTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

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
