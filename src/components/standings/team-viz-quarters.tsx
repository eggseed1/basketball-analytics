"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { TeamLogo } from "@/components/brand/team-logo";
import { useTeamVizParams } from "@/components/standings/team-viz-hub";
import { type } from "@/lib/design-system";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { teamProfileHref } from "@/lib/team-identity";
import type { TeamVizRow } from "@/lib/team-viz";
import { cn } from "@/lib/utils";

const COLUMNS = [
  { id: "q1", label: "Q1" },
  { id: "q2", label: "Q2" },
  { id: "q3", label: "Q3" },
  { id: "q4", label: "Q4" },
  { id: "h1", label: "1st half" },
  { id: "h2", label: "2nd half" },
  { id: "total", label: "Total" },
] as const;

type ColumnId = (typeof COLUMNS)[number]["id"];

/** Net points per game where the shading saturates. */
const SATURATE_AT = 3;

function values(q: [number, number, number, number]): Record<ColumnId, number> {
  return {
    q1: q[0],
    q2: q[1],
    q3: q[2],
    q4: q[3],
    h1: q[0] + q[1],
    h2: q[2] + q[3],
    total: q[0] + q[1] + q[2] + q[3],
  };
}

function cellStyle(v: number, scale: number) {
  const strength = Math.round(Math.min(Math.abs(v) / scale, 1) * 42);
  if (strength < 3) return undefined;
  const tone = v > 0 ? "var(--data-positive)" : "var(--data-negative)";
  return { backgroundColor: `color-mix(in oklab, ${tone} ${strength}%, transparent)` };
}

export function TeamVizQuarters({ rows, season }: { rows: TeamVizRow[]; season: string }) {
  const { teamKeys, toggleTeam, conference } = useTeamVizParams();
  const [sortBy, setSortBy] = useState<ColumnId>("total");

  const table = useMemo(
    () =>
      rows
        .filter((r) => r.quarterNet && (!conference || r.conference === conference))
        .map((r) => {
          const key = resolveTeamBrand(r.abbr)?.abbr.toUpperCase() ?? r.abbr.toUpperCase();
          return { row: r, key, v: values(r.quarterNet!), highlighted: teamKeys.includes(key) };
        })
        .sort((a, b) => b.v[sortBy] - a.v[sortBy]),
    [conference, rows, sortBy, teamKeys]
  );

  if (table.length < 8) {
    return (
      <p className={cn(type.bodySm, "sports-card px-4 py-10 text-center text-muted-foreground")}>
        Not enough games with quarter scores in {season} yet.
      </p>
    );
  }

  const minGames = Math.min(...table.map((t) => t.row.quarterGames));
  const maxGames = Math.max(...table.map((t) => t.row.games));

  return (
    <section className="sports-card flex flex-col gap-3 p-4 sm:p-5">
      <div>
        <h2 className={type.heading}>Quarter by quarter</h2>
        <p className={cn(type.bodySm, "mt-1 text-muted-foreground")}>
          {season} · Average net points per game in each quarter. Overtime is left out, so Total can
          differ slightly from scoring margin. Click a column to sort, or a row to highlight it.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr className="text-muted-foreground">
              <th className="sticky left-0 z-10 bg-card px-2 py-2 text-left font-semibold">Team</th>
              {COLUMNS.map((c) => (
                <th key={c.id} className="px-1 py-2 text-right font-semibold" aria-sort={sortBy === c.id ? "descending" : "none"}>
                  <button
                    type="button"
                    onClick={() => setSortBy(c.id)}
                    className={cn(
                      "rounded px-1.5 py-0.5 hover:text-foreground",
                      sortBy === c.id && "text-foreground underline underline-offset-4"
                    )}
                  >
                    {c.label}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.map((t) => (
              <tr
                key={t.key}
                onClick={() => toggleTeam(t.key)}
                aria-selected={t.highlighted}
                className={cn("cursor-pointer", t.highlighted && "font-semibold")}
              >
                <td
                  className={cn(
                    "sticky left-0 z-10 border-t border-border/50 bg-card px-2 py-1.5",
                    t.highlighted && "bg-secondary"
                  )}
                >
                  <span className="flex items-center gap-2">
                    <TeamLogo teamKey={t.key} size="xs" />
                    <Link
                      href={teamProfileHref(t.key, season)}
                      onClick={(e) => e.stopPropagation()}
                      className="font-semibold underline-offset-2 hover:underline"
                    >
                      {t.key}
                    </Link>
                    <span className="text-muted-foreground tabular-nums">
                      {t.row.wins}-{t.row.losses}
                    </span>
                  </span>
                </td>
                {COLUMNS.map((c) => {
                  const v = t.v[c.id];
                  const scale = c.id === "total" ? SATURATE_AT * 4 : c.id.startsWith("h") ? SATURATE_AT * 2 : SATURATE_AT;
                  return (
                    <td
                      key={c.id}
                      className="border-t border-border/50 px-2.5 py-1.5 text-right tabular-nums"
                      style={cellStyle(v, scale)}
                    >
                      {v > 0 ? "+" : ""}
                      {v.toFixed(1)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {minGames < maxGames ? (
        <p className={cn(type.caption, "text-muted-foreground")}>
          Some games have no quarter scores in the archive, so a few teams average over fewer games
          (as few as {minGames} of {maxGames}).
        </p>
      ) : null}
    </section>
  );
}
