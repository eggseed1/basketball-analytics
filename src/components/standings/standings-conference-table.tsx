"use client";

import { TeamLogo } from "@/components/brand/team-logo";
import { TeamIdentity } from "@/components/teams/team-identity";
/** Full standings page rows, or slim home/compact rows. */
export type StandingRowView = {
  teamId: string;
  abbreviation: string;
  displayName?: string;
  rank: number;
  wins: number;
  losses: number;
  winPct: number;
  differential: number;
  gamesBehind?: number;
  ppg?: number;
  oppPpg?: number;
  streak?: string;
};

import { formatNumber } from "@/lib/format";
import { textLinkClassName, type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

const thBase =
  "py-2 font-semibold text-[12px] uppercase tracking-[0.08em] text-muted-foreground";
const tdBase = "type-caption py-2 tabular-nums";

export function StandingsConferenceTable({
  title,
  rows,
  compact = false,
  seedLines = false,
  bare = false,
}: {
  title: string;
  rows: StandingRowView[];
  /** Fewer columns for homepage. */
  compact?: boolean;
  /** Dashed rules under the last playoff seed (6) and last play-in seed (10). */
  seedLines?: boolean;
  /** Table only. Use when a parent card already has the title. */
  bare?: boolean;
}) {
  const table = (
        <table
          className={cn(
            "w-full table-fixed text-left",
            compact ? "min-w-[19rem]" : "min-w-[47rem]"
          )}
        >
          <colgroup>
            <col className="w-7" />
            <col />
            {compact ? (
              <>
                <col className="w-9" />
                <col className="w-9" />
                <col className="w-14" />
                <col className="w-16" />
              </>
            ) : (
              <>
                <col className="w-[52px]" />
                <col className="w-[52px]" />
                <col className="w-20" />
                <col className="w-14" />
                <col className="w-16" />
                <col className="w-14" />
                <col className="w-14" />
                <col className="w-16" />
              </>
            )}
          </colgroup>
          <thead className="border-b border-border/40 bg-secondary/50">
            <tr>
              <th className={cn(thBase, "pl-3 pr-1")}>#</th>
              <th
                className={cn(
                  thBase,
                  "min-w-[4.5rem] pl-2 pr-2 sm:min-w-[11.5rem]"
                )}
              >
                Team
              </th>
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
            {rows.map((row, i) => {
              const seed = row.rank || i + 1;
              return (
                <tr
                  key={row.teamId}
                  data-motion="row"
                  className={cn(
                    "border-b border-border/40 last:border-0 hover:bg-secondary/40",
                    seedLines &&
                      (seed === 6 || seed === 10) &&
                      "border-b-2 border-dashed border-b-foreground/35"
                  )}
                >
                  <td
                    className={cn(
                      tdBase,
                      "pl-3 pr-1 text-[12px] font-bold leading-4 text-muted-foreground"
                    )}
                  >
                    {row.rank}
                  </td>
                  <td className="min-w-[4.5rem] py-2 pl-2 pr-2 sm:min-w-[11.5rem]">
                    <TeamIdentity
                      teamKey={row.teamId}
                      label={compact ? row.abbreviation : (row.displayName ?? row.abbreviation)}
                      nameClassName="flex min-w-0 max-w-full items-center gap-2 whitespace-nowrap no-underline hover:no-underline"
                    >
                      <span className="shrink-0">
                        <TeamLogo teamKey={row.abbreviation} size="xs" />
                      </span>
                      {compact ? (
                        <span className={cn(type.bodySm, textLinkClassName)}>
                          {row.abbreviation}
                        </span>
                      ) : (
                        <>
                          <span
                            className={cn(
                              type.bodySm,
                              textLinkClassName,
                              "sm:hidden"
                            )}
                          >
                            {row.abbreviation}
                          </span>
                          <span
                            className={cn(
                              type.bodySm,
                              textLinkClassName,
                              "hidden min-w-0 truncate sm:block"
                            )}
                            title={row.displayName ?? row.abbreviation}
                          >
                            {row.displayName ?? row.abbreviation}
                          </span>
                        </>
                      )}
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
                        {(row.gamesBehind ?? 0) <= 0
                          ? "-"
                          : formatNumber(row.gamesBehind ?? 0, 1)}
                      </td>
                      <td
                        className={cn(
                          tdBase,
                          "px-1 text-right font-medium",
                          row.differential > 0
                            ? "text-delta-up"
                            : row.differential < 0
                              ? "text-delta-down"
                              : ""
                        )}
                      >
                        {row.differential > 0 ? "+" : ""}
                        {formatNumber(row.differential, 1)}
                      </td>
                      <td className={cn(tdBase, "px-1 text-right")}>
                        {formatNumber(row.ppg ?? 0, 1)}
                      </td>
                      <td
                        className={cn(
                          tdBase,
                          "px-1 text-right text-muted-foreground"
                        )}
                      >
                        {formatNumber(row.oppPpg ?? 0, 1)}
                      </td>
                      <td className={cn(tdBase, "pl-1 pr-3 text-right")}>
                        {row.streak ?? "—"}
                      </td>
                    </>
                  ) : (
                    <td
                      className={cn(
                        tdBase,
                        "pl-1 pr-3 text-right font-medium",
                        row.differential > 0
                          ? "text-delta-up"
                          : row.differential < 0
                            ? "text-delta-down"
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
  );
  if (bare) {
    return (
      <div className="overflow-x-auto" data-no-scroll-fade>
        {table}
      </div>
    );
  }
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <h2 className="type-heading px-0.5">{title}</h2>
      <div className="sports-card overflow-x-auto" data-no-scroll-fade>
        {table}
      </div>
    </section>
  );
}
