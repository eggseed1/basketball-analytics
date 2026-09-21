"use client";

import { useMemo, useState } from "react";

import { TransitionLink } from "@/components/continuity/query-nav";
import { decadeKeyFromSeason } from "@/content/awards/summaries";
import type { AwardHistoryRow } from "@/content/awards/history";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

type Props = {
  slug: string;
  seasonColumnLabel: string;
  winnerColumnLabel: string;
  rows: AwardHistoryRow[];
  /** Championships use note in the season column. */
  seasonUsesNote?: boolean;
};

/**
 * Award history table with optional decade filter chips.
 */
export function AwardHistoryBoard({
  slug,
  seasonColumnLabel,
  winnerColumnLabel,
  rows,
  seasonUsesNote = false,
}: Props) {
  const decades = useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) {
      const key = decadeKeyFromSeason(row.season);
      if (key) set.add(key);
    }
    return [...set].sort((a, b) => Number(b.slice(0, 4)) - Number(a.slice(0, 4)));
  }, [rows]);

  const [decade, setDecade] = useState<string | "all">("all");

  const filtered = useMemo(() => {
    if (decade === "all") return rows;
    return rows.filter((row) => decadeKeyFromSeason(row.season) === decade);
  }, [rows, decade]);

  const showFilter = decades.length >= 3;

  return (
    <div className="flex flex-col gap-3">
      {showFilter ? (
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label="Filter by decade"
        >
          <button
            type="button"
            onClick={() => setDecade("all")}
            className={cn(
              type.caption,
              "rounded-md border px-2.5 py-1 font-semibold transition-colors",
              decade === "all"
                ? "border-foreground/25 bg-foreground/10 text-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-secondary/60"
            )}
          >
            All eras
          </button>
          {decades.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDecade(d)}
              className={cn(
                type.caption,
                "rounded-md border px-2.5 py-1 font-semibold tabular-nums transition-colors",
                decade === d
                  ? "border-foreground/25 bg-foreground/10 text-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-secondary/60"
              )}
            >
              {d}
            </button>
          ))}
        </div>
      ) : null}

      <div className="sports-card overflow-hidden">
        <table className="w-full text-left">
          <thead className="sticky top-0 z-[1] bg-card/95 backdrop-blur-sm">
            <tr
              className={cn(
                type.caption,
                "border-b border-border uppercase tracking-wide text-muted-foreground"
              )}
            >
              <th className="px-4 py-2.5 font-semibold">{seasonColumnLabel}</th>
              <th className="px-4 py-2.5 font-semibold">{winnerColumnLabel}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={2}
                  className={cn(
                    type.bodySm,
                    "px-4 py-6 text-muted-foreground"
                  )}
                >
                  No {slug} rows in this era.
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr
                  key={`${row.season}-${row.winner}-${row.href ?? ""}`}
                  className="border-b border-border/70 last:border-0"
                >
                  <td
                    className={cn(
                      type.bodySm,
                      "px-4 py-2.5 tabular-nums text-muted-foreground"
                    )}
                  >
                    {seasonUsesNote && row.note ? row.note : row.season}
                  </td>
                  <td className={cn(type.bodySm, "px-4 py-2.5 font-semibold")}>
                    {row.href ? (
                      <TransitionLink
                        href={row.href}
                        className="underline-offset-2 hover:underline"
                      >
                        {row.winner}
                      </TransitionLink>
                    ) : (
                      row.winner
                    )}
                    {row.note && !seasonUsesNote ? (
                      <span className="ml-2 font-normal text-muted-foreground">
                        ({row.note})
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {showFilter && decade !== "all" ? (
        <p className={cn(type.caption, "text-muted-foreground")}>
          Showing {filtered.length} of {rows.length} · {decade}
        </p>
      ) : null}
    </div>
  );
}
