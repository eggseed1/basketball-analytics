import Link from "next/link";

import type { BrefSalaryCell } from "@/data/runtime/bref-team-contracts";
import type { TeamContractsView } from "@/data/queries/team-contracts";
import { BoardPlayerName } from "@/lib/board-compact-name";
import { type } from "@/lib/design-system";
import { formatUsdDollars } from "@/lib/format-money";
import { cn } from "@/lib/utils";

const PLAYER_OPTION = "font-medium text-emerald-700 dark:text-emerald-400";
const TEAM_OPTION = "font-medium text-sky-700 dark:text-sky-400";

function shortSeason(season: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(season);
  return m ? `${m[1].slice(2)}-${m[2]}` : season;
}

function cellClass(cell: BrefSalaryCell): string {
  if (!cell) return "text-muted-foreground";
  return cn(
    cell.option === "player" ? PLAYER_OPTION : cell.option === "team" ? TEAM_OPTION : "text-foreground",
    cell.notGuaranteed && "italic"
  );
}

function PlayerCell({ name, href }: { name: string; href?: string }) {
  return href ? (
    <Link
      href={href}
      className="block min-w-0 font-semibold text-foreground underline-offset-2 hover:underline"
      title={name}
    >
      <BoardPlayerName name={name} />
    </Link>
  ) : (
    <span className="block min-w-0 font-semibold" title={name}>
      <BoardPlayerName name={name} />
    </span>
  );
}

export function PayrollColorKey() {
  return (
    <p className={cn(type.caption, "text-muted-foreground")}>
      <span className={PLAYER_OPTION}>Player option</span> · <span className={TEAM_OPTION}>Team option</span> ·{" "}
      <span className="italic">Italic</span> = not fully guaranteed
    </p>
  );
}

/** Basketball-Reference's team payroll grid: one row per contract, one column per season. */
export function BrefPayrollTable({
  data,
  compact = false,
  className,
}: {
  data: TeamContractsView;
  compact?: boolean;
  className?: string;
}) {
  const seasons = compact ? data.seasons.slice(0, 4) : data.seasons;
  return (
    <div className={cn("overflow-x-auto rounded-md border border-border/80", className)}>
      <table className={cn("w-full min-w-[560px] border-collapse", compact ? type.caption : "text-sm")}>
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left">
            <th rowSpan={2} className="sticky left-0 z-[1] bg-muted/95 px-2 py-1.5 font-semibold">
              Player
            </th>
            <th rowSpan={2} className="px-2 py-1.5 text-right font-semibold tabular-nums">
              Age
            </th>
            <th
              colSpan={seasons.length}
              className="border-b border-border/60 px-2 py-1 text-center text-[10px] font-bold uppercase tracking-wide text-muted-foreground"
            >
              Salary
            </th>
            <th rowSpan={2} className="px-2 py-1.5 text-right font-semibold tabular-nums">
              Guaranteed
            </th>
          </tr>
          <tr className="border-b border-border bg-muted/30 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {seasons.map((season) => (
              <th key={season} className="whitespace-nowrap px-2 py-1 text-right tabular-nums">
                {shortSeason(season)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row) => (
            <tr key={row.brefId} className="border-b border-border/50 align-middle hover:bg-muted/20">
              <td className="sticky left-0 z-[1] max-w-[8rem] bg-background px-2 py-1.5 sm:max-w-[12rem]">
                <PlayerCell name={row.name} href={data.hrefs[row.brefId]} />
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{row.age ?? "—"}</td>
              {seasons.map((season, i) => {
                const cell = row.years[i] ?? null;
                return (
                  <td
                    key={season}
                    className={cn("px-2 py-1.5 text-right tabular-nums", cellClass(cell))}
                  >
                    {cell ? formatUsdDollars(cell.amount) : ""}
                  </td>
                );
              })}
              <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                {row.guaranteed != null ? formatUsdDollars(row.guaranteed) : ""}
              </td>
            </tr>
          ))}
        </tbody>
        {data.totals ? (
          <tfoot>
            <tr className="border-t-2 border-border bg-muted/30 font-bold">
              <td className="sticky left-0 z-[1] bg-muted/95 px-2 py-2" colSpan={2}>
                Team totals
              </td>
              {seasons.map((season, i) => (
                <td key={season} className="px-2 py-2 text-right tabular-nums">
                  {data.totals?.years[i] != null ? formatUsdDollars(data.totals.years[i]) : ""}
                </td>
              ))}
              <td className="px-2 py-2 text-right tabular-nums">
                {data.totals.guaranteed != null ? formatUsdDollars(data.totals.guaranteed) : ""}
              </td>
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

/** One plain line per contract: options, guarantees, how and when he signed. */
export function BrefPayrollNotes({ data }: { data: TeamContractsView }) {
  const rows = data.rows.filter((r) => data.notes[r.brefId]);
  if (!rows.length) return null;
  return (
    <div className="overflow-x-auto rounded-md border border-border/80">
      <table className="w-full min-w-[480px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left">
            <th className="px-2 py-1.5 font-semibold">Player</th>
            <th className="px-2 py-1.5 font-semibold">Notes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.brefId} className="border-b border-border/50 align-top">
              <td className="w-[11rem] px-2 py-1.5">
                <PlayerCell name={row.name} href={data.hrefs[row.brefId]} />
              </td>
              <td className="px-2 py-1.5 text-muted-foreground">{data.notes[row.brefId]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** "2026-27 salary cap · Largest guarantee" line from the top of the BRef page. */
export function BrefPayrollFacts({ data }: { data: TeamContractsView }) {
  const largest = data.largestGuarantee;
  return (
    <dl className={cn(type.bodySm, "flex flex-wrap gap-x-6 gap-y-1")}>
      {data.salaryCap != null ? (
        <div className="flex gap-1.5">
          <dt className="font-semibold">{data.capSeason} salary cap:</dt>
          <dd className="tabular-nums">{formatUsdDollars(data.salaryCap)}</dd>
        </div>
      ) : null}
      {largest ? (
        <div className="flex gap-1.5">
          <dt className="font-semibold">Largest guarantee:</dt>
          <dd>
            {largest.brefId && data.hrefs[largest.brefId] ? (
              <Link href={data.hrefs[largest.brefId]!} className="underline-offset-2 hover:underline">
                {largest.name}
              </Link>
            ) : (
              largest.name
            )}{" "}
            <span className="tabular-nums">({formatUsdDollars(largest.amount)})</span>
          </dd>
        </div>
      ) : null}
    </dl>
  );
}
