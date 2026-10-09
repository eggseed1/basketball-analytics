"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { CSSProperties } from "react";

import { TeamLogo } from "@/components/brand/team-logo";
import { useTeamVizParams } from "@/components/standings/team-viz-hub";
import {
  parseTeamSurplusSpan,
  TEAM_SURPLUS_SPANS,
  teamSurplusSpanParam,
  type ContractSurplusMeta,
  type TeamSurplusContract,
  type TeamSurplusRow,
  type TeamSurplusSpan,
} from "@/lib/contract-surplus";
import { type } from "@/lib/design-system";
import { formatUsdCompact, formatUsdSignedCompact } from "@/lib/format-money";
import { teamSalaryHref } from "@/lib/team-destination";
import { cn } from "@/lib/utils";

const ROW =
  "grid grid-cols-[1.75rem_4.75rem_minmax(0,1fr)_4.75rem] items-center gap-2 sm:grid-cols-[2rem_5.5rem_minmax(0,1fr)_4.75rem_4.75rem_5.25rem]";

function spanLabel(span: TeamSurplusSpan, capSeason: string): string {
  if (span === "perSeason") return "Per season";
  if (span === "capSeason") return `${capSeason} only`;
  return "Whole contract";
}

function spanBlurb(span: TeamSurplusSpan, capSeason: string, teams: number): string {
  if (span === "perSeason") {
    return `Each contract's surplus divided by the seasons left on it, then added up for the team, so a four-year deal counts as much as a one-year deal. Ranked across all ${teams} teams.`;
  }
  if (span === "capSeason") {
    return `What each team's contracts are projected to be worth in ${capSeason} alone, minus what they pay that season. Across the league this comes out close to even. Ranked across all ${teams} teams.`;
  }
  return `What each team's contracts are projected to be worth over every season left on them, minus what they pay. Long, expensive deals keep adding seasons here while cheap rookie deals run out sooner, so most teams land below zero. Ranked across all ${teams} teams.`;
}

function tone(dollars: number): string {
  if (Math.abs(dollars) < 50_000) return "text-muted-foreground";
  return dollars > 0 ? "text-[var(--chart-3)]" : "text-destructive";
}

function contractLine(label: string, c: TeamSurplusContract | null, per: string): string | null {
  return c ? `${label}: ${c.name} ${formatUsdSignedCompact(c.surplus)}${per}` : null;
}

export function TeamSurplusBoard({ rows, meta }: { rows: TeamSurplusRow[]; meta: ContractSurplusMeta }) {
  const { teamKeys, toggleTeam, conference, replaceParams } = useTeamVizParams();
  const span = parseTeamSurplusSpan(useSearchParams().get("span"));
  const per = span === "perSeason" ? " a season" : "";
  const ranked = [...rows].sort((a, b) => a.spans[span].rank - b.spans[span].rank);
  const shown = ranked.filter((r) => !conference || r.conference === conference);
  const max = Math.max(...rows.map((r) => Math.abs(r.spans[span].surplus)), 1);

  if (!shown.length) {
    return (
      <p className={cn(type.bodySm, "sports-card px-4 py-10 text-center text-muted-foreground")}>
        No contract estimates are available right now.
      </p>
    );
  }

  return (
    <section className="sports-card flex flex-col gap-3 p-4 sm:p-5" aria-labelledby="team-surplus-title">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div>
          <h2 id="team-surplus-title" className={type.heading}>
            Contract surplus
          </h2>
          <p className={cn(type.bodySm, "mt-1 text-muted-foreground")}>
            {span === "capSeason" ? "" : `Contracts from ${meta.capSeason} on · `}
            {spanBlurb(span, meta.capSeason, rows.length)} Click a row
            to highlight it, or a team to open its contracts.
          </p>
        </div>
        <div
          className="flex shrink-0 items-center gap-1 self-start rounded-md border border-border/70 frost-surface p-0.5"
          role="group"
          aria-label="Count surplus over"
        >
          {TEAM_SURPLUS_SPANS.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={span === s}
              onClick={() => replaceParams({ span: teamSurplusSpanParam(s) })}
              className={cn(
                type.caption,
                "glass-pill whitespace-nowrap rounded-md px-2.5 py-1 font-semibold transition-colors",
                span === s ? "glass-pill-active" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {spanLabel(s, meta.capSeason)}
            </button>
          ))}
        </div>
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

      <ul className="flex flex-col gap-1" aria-label={`Teams ranked by contract surplus, ${spanLabel(span, meta.capSeason).toLowerCase()}`}>
        {shown.map((r, i) => {
          const t = r.spans[span];
          const highlighted = teamKeys.includes(r.teamKey);
          const positive = t.surplus > 0;
          const sub = [contractLine("Best", t.best, per), contractLine("Worst", t.worst, per)].filter(Boolean).join(" · ");
          const when = span === "capSeason" ? ` in ${meta.capSeason}` : per;
          return (
            <li
              key={r.teamId}
              onClick={() => toggleTeam(r.teamKey)}
              aria-current={highlighted || undefined}
              data-hover-item
              data-tip={`${r.name}: ${formatUsdSignedCompact(t.surplus)}${when} across ${t.contracts} contracts`}
              data-tip-sub={sub || undefined}
              className={cn(
                ROW,
                "cursor-pointer rounded-md px-1 py-1 transition-colors hover:bg-secondary/60",
                highlighted && "bg-secondary font-semibold"
              )}
            >
              <span className={cn(type.caption, "tabular-nums text-muted-foreground")}>{t.rank}</span>
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
                    width: `${(Math.abs(t.surplus) / max) * 50}%`,
                    ...(positive ? { left: "50%" } : { right: "50%" }),
                    background: positive ? "var(--chart-3)" : "var(--destructive)",
                    opacity: highlighted ? 1 : 0.8,
                    outline: highlighted ? "1.5px solid var(--foreground)" : undefined,
                  }}
                />
              </span>
              <span className={cn(type.caption, "hidden text-right tabular-nums text-muted-foreground sm:block")}>
                {formatUsdCompact(t.worth)}
              </span>
              <span className={cn(type.caption, "hidden text-right tabular-nums text-muted-foreground sm:block")}>
                {formatUsdCompact(t.salary)}
              </span>
              <span className={cn(type.bodySm, "text-right font-semibold tabular-nums", tone(t.surplus))}>
                {formatUsdSignedCompact(t.surplus)}
              </span>
            </li>
          );
        })}
      </ul>

      <div className={cn(type.caption, "flex flex-col gap-1 text-muted-foreground")}>
        <p>
          Worth is what each player&apos;s projected wins would cost on the open market. Surplus is worth
          minus salary, with team options and non-guaranteed years counting only their upside and player
          options only their downside. A team&apos;s number adds up the middle estimate for each contract,
          and each of those has a wide range, so small gaps between teams don&apos;t mean much.
          {span === "perSeason" ? " Worth and Salary are per season the same way." : ""}
        </p>
        <p>
          {meta.leftOut
            ? `${meta.leftOut} contracts are left out of the totals, not counted as zero, because those players have too little recent NBA time to estimate. Most are incoming rookies on cheap deals, so teams with several of them are probably better off than shown. Waived salary isn't counted either. `
            : "Waived salary isn't counted. "}
          The same estimates appear in each team&apos;s Salary &amp; assets tab.
        </p>
      </div>
    </section>
  );
}
