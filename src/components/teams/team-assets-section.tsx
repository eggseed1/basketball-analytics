import Link from "next/link";

import { MetricHelp } from "@/components/learn/metric-help";
import { TeamDraftAssetsTable } from "@/components/teams/team-draft-assets-table";
import { TeamPayrollTable } from "@/components/teams/team-payroll-table";
import type { TeamDraftAssetsPresentation } from "@/data/types/front-office";
import type { TeamPayrollPresentation } from "@/data/types/front-office";
import type { TeamAssetLedger } from "@/data/types/team-assets";
import { AppLink } from "@/components/ui/app-link";
import { type } from "@/lib/design-system";
import { formatUsdCompact } from "@/lib/format-money";
import { cn } from "@/lib/utils";

function capSpaceLabel(payroll: TeamPayrollPresentation): string | null {
  const cap = payroll.capContext.salaryCap;
  const commitments = payroll.summary.playerSalaryCommitments;
  if (cap == null || commitments == null) return null;
  return formatUsdCompact(cap - commitments);
}

/**
 * Team Cap / Assets — payroll table, cap space, and draft pick grid.
 */
export function TeamAssetsSection({
  ledger,
  payroll,
  draftAssets,
  payrollHref,
  draftAssetsHref,
}: {
  ledger: TeamAssetLedger;
  payroll?: TeamPayrollPresentation | null;
  draftAssets?: TeamDraftAssetsPresentation | null;
  payrollHref?: string;
  draftAssetsHref?: string;
}) {
  const blocked = ledger.categories.filter(
    (c) => c.availability === "blocked_pending_structured_source"
  );
  const capSpace = payroll ? capSpaceLabel(payroll) : null;

  return (
    <div className="flex flex-col gap-6">
      {payroll && payroll.contractRows.length > 0 ? (
        <section className="flex flex-col gap-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-2">
              <p className={cn(type.caption, "text-muted-foreground")}>
                Salary cap
              </p>
              <p className={cn(type.bodySm, "font-bold tabular-nums")}>
                {formatUsdCompact(payroll.capContext.salaryCap)}
              </p>
            </div>
            <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-2">
              <p className={cn(type.caption, "text-muted-foreground")}>
                Commitments
              </p>
              <p className={cn(type.bodySm, "font-bold tabular-nums")}>
                {payroll.summary.playerSalaryCommitments == null
                  ? "—"
                  : formatUsdCompact(payroll.summary.playerSalaryCommitments)}
              </p>
            </div>
            <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-2">
              <p className={cn(type.caption, "text-muted-foreground")}>
                Cap space
              </p>
              <p
                className={cn(
                  type.bodySm,
                  "font-bold tabular-nums",
                  capSpace && capSpace.startsWith("-")
                    ? "text-amber-700 dark:text-amber-400"
                    : "text-emerald-700 dark:text-emerald-400"
                )}
              >
                {capSpace ?? "—"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className={cn(type.caption, "text-muted-foreground")}>
              {payroll.season} roster · {payroll.summary.playersWithSalary} with
              salary
            </p>
            {payrollHref ? (
              <Link
                href={payrollHref}
                className={cn(type.caption, "font-semibold underline-offset-2 hover:underline")}
              >
                Full payroll →
              </Link>
            ) : null}
          </div>
          <TeamPayrollTable data={payroll} compact />
          <p className={cn(type.caption, "text-muted-foreground")}>
            Cap space = salary cap − player salary commitments. Excludes cap
            holds, dead money, and exceptions.
          </p>
        </section>
      ) : (
        <p className={cn(type.bodySm, "text-muted-foreground")}>
          Payroll unavailable for this season.{" "}
          {payrollHref ? (
            <Link href={payrollHref} className="font-semibold underline">
              Current franchise payroll
            </Link>
          ) : null}
        </p>
      )}

      {draftAssets ? (
        <section className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            {draftAssetsHref ? (
              <Link
                href={draftAssetsHref}
                className={cn(type.caption, "font-semibold underline-offset-2 hover:underline")}
              >
                Full draft board →
              </Link>
            ) : null}
          </div>
          <TeamDraftAssetsTable data={draftAssets} compact />
        </section>
      ) : null}

      {blocked.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h3 className={cn(type.bodySm, "font-bold tracking-tight")}>
            Trade exceptions &amp; encumbrances
          </h3>
          <ul className="flex flex-col gap-2">
            {blocked.map((c) => (
              <li
                key={c.id}
                className="rounded-md border border-dashed border-border/80 px-3 py-2.5"
              >
                <p className={cn(type.bodySm, "font-semibold")}>{c.label}</p>
                <p className={cn(type.caption, "mt-0.5 text-muted-foreground")}>
                  {c.id === "trade_exceptions" ? (
                    <>
                      <MetricHelp conceptId="trade_exception">
                        Trade Exception
                      </MetricHelp>{" "}
                      data unavailable -{" "}
                    </>
                  ) : null}
                  {c.id === "draft_capital" ? (
                    <>
                      <MetricHelp conceptId="draft_capital">
                        Traded pick ledger
                      </MetricHelp>{" "}
                      -{" "}
                    </>
                  ) : null}
                  {c.note}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className={cn(type.caption, "text-muted-foreground")}>
        Genealogy UI ready: {ledger.genealogyUiReady ? "yes" : "no"} ·{" "}
        <AppLink
          href="/offseason"
          className="font-semibold underline-offset-2 hover:underline"
        >
          Offseason Tracker
        </AppLink>{" "}
        ·{" "}
        <Link
          href="/learn/transaction-layers"
          className="font-semibold underline-offset-2 hover:underline"
        >
          Learn transaction layers
        </Link>
      </p>
    </div>
  );
}
