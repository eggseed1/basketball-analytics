import Link from "next/link";

import { MetricHelp } from "@/components/learn/metric-help";
import { TeamDraftAssetsTable } from "@/components/teams/team-draft-assets-table";
import { TeamDraftRightsTable } from "@/components/teams/team-draft-rights-table";
import { FuturePicksSourceNote, TeamFuturePicksTable } from "@/components/teams/team-future-picks";
import type { TeamContractsView, TeamFuturePicksView } from "@/data/queries/team-contracts";
import type { TeamDraftAssetsPresentation } from "@/data/types/front-office";
import type { TeamPayrollPresentation } from "@/data/types/front-office";
import type { TeamAssetLedger } from "@/data/types/team-assets";
import { AppLink } from "@/components/ui/app-link";
import { type } from "@/lib/design-system";
import { formatPct } from "@/lib/format";
import { formatUsdCompact } from "@/lib/format-money";
import { cn } from "@/lib/utils";

const OVER_TONE = "text-amber-700 dark:text-amber-400";

function CapTile({ label, value, tone, tip }: { label: string; value: string; tone?: string; tip?: string }) {
  return (
    <div data-stat-tile data-tip={tip} className="rounded-md border border-border/70 bg-muted/20 px-3 py-2">
      <p className={cn(type.caption, "text-muted-foreground")}>{label}</p>
      <p className={cn(type.bodySm, "font-bold tabular-nums", tone)}>{value}</p>
    </div>
  );
}

function CapTiles({
  capLabel,
  cap,
  payrollLabel,
  payroll,
}: {
  capLabel: string;
  cap: number | null;
  payrollLabel: string;
  payroll: number | null;
}) {
  const space = cap != null && payroll != null ? cap - payroll : null;
  const capShare = cap != null && cap > 0 && payroll != null ? payroll / cap : null;
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <CapTile label={capLabel} value={cap != null ? formatUsdCompact(cap) : "—"} />
      <CapTile
        label={payrollLabel}
        value={payroll != null ? formatUsdCompact(payroll) : "—"}
        tip={capShare != null ? `${formatPct(capShare, 0)} of the salary cap` : undefined}
      />
      <CapTile
        tip={space != null ? "Salary cap minus player salary commitments" : undefined}
        label={space != null && space < 0 ? "Over the cap by" : "Cap space"}
        value={space != null ? formatUsdCompact(Math.abs(space)) : "—"}
        tone={space == null ? undefined : space < 0 ? OVER_TONE : "text-positive"}
      />
    </div>
  );
}

/**
 * Team Cap / Assets: Basketball-Reference payroll, Spotrac future picks and
 * draft rights, with the front-office snapshot as the fallback.
 */
export function TeamAssetsSection({
  ledger,
  payroll,
  draftAssets,
  contracts,
  futurePicks,
  view,
}: {
  ledger: TeamAssetLedger;
  payroll?: TeamPayrollPresentation | null;
  draftAssets?: TeamDraftAssetsPresentation | null;
  contracts?: TeamContractsView | null;
  futurePicks?: TeamFuturePicksView | null;
  view: "summary" | "picks";
}) {
  if (view === "picks") {
    return (
      <div className="flex flex-col gap-6">
        {futurePicks ? (
          <section className="flex flex-col gap-2">
            <h3 className={cn(type.bodySm, "font-bold tracking-tight")}>Future draft picks</h3>
            <TeamFuturePicksTable data={futurePicks} />
            <FuturePicksSourceNote data={futurePicks} />
          </section>
        ) : draftAssets ? (
          <section className="flex flex-col gap-2">
            <h3 className={cn(type.bodySm, "font-bold tracking-tight")}>Future draft picks</h3>
            <TeamDraftAssetsTable data={draftAssets} compact />
          </section>
        ) : (
          <p className={cn(type.bodySm, "text-muted-foreground")}>Future pick data is unavailable for this franchise.</p>
        )}

        {contracts ? (
          <section className="flex flex-col gap-2">
            <h3 className={cn(type.bodySm, "font-bold tracking-tight")}>Draft rights</h3>
            <p className={cn(type.caption, "text-muted-foreground")}>
              Players the team drafted or traded for who haven&apos;t signed an NBA contract. The team keeps their
              rights if they come over.
            </p>
            <TeamDraftRightsTable data={contracts} />
          </section>
        ) : null}
      </div>
    );
  }

  const blocked = ledger.categories.filter(
    (c) =>
      c.availability === "blocked_pending_structured_source" &&
      !(futurePicks && c.id === "draft_capital") &&
      !(contracts && c.id === "draft_rights")
  );

  return (
    <div className="flex flex-col gap-6">
      {contracts ? (
        <section className="flex flex-col gap-2">
          <CapTiles
            capLabel={`${contracts.capSeason ?? ""} salary cap`.trim()}
            cap={contracts.salaryCap ?? null}
            payrollLabel="Payroll"
            payroll={contracts.totals?.years[0] ?? null}
          />
          <p className={cn(type.caption, "text-muted-foreground")}>
            Payroll is every listed salary for this season, including deals that aren&apos;t fully guaranteed. Cap
            space leaves out cap holds, dead money and exceptions.
          </p>
        </section>
      ) : payroll && payroll.contractRows.length > 0 ? (
        <section className="flex flex-col gap-2">
          <CapTiles
            capLabel="Salary cap"
            cap={payroll.capContext.salaryCap}
            payrollLabel="Commitments"
            payroll={payroll.summary.playerSalaryCommitments}
          />
          <p className={cn(type.caption, "text-muted-foreground")}>
            {payroll.season} roster · {payroll.summary.playersWithSalary} with salary. Cap space leaves out cap holds,
            dead money and exceptions.
          </p>
        </section>
      ) : (
        <p className={cn(type.bodySm, "text-muted-foreground")}>Payroll unavailable for this season.</p>
      )}

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
          Transaction log
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
