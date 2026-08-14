"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { TeamLogo } from "@/components/brand/team-logo";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import type { FranchiseHistory } from "@/data/franchises/history";
import {
  franchisePlayoffWinPct,
  franchiseTitleCount,
  franchiseWinPct,
} from "@/data/queries/franchises";
import { formatNumber, formatPct } from "@/lib/format";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { cn } from "@/lib/utils";

type SortKey =
  | "name"
  | "titles"
  | "finals"
  | "playoffApps"
  | "playoffWins"
  | "playoffPct"
  | "rsWins"
  | "rsPct"
  | "founded";

function defaultDir(key: SortKey): "asc" | "desc" {
  if (key === "name" || key === "founded") return "asc";
  return "desc";
}

function sortValue(f: FranchiseHistory, key: SortKey): string | number {
  switch (key) {
    case "name":
      return f.name;
    case "titles":
      return franchiseTitleCount(f);
    case "finals":
      return f.finalsAppearances;
    case "playoffApps":
      return f.playoffAppearances;
    case "playoffWins":
      return f.playoffWins;
    case "playoffPct":
      return franchisePlayoffWinPct(f);
    case "rsWins":
      return f.regularSeasonWins;
    case "rsPct":
      return franchiseWinPct(f);
    case "founded":
      return f.firstSeason;
  }
}

export function FranchiseHistoryTable({
  franchises,
}: {
  franchises: FranchiseHistory[];
}) {
  const [sortKey, setSortKey] = useState<SortKey>("titles");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [conf, setConf] = useState<"all" | "East" | "West">("all");

  const rows = useMemo(() => {
    const base =
      conf === "all"
        ? franchises
        : franchises.filter((f) => f.conference === conf);
    return [...base].sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      let cmp = 0;
      if (typeof av === "string" && typeof bv === "string") {
        cmp = av.localeCompare(bv);
      } else {
        cmp = Number(av) - Number(bv);
      }
      if (cmp === 0) cmp = franchiseTitleCount(b) - franchiseTitleCount(a);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [franchises, conf, sortKey, sortDir]);

  const onSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(defaultDir(key));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {(["all", "East", "West"] as const).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setConf(c)}
            className={cn(
              "rounded-md px-3 py-1.5 text-[13px] font-semibold transition-colors",
              conf === c
                ? "bg-foreground text-background"
                : "bg-secondary text-foreground hover:bg-foreground/10"
            )}
          >
            {c === "all" ? "All franchises" : c}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-md border border-border bg-card">
        <Table container={false} className="min-w-[900px] text-[12px]">
          <TableHeader className="sticky top-0 z-20 border-b border-border bg-card">
            <TableRow className="hover:bg-transparent">
              <SortableTableHead
                sticky
                active={sortKey === "name"}
                dir={sortDir}
                onClick={() => onSort("name")}
                align="left"
              >
                Franchise
              </SortableTableHead>
              <SortableTableHead
                active={sortKey === "titles"}
                dir={sortDir}
                onClick={() => onSort("titles")}
              >
                Titles
              </SortableTableHead>
              <SortableTableHead
                active={sortKey === "finals"}
                dir={sortDir}
                onClick={() => onSort("finals")}
              >
                Finals
              </SortableTableHead>
              <SortableTableHead
                active={sortKey === "playoffApps"}
                dir={sortDir}
                onClick={() => onSort("playoffApps")}
              >
                Playoff apps
              </SortableTableHead>
              <SortableTableHead
                active={sortKey === "playoffWins"}
                dir={sortDir}
                onClick={() => onSort("playoffWins")}
              >
                Playoff W
              </SortableTableHead>
              <SortableTableHead
                active={sortKey === "playoffPct"}
                dir={sortDir}
                onClick={() => onSort("playoffPct")}
              >
                Playoff %
              </SortableTableHead>
              <SortableTableHead
                active={sortKey === "rsWins"}
                dir={sortDir}
                onClick={() => onSort("rsWins")}
              >
                RS W
              </SortableTableHead>
              <SortableTableHead
                active={sortKey === "rsPct"}
                dir={sortDir}
                onClick={() => onSort("rsPct")}
              >
                RS %
              </SortableTableHead>
              <SortableTableHead
                active={sortKey === "founded"}
                dir={sortDir}
                onClick={() => onSort("founded")}
                align="left"
              >
                First season
              </SortableTableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((f) => {
              const brand = resolveTeamBrand(f.abbr);
              const titles = franchiseTitleCount(f);
              return (
                <TableRow
                  key={f.id}
                  style={
                    brand
                      ? { boxShadow: `inset 3px 0 0 ${brand.primary}` }
                      : undefined
                  }
                >
                  <TableCell className="sticky left-0 z-10 bg-card">
                    <Link
                      href={`/franchises/${f.id}`}
                      className="flex items-center gap-2 font-semibold hover:underline"
                    >
                      <TeamLogo teamKey={f.abbr} size="xs" />
                      <span className="whitespace-nowrap">
                        {f.city} {f.name}
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-bold">
                    {titles}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {f.finalsAppearances}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {f.playoffAppearances}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(f.playoffWins)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPct(franchisePlayoffWinPct(f))}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(f.regularSeasonWins)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPct(franchiseWinPct(f))}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {f.firstSeason}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
