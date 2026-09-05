import Link from "next/link";

import type {
  PlayerContractYear,
  TeamContractRow,
  TeamPayrollPresentation,
} from "@/data/types/front-office";
import { BoardPlayerName } from "@/lib/board-compact-name";
import { type } from "@/lib/design-system";
import { formatUsdDollars } from "@/lib/format-money";
import { cn } from "@/lib/utils";

function shortSeason(season: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(season);
  if (!m) return season;
  return `${m[1].slice(2)}-${m[2]}`;
}

function seasonColumns(rows: TeamContractRow[]): string[] {
  return Array.from(
    new Set(rows.flatMap((r) => r.years.map((y) => y.season)))
  ).sort();
}

function salaryForSeason(row: TeamContractRow, season: string): number | null {
  const year = row.years.find((y) => y.season === season);
  return year?.salary ?? null;
}

function yearCell(
  row: TeamContractRow,
  season: string
): PlayerContractYear | undefined {
  return row.years.find((y) => y.season === season);
}

function salaryCellClass(year: PlayerContractYear | undefined): string {
  if (!year?.salary) return "text-muted-foreground";
  switch (year.guaranteeStatus) {
    case "PARTIALLY_GUARANTEED":
    case "NON_GUARANTEED":
      return "italic text-foreground";
    default:
      break;
  }
  switch (year.optionType) {
    case "PLAYER_OPTION":
      return "font-medium text-emerald-700 dark:text-emerald-400";
    case "TEAM_OPTION":
      return "font-medium text-sky-700 dark:text-sky-400";
    default:
      return "font-medium text-foreground";
  }
}

function guaranteedTotal(row: TeamContractRow): number | null {
  if (row.guaranteedTotal != null) return row.guaranteedTotal;
  const known = row.years
    .map((y) => y.guaranteedAmount ?? y.salary)
    .filter((v): v is number => v != null);
  if (!known.length) return null;
  return known.reduce((a, b) => a + b, 0);
}

function sortedRows(rows: TeamContractRow[], anchorSeason: string) {
  return [...rows].sort((a, b) => {
    const as = salaryForSeason(a, anchorSeason) ?? -1;
    const bs = salaryForSeason(b, anchorSeason) ?? -1;
    return bs - as;
  });
}

export function TeamPayrollTable({
  data,
  compact = false,
  showTitle = true,
  className,
}: {
  data: TeamPayrollPresentation;
  compact?: boolean;
  showTitle?: boolean;
  className?: string;
}) {
  const seasons = seasonColumns(data.contractRows);
  const anchorSeason = data.season;
  const rows = sortedRows(data.contractRows, anchorSeason);

  const totalsBySeason = seasons.map((season) =>
    rows.reduce((sum, row) => {
      const salary = salaryForSeason(row, season);
      return sum + (salary ?? 0);
    }, 0)
  );
  const grandGuaranteed = rows.reduce((sum, row) => {
    const g = guaranteedTotal(row);
    return sum + (g ?? 0);
  }, 0);

  if (!rows.length) {
    return (
      <p className={cn(type.bodySm, "text-muted-foreground")}>
        No contract rows in this snapshot.
      </p>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {showTitle ? (
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3
            className={cn(
              compact ? type.bodySm : "text-lg",
              "font-bold tracking-tight"
            )}
          >
            Payroll
          </h3>
          <p className={cn(type.caption, "text-muted-foreground")}>
            <span className="italic">Italic</span> = not fully guaranteed ·{" "}
            <span className="font-medium text-emerald-700 dark:text-emerald-400">
              Green
            </span>{" "}
            = player option ·{" "}
            <span className="font-medium text-sky-700 dark:text-sky-400">
              Blue
            </span>{" "}
            = team option
          </p>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-md border border-border/80">
        <table
          className={cn(
            "w-full min-w-[520px] border-collapse",
            compact ? type.caption : "text-sm"
          )}
        >
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left">
              <th
                rowSpan={2}
                className="sticky left-0 z-[1] bg-muted/95 px-2 py-1.5 font-semibold"
              >
                Player
              </th>
              <th
                rowSpan={2}
                className="px-2 py-1.5 text-right font-semibold tabular-nums"
              >
                Age
              </th>
              <th
                colSpan={seasons.length}
                className="border-b border-border/60 px-2 py-1 text-center text-[10px] font-bold uppercase tracking-wide text-muted-foreground"
              >
                Salary
              </th>
              <th
                rowSpan={2}
                className="px-2 py-1.5 text-right font-semibold tabular-nums"
              >
                Guaranteed
              </th>
            </tr>
            <tr className="border-b border-border bg-muted/30 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {seasons.map((season) => (
                <th
                  key={season}
                  className="px-2 py-1 text-right tabular-nums"
                >
                  {shortSeason(season)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.contractId}
                className="border-b border-border/50 align-middle hover:bg-muted/20"
              >
                <td className="sticky left-0 z-[1] max-w-[7.5rem] bg-background px-2 py-1.5 sm:max-w-[12rem]">
                  <Link
                    href={row.href}
                    className="block min-w-0 font-semibold text-foreground underline-offset-2 hover:underline"
                    title={row.playerName}
                  >
                    <BoardPlayerName name={row.playerName} />
                  </Link>
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                  {row.age ?? "—"}
                </td>
                {seasons.map((season) => {
                  const year = yearCell(row, season);
                  if (!year || year.salary == null) {
                    return (
                      <td
                        key={season}
                        className="px-2 py-1.5 text-right text-muted-foreground"
                      >
                        —
                      </td>
                    );
                  }
                  return (
                    <td
                      key={season}
                      className={cn(
                        "px-2 py-1.5 text-right tabular-nums",
                        salaryCellClass(year)
                      )}
                    >
                      {formatUsdDollars(year.salary)}
                    </td>
                  );
                })}
                <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                  {formatUsdDollars(guaranteedTotal(row))}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-muted/30 font-bold">
              <td
                className="sticky left-0 z-[1] bg-muted/95 px-2 py-2"
                colSpan={2}
              >
                Team totals
              </td>
              {totalsBySeason.map((total, i) => (
                <td
                  key={seasons[i]}
                  className="px-2 py-2 text-right tabular-nums"
                >
                  {total > 0 ? formatUsdDollars(total) : "—"}
                </td>
              ))}
              <td className="px-2 py-2 text-right tabular-nums">
                {grandGuaranteed > 0 ? formatUsdDollars(grandGuaranteed) : "—"}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {!compact ? (
        <p className={cn(type.caption, "text-muted-foreground")}>
          {data.summary.playersWithSalary} with salary ·{" "}
          {data.summary.playersWithoutSalary} on roster without matched salary ·
          Snapshot {data.season}
        </p>
      ) : null}
    </div>
  );
}
