import Link from "next/link";

import type { TeamFrontOfficeSummary } from "@/data/types/front-office";
import { formatUsdCompact } from "@/lib/format-money";

export function TeamFrontOfficeSummaryCard({
  summary,
}: {
  summary: TeamFrontOfficeSummary;
}) {
  return (
    <section
      id="front-office"
      aria-labelledby="front-office-heading"
      className="space-y-4 border-t border-border/70 pt-8"
    >
      <div>
        <h2
          id="front-office-heading"
          className="text-lg font-semibold tracking-tight"
        >
          Front Office
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Current-season salary commitments and draft capital status for this
          franchise.
        </p>
      </div>

      <dl className="grid gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Player salary commitments
          </dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums">
            {summary.playerSalaryCommitments == null
              ? "Unavailable"
              : formatUsdCompact(summary.playerSalaryCommitments)}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Future firsts controlled
          </dt>
          <dd className="mt-1 text-2xl font-semibold">
            {summary.futureFirstsControlled == null
              ? "Unavailable"
              : summary.futureFirstsControlled}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Future seconds controlled
          </dt>
          <dd className="mt-1 text-2xl font-semibold">
            {summary.futureSecondsControlled == null
              ? "Unavailable"
              : summary.futureSecondsControlled}
          </dd>
        </div>
      </dl>

      <div className="flex flex-wrap gap-3">
        <Link
          href={summary.payrollHref}
          className="inline-flex items-center rounded-md bg-foreground px-3 py-2 text-sm font-semibold text-background"
        >
          Payroll &amp; Contracts
        </Link>
        <Link
          href={summary.draftAssetsHref}
          className="inline-flex items-center rounded-md border border-border px-3 py-2 text-sm font-semibold"
        >
          Draft Assets
        </Link>
      </div>

      {summary.disclosures.length > 0 ? (
        <ul className="space-y-1 text-xs text-muted-foreground">
          {summary.disclosures.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
