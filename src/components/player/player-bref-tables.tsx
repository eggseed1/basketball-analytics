"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatTooltip } from "@/components/ui/stat-tooltip";
import type { PlayerSeason } from "@/data/types";
import {
  type BrefTableMode,
  columnsForMode,
} from "@/lib/player-stat-views";
import { cn } from "@/lib/utils";

const MODES: Array<{ id: BrefTableMode; label: string }> = [
  { id: "perGame", label: "Per Game" },
  { id: "totals", label: "Totals" },
  { id: "per36", label: "Per 36" },
  { id: "advanced", label: "Advanced" },
];

/**
 * Full Basketball-Reference-style season tables.
 */
export function PlayerBrefTables({
  playerId,
  seasons,
  activeSeason,
}: {
  playerId: string;
  seasons: PlayerSeason[];
  activeSeason: string;
}) {
  const [mode, setMode] = useState<BrefTableMode>("perGame");
  const columns = useMemo(() => columnsForMode(mode), [mode]);

  return (
    <section
      aria-labelledby="bref-tables-heading"
      className="flex flex-col gap-3"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="bref-tables-heading" className="text-lg font-semibold">
            Season statistics
          </h2>
          <p className="text-sm text-muted-foreground">
            Full Basketball-Reference column set we can derive from live
            counting stats (Per Game, Totals, Per 36, Advanced).
          </p>
        </div>
        <div
          className="flex flex-wrap gap-1"
          role="tablist"
          aria-label="Stat table mode"
        >
          {MODES.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={mode === item.id}
              onClick={() => setMode(item.id)}
              className={cn(
                "rounded-md border px-3 py-1.5 text-xs font-medium",
                mode === item.id
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-background hover:bg-muted"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead
                  key={col.key}
                  className={
                    col.align === "left" ? "text-left" : "text-right"
                  }
                >
                  <StatTooltip nestable stat={col.label}>
                    {col.label}
                  </StatTooltip>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {seasons.map((row) => {
              const isActive = row.season === activeSeason;
              return (
                <TableRow
                  key={`${row.season}-${row.teamId}-${mode}`}
                  className={isActive ? "bg-muted/40" : undefined}
                >
                  {columns.map((col) => {
                    const value = col.format(row);
                    const isSeason = col.key === "season";
                    return (
                      <TableCell
                        key={col.key}
                        className={cn(
                          "tabular-nums",
                          col.align === "left"
                            ? "text-left"
                            : "text-right",
                          isSeason && "font-medium"
                        )}
                      >
                        {isSeason ? (
                          <Link
                            href={`/players/${playerId}?season=${row.season}`}
                            className="underline-offset-4 hover:underline"
                          >
                            {value}
                          </Link>
                        ) : (
                          value
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
