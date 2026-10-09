"use client";

import Link from "next/link";
import type { CSSProperties } from "react";

import { TeamLogo } from "@/components/brand/team-logo";
import { useTeamVizParams } from "@/components/standings/team-viz-hub";
import type { ContractSurplusMeta, TeamSurplusContract, TeamSurplusRow } from "@/lib/contract-surplus";
import { type } from "@/lib/design-system";
import { formatUsdCompact, formatUsdSignedCompact } from "@/lib/format-money";
import { teamSalaryHref } from "@/lib/team-destination";
import { cn } from "@/lib/utils";

const ROW =
  "grid grid-cols-[1.75rem_4.75rem_minmax(0,1fr)_4.75rem] items-center gap-2 sm:grid-cols-[2rem_5.5rem_minmax(0,1fr)_4.75rem_4.75rem_5.25rem]";

function tone(dollars: number): string {
  if (Math.abs(dollars) < 50_000) return "text-muted-foreground";
  return dollars > 0 ? "text-[var(--chart-3)]" : "text-destructive";
}

function contractLine(label: string, c: TeamSurplusContract | null): string | null {
  return c ? `${label}: ${c.name} ${formatUsdSignedCompact(c.surplus)}` : null;
}

export function TeamSurplusBoard({ rows, meta }: { rows: TeamSurplusRow[]; meta: ContractSurplusMeta }) {
  const { teamKeys, toggleTeam, conference } = useTeamVizParams();
  const shown = rows.filter((r) => !conference || r.conference === conference);
  const max = Math.max(...rows.map((r) => Math.abs(r.surplus)), 1);

  if (!shown.length) {
    return (
      <p className={cn(type.bodySm, "sports-card px-4 py-10 text-center text-muted-foreground")}>
        No contract estimates are available right now.
      </p>
    );
  }

  return (
    <section className="sports-card flex flex-col gap-3 p-4 sm:p-5" aria-labelledby="team-surplus-title">
      <div>
        <h2 id="team-surplus-title" className={type.heading}>
          Contract surplus
        </h2>
        <p className={cn(type.bodySm, "mt-1 text-muted-foreground")}>
          Contracts from {meta.capSeason} on · What each team&apos;s contracts are projected to be worth,
          minus what they pay. Ranked across all {rows.length} teams. Click a row to highlight it, or a
          team to open its contracts.
        </p>
      </div>

      <div
        aria-hidden
        className={cn(ROW, type.micro, "hidden font-semibold uppercase tracking-wide text-muted-foreground sm:grid")}
      >
        <span>#</span>
        <span>Team</span>
        <span />
        <span className="text-right">Worth</span>
        <span className="text-right">Salary</span>
        <span className="text-right">Surplus</span>
      </div>

      <ul className="flex flex-col gap-1" aria-label="Teams ranked by contract surplus">
        {shown.map((r, i) => {
          const highlighted = teamKeys.includes(r.teamKey);
          const positive = r.surplus > 0;
          const sub = [contractLine("Best", r.best), contractLine("Worst", r.worst)].filter(Boolean).join(" · ");
          return (
            <li
              key={r.teamId}
              onClick={() => toggleTeam(r.teamKey)}
              aria-current={highlighted || undefined}
              data-hover-item
              data-tip={`${r.name}: ${formatUsdSignedCompact(r.surplus)} across ${r.valued} contracts`}
              data-tip-sub={sub || undefined}
              className={cn(
                ROW,
                "cursor-pointer rounded-md px-1 py-1 transition-colors hover:bg-secondary/60",
                highlighted && "bg-secondary font-semibold"
              )}
            >
              <span className={cn(type.caption, "tabular-nums text-muted-foreground")}>{r.rank}</span>
              <span className="flex min-w-0 items-center gap-1.5">
                <TeamLogo teamKey={r.teamKey} size="xs" />
                <Link
                  href={teamSalaryHref(r.teamId, "contracts")}
                  onClick={(e) => e.stopPropagation()}
                  className={cn(type.bodySm, "font-semibold underline-offset-2 hover:underline")}
                >
                  {r.teamKey}
                </Link>
              </span>
              <span className="relative h-4" data-tip-anchor>
                <span aria-hidden className="absolute inset-y-[-2px] left-1/2 w-px bg-foreground/30" />
                <span
                  aria-hidden
                  data-motion-bar="x"
                  className="absolute inset-y-0 rounded-sm"
                  style={{
                    ...({ "--i": Math.min(i, 16) } as CSSProperties),
                    transformOrigin: positive ? "left" : "right",
                    width: `${(Math.abs(r.surplus) / max) * 50}%`,
                    ...(positive ? { left: "50%" } : { right: "50%" }),
                    background: positive ? "var(--chart-3)" : "var(--destructive)",
                    opacity: highlighted ? 1 : 0.8,
                    outline: highlighted ? "1.5px solid var(--foreground)" : undefined,
                  }}
                />
              </span>
              <span className={cn(type.caption, "hidden text-right tabular-nums text-muted-foreground sm:block")}>
                {formatUsdCompact(r.worth)}
              </span>
              <span className={cn(type.caption, "hidden text-right tabular-nums text-muted-foreground sm:block")}>
                {formatUsdCompact(r.salary)}
              </span>
              <span className={cn(type.bodySm, "text-right font-semibold tabular-nums", tone(r.surplus))}>
                {formatUsdSignedCompact(r.surplus)}
              </span>
            </li>
          );
        })}
      </ul>

      <div className={cn(type.caption, "flex flex-col gap-1 text-muted-foreground")}>
        <p>
          Worth is what each player&apos;s projected wins would cost on the open market over the rest of
          his contract. Surplus is worth minus salary, with team options and non-guaranteed years
          counting only their upside and player options only their downside. A team&apos;s number adds up
          the middle estimate for each contract, and each of those has a wide range, so small gaps
          between teams don&apos;t mean much.
        </p>
        <p>
          {meta.leftOut
            ? `${meta.leftOut} contracts are left out of the totals, not counted as zero, because those players have too little recent NBA time to estimate. Waived salary isn't counted either. `
            : "Waived salary isn't counted. "}
          The same estimates appear in each team&apos;s Salary &amp; assets tab.
        </p>
      </div>
    </section>
  );
}
