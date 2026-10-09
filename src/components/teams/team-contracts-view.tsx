import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { surplusTone } from "@/components/players/player-contract-transactions";
import { BrefPayrollTable, PayrollColorKey } from "@/components/teams/bref-payroll-table";
import { TeamContractValueChart } from "@/components/teams/team-contract-value";
import type { TeamContractsView } from "@/data/queries/team-contracts";
import { getTeamContractValue } from "@/data/runtime/contract-value";
import { getTeamPayoff, payoffWaiting } from "@/data/runtime/salary-payoff";
import { SalaryPayoffWaiting } from "@/components/charts/salary-payoff-waiting";
import { TeamSalaryPayoff } from "@/components/teams/team-salary-payoff";
import type { TeamPayrollPresentation } from "@/data/types/front-office";
import { type } from "@/lib/design-system";
import { formatUsdCompact, formatUsdSignedCompact } from "@/lib/format-money";
import { teamChartColor } from "@/lib/nba-brand";
import { cn } from "@/lib/utils";

type CapContext = TeamPayrollPresentation["capContext"];

/** The franchise color that reads on the current theme's surface. */
function teamAccent(teamKey: string): string {
  const light = teamChartColor(teamKey, { surface: "light" }).color;
  const dark = teamChartColor(teamKey, { surface: "dark" }).color;
  return `color-mix(in oklab, ${dark} var(--surface-dark-mix, 0%), ${light})`;
}

