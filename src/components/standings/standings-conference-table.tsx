"use client";

import { TeamLogo } from "@/components/brand/team-logo";
import { TeamIdentity } from "@/components/teams/team-identity";
import type { StandingRow } from "@/data/types";
import { formatNumber } from "@/lib/format";
import { textLinkClassName, type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

const thBase =
  "py-2 font-semibold text-[12px] uppercase tracking-[0.08em] text-muted-foreground";
const tdBase = "py-2 text-[14px] leading-5 tabular-nums";

export function StandingsConferenceTable({
  title,
  rows,
  compact = false,
}: {
  title: string;
  rows: StandingRow[];
  /** Fewer columns for homepage. */
  compact?: boolean;
}) {
  return (
    <section className="sports-card overflow-hidden">
      <div className="border-b border-border px-3 py-2 text-[14px] font-bold tracking-tight">
        {title}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full table-fixed text-left">
          <colgroup>
            <col className="w-7" />
            <col />
            <col className="w-[52px]" />
            <col className="w-[52px]" />
            <col className="w-20" />
            {compact ? (
              <col className="w-24" />
            ) : (
              <>
                <col className="w-14" />
                <col className="w-16" />
                <col className="w-14" />
                <col className="w-14" />
                <col className="w-16" />
              </>
            )}
          </colgroup>
          <thead className="border-b border-border bg-secondary/50">
            <tr>
              <th className={cn(thBase, "pl-3 pr-1")}>#</th>
              <th className={cn(thBase, "pl-2 pr-2")}>Team</th>
              <th className={cn(thBase, "px-1 text-right")}>W</th>
              <th className={cn(thBase, "px-1 text-right")}>L</th>
              <th className={cn(thBase, "px-1 text-right")}>PCT</th>
              {!compact ? (
                <>
                  <th className={cn(thBase, "px-1 text-right")}>GB</th>
                  <th className={cn(thBase, "px-1 text-right")}>DIFF</th>
                  <th className={cn(thBase, "px-1 text-right")}>PPG</th>
                  <th className={cn(thBase, "px-1 text-right")}>OPP</th>
                  <th className={cn(thBase, "pl-1 pr-3 text-right")}>STRK</th>
                </>
              ) : (
                <th className={cn(thBase, "pl-1 pr-3 text-right")}>DIFF</th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              return (
                <tr
                  key={row.teamId}
                  className="border-b border-border last:border-0 hover:bg-secondary/40"
                >
                  <td
                    className={cn(
                      tdBase,
                      "pl-3 pr-1 text-[12px] font-bold leading-4 text-muted-foreground"
                    )}
                  >
                    {row.rank}
                  </td>
                  <td className="py-2 pl-2 pr-2">
                    <TeamIdentity
                      teamKey={row.teamId}
                      label={compact ? row.abbreviation : row.displayName}
                      className="min-w-0"
                      nameClassName="flex min-w-0 items-center gap-2 no-underline hover:no-underline"
                    >
                      <TeamLogo teamKey={row.abbreviation} size="xs" />
                      <span
                        className={cn(
                          type.body,
                          textLinkClassName,
                          "truncate"
                        )}
                      >
                        {compact ? row.abbreviation : row.displayName}
                      </span>
                    </TeamIdentity>
                  </td>
                  <td className={cn(tdBase, "px-1 text-right")}>{row.wins}</td>
                  <td className={cn(tdBase, "px-1 text-right")}>{row.losses}</td>
                  <td className={cn(tdBase, "px-1 text-right")}>
                    {formatNumber(row.winPct, 3)}
                  </td>
                  {!compact ? (
                    <>
                      <td
                        className={cn(
                          tdBase,
                          "px-1 text-right text-muted-foreground"
                        )}
                      >
                        {row.gamesBehind <= 0
                          ? "-"
                          : formatNumber(row.gamesBehind, 1)}
                      </td>
                      <td
                        className={cn(
                          tdBase,
                          "px-1 text-right font-medium",
                          row.differential > 0
                            ? "text-emerald-700"
                            : row.differential < 0
                              ? "text-rose-700"
                              : ""
                        )}
                      >
                        {row.differential > 0 ? "+" : ""}
                        {formatNumber(row.differential, 1)}
                      </td>
                      <td className={cn(tdBase, "px-1 text-right")}>
                        {formatNumber(row.ppg, 1)}
                      </td>
                      <td
                        className={cn(
                          tdBase,
                          "px-1 text-right text-muted-foreground"
                        )}
                      >
                        {formatNumber(row.oppPpg, 1)}
                      </td>
                      <td className={cn(tdBase, "pl-1 pr-3 text-right")}>
                        {row.streak}
                      </td>
                    </>
                  ) : (
                    <td
                      className={cn(
                        tdBase,
                        "pl-1 pr-3 text-right font-medium",
                        row.differential > 0
                          ? "text-emerald-700"
                          : row.differential < 0
                            ? "text-rose-700"
                            : ""
                      )}
                    >
                      {row.differential > 0 ? "+" : ""}
                      {formatNumber(row.differential, 1)}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
