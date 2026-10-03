import {
  BrefPayrollFacts,
  BrefPayrollNotes,
  BrefPayrollTable,
  PayrollColorKey,
} from "@/components/teams/bref-payroll-table";
import type { TeamContractsView } from "@/data/queries/team-contracts";
import type { TeamPayrollPresentation } from "@/data/types/front-office";
import { type } from "@/lib/design-system";
import { formatUsdCompact, formatUsdDollars } from "@/lib/format-money";
import { cn } from "@/lib/utils";

function CommitmentBars({ data }: { data: TeamContractsView }) {
  const bars = data.seasons
    .map((season, i) => ({
      season,
      total: data.totals?.years[i] ?? null,
      players: data.rows.filter((r) => r.years[i]).length,
    }))
    .filter((b): b is { season: string; total: number; players: number } => b.total != null);
  if (!bars.length) return null;
  const max = Math.max(...bars.map((b) => b.total), data.salaryCap ?? 0, 1);
  return (
    <ul className="flex flex-col gap-2.5" aria-label="Salary on the books by season">
      {bars.map((bar) => (
        <li key={bar.season} className="flex flex-col gap-1">
          <div className={cn(type.bodySm, "flex items-baseline justify-between gap-3")}>
            <span className="font-semibold tabular-nums">{bar.season}</span>
            <span className="tabular-nums text-muted-foreground">
              {formatUsdDollars(bar.total)} · {bar.players} {bar.players === 1 ? "player" : "players"}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-foreground/[0.08]">
            <div
              className="h-full rounded-full bg-foreground/70"
              style={{ width: `${Math.max(2, (bar.total / max) * 100)}%` }}
              title={formatUsdCompact(bar.total)}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Full Basketball-Reference style payroll page: facts, grid, notes. */
export function TeamContractsPageView({
  teamName,
  contracts,
  capContext,
}: {
  teamName: string;
  contracts: TeamContractsView;
  capContext?: TeamPayrollPresentation["capContext"] | null;
}) {
  const thresholds = capContext
    ? ([
        ["Luxury tax", capContext.luxuryTax],
        ["First apron", capContext.firstApron],
        ["Second apron", capContext.secondApron],
      ] as const)
    : [];
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payroll &amp; Contracts</p>
        <h1 className="text-3xl font-semibold tracking-tight">{teamName}</h1>
        <BrefPayrollFacts data={contracts} />
        {thresholds.some(([, v]) => v != null) ? (
          <p className={cn(type.caption, "text-muted-foreground")}>
            {thresholds
              .filter(([, v]) => v != null)
              .map(([label, v]) => `${label} ${formatUsdDollars(v)}`)
              .join(" · ")}
            {capContext?.source ? ` (${capContext.source})` : ""}
          </p>
        ) : null}
      </header>

      <section className="flex flex-col gap-3" aria-labelledby="payroll-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="payroll-heading" className="text-lg font-semibold">
            Payroll
          </h2>
          <PayrollColorKey />
        </div>
        <BrefPayrollTable data={contracts} />
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="books-heading">
        <h2 id="books-heading" className="text-lg font-semibold">
          Salary on the books
        </h2>
        <CommitmentBars data={contracts} />
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="notes-heading">
        <h2 id="notes-heading" className="text-lg font-semibold">
          Payroll notes
        </h2>
        <BrefPayrollNotes data={contracts} />
      </section>

      <p className={cn(type.caption, "text-muted-foreground")}>
        Salaries, options, guarantees and notes come from Basketball-Reference. A blank cell means no contract that
        season. Payroll counts every listed salary, guaranteed or not.{" "}
        <a href={contracts.sourceUrl} className="font-semibold underline-offset-2 hover:underline" rel="noreferrer" target="_blank">
          Source: Basketball-Reference
        </a>
      </p>
    </div>
  );
}