const playerIdFromHref = (href?: string) => href?.match(/^\/players\/([^/?#]+)/)?.[1];

function signedRoom(payroll: number, line: number): { text: string; over: boolean } {
  const diff = payroll - line;
  return { text: `${formatUsdCompact(Math.abs(diff))} ${diff > 0 ? "over" : "under"}`, over: diff > 0 };
}

const OVER_TONE = "text-amber-700 dark:text-amber-400";

/** Where this season's payroll sits against the cap, the tax line and both aprons. */
function CapLadder({
  payroll,
  cap,
  capContext,
  accent,
  season,
}: {
  payroll: number;
  cap: number | null;
  capContext?: CapContext | null;
  accent: string;
  season?: string;
}) {
  const lines = [
    { label: "Cap", name: "Salary cap", value: cap },
    { label: "Tax", name: "Luxury tax", value: capContext?.luxuryTax ?? null },
    { label: "Apron 1", name: "First apron", value: capContext?.firstApron ?? null },
    { label: "Apron 2", name: "Second apron", value: capContext?.secondApron ?? null },
  ].filter((l): l is { label: string; name: string; value: number } => l.value != null);
  if (!lines.length) return null;
  const step = 10_000_000;
  const low = Math.floor((Math.min(capContext?.minimumTeamSalary ?? lines[0].value, payroll) * 0.85) / step) * step;
  const high = Math.ceil((Math.max(...lines.map((l) => l.value), payroll) * 1.05) / step) * step;
  const pos = (v: number) => `${((v - low) / (high - low)) * 100}%`;

  return (
    <div className="flex flex-col gap-4">
      <div className="relative pb-6 pt-6" aria-hidden>
        <div className="relative h-4 w-full overflow-hidden rounded-full bg-foreground/[0.07]">
          <div data-motion-bar="x" className="h-full rounded-full" style={{ width: pos(payroll), background: accent }} />
        </div>
        {lines.map((line, i) => (
          <div key={line.label} className="absolute inset-y-0" style={{ left: pos(line.value) }}>
            <div
              data-motion-bar="y"
              className="absolute top-5 h-6 w-px -translate-x-1/2 bg-foreground/50"
              style={{ "--i": 6 + i * 2 } as CSSProperties}
            />
            <span
              className={cn(
                type.micro,
                "absolute hidden -translate-x-1/2 whitespace-nowrap font-semibold text-muted-foreground sm:block",
                i % 2 === 0 ? "top-0" : "bottom-0"
              )}
            >
              {line.label}
            </span>
          </div>
        ))}
        <span className={cn(type.micro, "absolute bottom-0 left-0 tabular-nums text-muted-foreground")}>
          {formatUsdCompact(low)}
        </span>
        <span className={cn(type.micro, "absolute bottom-0 right-0 tabular-nums text-muted-foreground")}>
          {formatUsdCompact(high)}
        </span>
      </div>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {lines.map((line) => {
          const room = signedRoom(payroll, line.value);
          return (
            <li key={line.label} className="rounded-md border border-border/70 px-3 py-2">
              <p className={cn(type.caption, "font-semibold text-muted-foreground")}>
                {line.name}{" "}
                <span className="tabular-nums font-normal">{formatUsdCompact(line.value)}</span>
              </p>
              <p className={cn(type.bodySm, "font-bold tabular-nums", room.over ? OVER_TONE : "text-positive")}>
                {room.text}
              </p>
            </li>
          );
        })}
      </ul>
      <p className={cn(type.caption, "text-muted-foreground")}>
        The bar is {season ?? "this season"}&apos;s payroll: {formatUsdCompact(payroll)}, counting every listed
        salary, guaranteed or not. It isn&apos;t an official cap sheet, so cap holds, dead money and exceptions
        aren&apos;t in it.
      </p>
    </div>
  );
}

/** One column per season: what's already committed, and to how many players. */
function CommitmentColumns({ data, accent }: { data: TeamContractsView; accent: string }) {
  const bars = data.seasons
    .map((season, i) => ({
      season,
      total: data.totals?.years[i] ?? null,
      players: data.rows.filter((r) => r.years[i]).length,
    }))
    .filter((b): b is { season: string; total: number; players: number } => b.total != null);
  if (!bars.length) return null;
  const max = Math.max(...bars.map((b) => b.total), 1);
  return (
    <ul data-hover-group className="flex h-56 items-end gap-2 sm:gap-3" aria-label="Salary on the books by season">
      {bars.map((bar, i) => (
        <li
          key={bar.season}
          data-hover-item
          data-tip={bar.season}
          data-tip-sub={`${formatUsdCompact(bar.total)} · ${bar.players} ${bar.players === 1 ? "player" : "players"}`}
          className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5"
        >
          <span className={cn(type.caption, "font-semibold tabular-nums")}>{formatUsdCompact(bar.total)}</span>
          <div
            data-motion-bar="y"
            data-tip-anchor
            className="w-full max-w-24 rounded-t-md"
            style={
              {
                height: `${Math.max(3, (bar.total / max) * 70)}%`,
                background: accent,
                opacity: i === 0 ? 1 : Math.max(0.45, 0.85 - i * 0.1),
                "--i": i * 2,
              } as CSSProperties
            }
          />
          <span className={cn(type.caption, "font-semibold tabular-nums")}>{bar.season}</span>
          <span className={cn(type.micro, "text-muted-foreground")}>
            {bar.players} {bar.players === 1 ? "player" : "players"}
          </span>
        </li>
      ))}
    </ul>
  );
}

function PayrollNotesList({ data, teamKey }: { data: TeamContractsView; teamKey: string }) {
  const rows = data.rows.filter((r) => data.notes[r.brefId]);
  if (!rows.length) return null;
  return (
    <ul className="grid gap-x-8 lg:grid-cols-2">
      {rows.map((row) => {
        const href = data.hrefs[row.brefId];
        return (
          <li
            key={row.brefId}
            className="flex gap-3 border-t border-border/60 py-2.5 first:border-t-0 lg:[&:nth-child(2)]:border-t-0"
          >
            <PlayerHeadshot playerId={playerIdFromHref(href)} name={row.name} teamKey={teamKey} size="xs" />
            <div className="min-w-0">
              {href ? (
                <Link href={href} className={cn(type.bodySm, "font-semibold underline-offset-2 hover:underline")}>
                  {row.name}
                </Link>
              ) : (
                <span className={cn(type.bodySm, "font-semibold")}>{row.name}</span>
              )}
              <p className={cn(type.bodySm, "text-muted-foreground")}>{data.notes[row.brefId]}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Panel({ title, id, aside, children, className }: { title: string; id: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section
      className={cn("sports-card flex min-w-0 flex-col gap-3 p-4 sm:p-5", className)}
      aria-labelledby={id}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={id} className={cn(type.heading, "scroll-mt-52")}>
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Contracts subtab: cap position, contract grid, contract value, future books, notes. */
export function TeamContractsPageView({
  teamKey,
  franchiseId,
  contracts,
  capContext,
  season,
  seasonHref,
}: {
  teamKey: string;
  franchiseId: string;
  contracts: TeamContractsView;
  capContext?: CapContext | null;
  /** Season picked on the team page; salary paid off follows it. */
  season: string;
  /** This view in another season. */
  seasonHref: (season: string) => string;
}) {
  const accent = teamAccent(teamKey);
  const payroll = contracts.totals?.years[0] ?? null;
  const cap = contracts.salaryCap ?? capContext?.salaryCap ?? null;
  const hasNotes = contracts.rows.some((r) => contracts.notes[r.brefId]);
  const contractValue = getTeamContractValue(franchiseId);
  const waiting = payoffWaiting(season);
  const payoff = waiting ? null : getTeamPayoff(franchiseId, season);
  const payoffNow = payoff?.total.pct.at(-1) ?? null;

  return (
    <div
      data-motion-stack
      className="flex flex-col gap-6"
      style={
        {
          "--team-primary": accent,
          "--team-accent-soft": `color-mix(in oklab, ${accent} 9%, transparent)`,
        } as CSSProperties
      }
    >
      {payroll != null ? (
        <Panel title="Cap position" id="cap-heading">
          <CapLadder payroll={payroll} cap={cap} capContext={capContext} accent={accent} season={contracts.capSeason} />
        </Panel>
      ) : null}

      <Panel title="Contracts" id="payroll-heading" aside={<PayrollColorKey />}>
        <BrefPayrollTable data={contracts} teamKey={teamKey} />
        <p className={cn(type.caption, "text-muted-foreground")}>
          A blank cell means no contract that season. Totals count every listed salary, guaranteed or not.
        </p>
      </Panel>

      {contractValue ? (
        <Panel
          title="Contract value"
          id="value-heading"
          aside={
            <span className={cn(type.bodySm, "font-semibold tabular-nums", surplusTone(contractValue.surplus))}>
              {formatUsdSignedCompact(contractValue.surplus)} combined
            </span>
          }
        >
          <TeamContractValueChart value={contractValue} contracts={contracts} teamKey={teamKey} />
        </Panel>
      ) : null}

      {waiting ? (
        <Panel title={`Salary played off · ${waiting.season}`} id="payoff-heading">
          <SalaryPayoffWaiting
            waiting={waiting}
            previousHref={waiting.previous ? seasonHref(waiting.previous) : null}
          />
        </Panel>
      ) : null}

      {payoff ? (
        <Panel
          title={`Salary played off · ${payoff.meta.season}`}
          id="payoff-heading"
          aside={
            payoffNow != null ? (
              <span className={cn(type.caption, "tabular-nums text-muted-foreground")}>
                Roster total {Math.round(payoffNow)}%
              </span>
            ) : null
          }
        >
          <TeamSalaryPayoff payoff={payoff} />
        </Panel>
      ) : null}

      <Panel title="Salary on the books" id="books-heading">
        <CommitmentColumns data={contracts} accent={accent} />
        <p className={cn(type.caption, "text-muted-foreground")}>
          Money already committed for each season, before any new signings.
        </p>
      </Panel>

      {hasNotes ? (
        <Panel title="Contract notes" id="notes-heading">
          <PayrollNotesList data={contracts} teamKey={teamKey} />
        </Panel>
      ) : null}
    </div>
  );
}
