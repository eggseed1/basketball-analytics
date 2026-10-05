import Link from "next/link";

import { MetricHelp } from "@/components/learn/metric-help";
import { BrefPayrollTable, PayrollColorKey } from "@/components/teams/bref-payroll-table";
import { TeamDraftAssetsTable } from "@/components/teams/team-draft-assets-table";
import { TeamDraftRightsTable } from "@/components/teams/team-draft-rights-table";
import { FuturePicksSourceNote, TeamFuturePicksTable } from "@/components/teams/team-future-picks";
import { TeamPayrollTable } from "@/components/teams/team-payroll-table";
import type { TeamContractsView, TeamFuturePicksView } from "@/data/queries/team-contracts";
import type { TeamDraftAssetsPresentation } from "@/data/types/front-office";
import type { TeamPayrollPresentation } from "@/data/types/front-office";
import type { TeamAssetLedger } from "@/data/types/team-assets";
import { AppLink } from "@/components/ui/app-link";
import { type } from "@/lib/design-system";
import { formatUsdCompact } from "@/lib/format-money";
import { cn } from "@/lib/utils";

function CapTile({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-2">
      <p className={cn(type.caption, "text-muted-foreground")}>{label}</p>
      <p className={cn(type.bodySm, "font-bold tabular-nums", tone)}>{value}</p>
    </div>
  );
}

function BrefPayrollSummary({ contracts, payrollHref }: { contracts: TeamContractsView; payrollHref?: string }) {
  const cap = contracts.salaryCap ?? null;
  const payroll = contracts.totals?.years[0] ?? null;
  const space = cap != null && payroll != null ? cap - payroll : null;
  return (
    <section className="flex flex-col gap-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <CapTile label={`${contracts.capSeason ?? ""} salary cap`.trim()} value={cap != null ? formatUsdCompact(cap) : "—"} />
        <CapTile label="Payroll" value={payroll != null ? formatUsdCompact(payroll) : "—"} />
        <CapTile
          label={space != null && space < 0 ? "Over the cap by" : "Cap space"}
          value={space != null ? formatUsdCompact(Math.abs(space)) : "—"}
          tone={
            space == null
              ? undefined
              : space < 0
                ? "text-amber-700 dark:text-amber-400"
                : "text-positive"
          }
        />
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <PayrollColorKey />
        {payrollHref ? (
          <Link href={payrollHref} className={cn(type.caption, "font-semibold underline-offset-2 hover:underline")}>
            Full payroll and notes →
          </Link>
        ) : null}
      </div>
      <BrefPayrollTable data={contracts} compact />
      <p className={cn(type.caption, "text-muted-foreground")}>
        Payroll is every listed salary for this season, including deals that aren&apos;t fully guaranteed. Cap
        space leaves out cap holds, dead money and exceptions.
      </p>
    </section>
  );
}

function capSpaceLabel(payroll: TeamPayrollPresentation): string | null {
  const cap = payroll.capContext.salaryCap;
  const commitments = payroll.summary.playerSalaryCommitments;
  if (cap == null || commitments == null) return null;
  return formatUsdCompact(cap - commitments);
}

/**
 * Team Cap / Assets: Basketball-Reference payroll, Spotrac future picks and
 * draft rights, with the front-office snapshot as the fallback.
 */
export function TeamAssetsSection({
  ledger,
  payroll,
  draftAssets,
  payrollHref,
  draftAssetsHref,
  contracts,
  futurePicks,
}: {
  ledger: TeamAssetLedger;
  payroll?: TeamPayrollPresentation | null;
  draftAssets?: TeamDraftAssetsPresentation | null;
  contracts?: TeamContractsView | null;
  futurePicks?: TeamFuturePicksView | null;
  payrollHref?: string;
  draftAssetsHref?: string;
}) {
  const blocked = ledger.categories.filter(
    (c) =>
      c.availability === "blocked_pending_structured_source" &&
      !(futurePicks && c.id === "draft_capital") &&
      !(contracts && c.id === "draft_rights")
  );
  const capSpace = payroll ? capSpaceLabel(payroll) : null;

  return (
    <div className="flex flex-col gap-6">
      {contracts ? (
        <BrefPayrollSummary contracts={contracts} payrollHref={payrollHref} />
      ) : payroll && payroll.contractRows.length > 0 ? (
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
                    : "text-positive"
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

      {futurePicks ? (
        <section className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className={cn(type.bodySm, "font-bold tracking-tight")}>Future draft picks</h3>
            {draftAssetsHref ? (
              <Link
                href={draftAssetsHref}
                className={cn(type.caption, "font-semibold underline-offset-2 hover:underline")}
              >
                Picks and draft rights →
              </Link>
            ) : null}
          </div>
          <TeamFuturePicksTable data={futurePicks} />
          <FuturePicksSourceNote data={futurePicks} />
        </section>
      ) : draftAssets ? (
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

      {contracts ? (
        <section className="flex flex-col gap-2">
          <h3 className={cn(type.bodySm, "font-bold tracking-tight")}>Draft rights</h3>
          <TeamDraftRightsTable data={contracts} />
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
                      data unavailable:{" "}
                    </>
                  ) : null}
                  {c.id === "draft_capital" ? (
                    <>
                      <MetricHelp conceptId="draft_capital">
                        Traded pick ledger
                      </MetricHelp>
                      :{" "}
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
        {ledger.genealogyUiReady
          ? "Pick and exception genealogy is available for covered assets."
          : "Pick and exception genealogy is incomplete for this franchise, so treat asset history as partial."}{" "}
        ·{" "}
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
