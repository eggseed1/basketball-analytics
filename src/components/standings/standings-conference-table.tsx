"use client";

import { TeamLogo } from "@/components/brand/team-logo";
import { TeamIdentity } from "@/components/teams/team-identity";
import type { StandingRow } from "@/data/types";
import { formatNumber } from "@/lib/format";
import { textLinkClassName, type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

const thBase =
  "py-2 font-semibold text-[12px] uppercase tracking-[0.08em] text-muted-foreground";
/** Short classes — styles in globals.css (.standings-td*). */
const tdNum = "standings-td standings-td-num";
const tdNumMuted = "standings-td standings-td-num standings-td-muted";
const tdNumEnd = "standings-td standings-td-num standings-td-num-end";
const tdRank = "standings-td standings-td-rank";

export function StandingsConferenceTable({
  title,
  rows,
  compact = false,
  seedLines = false,
  bare = false,
}: {
  title: string;
  rows: StandingRow[];
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
                  <td className={tdRank}>{row.rank}</td>
                  <td className="min-w-[4.5rem] py-2 pl-2 pr-2 sm:min-w-[11.5rem]">
                    <TeamIdentity
                      teamKey={row.teamId}
                      label={compact ? row.abbreviation : row.displayName}
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
                            title={row.displayName}
                          >
                            {row.displayName}
                          </span>
                        </>
                      )}
                    </TeamIdentity>
                  </td>
                  <td className={tdNum}>{row.wins}</td>
                  <td className={tdNum}>{row.losses}</td>
                  <td className={tdNum}>{formatNumber(row.winPct, 3)}</td>
                  {!compact ? (
                    <>
                      <td className={tdNumMuted}>
                        {row.gamesBehind <= 0
                          ? "-"
                          : formatNumber(row.gamesBehind, 1)}
                      </td>
                      <td
                        className={cn(
                          tdNum,
                          "font-medium",
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
                      <td className={tdNum}>{formatNumber(row.ppg, 1)}</td>
                      <td className={tdNumMuted}>
                        {formatNumber(row.oppPpg, 1)}
                      </td>
                      <td className={tdNumEnd}>{row.streak}</td>
                    </>
                  ) : (
                    <td
                      className={cn(
                        tdNumEnd,
                        "font-medium",
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
