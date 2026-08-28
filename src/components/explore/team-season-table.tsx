"use client";

import { useMemo, useState } from "react";

import { TeamLogo } from "@/components/brand/team-logo";
import { TeamIdentity } from "@/components/teams/team-identity";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import type { TeamSeasonStats } from "@/data/types";
import { formatNumber, formatPct } from "@/lib/format";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { cn } from "@/lib/utils";

type SortKey =
  | "fullName"
  | "conference"
  | "gamesPlayed"
  | "ppg"
  | "oppPpg"
  | "avgDiff"
  | "rpg"
  | "apg"
  | "spg"
  | "bpg"
  | "topg"
  | "fieldGoalPct"
  | "threePointPct"
  | "freeThrowPct"
  | "effectiveFieldGoalPct"
  | "trueShootingPct"
  | "assistToTurnover"
  | "offensiveReboundPct";

const COLUMNS: {
  key: SortKey;
  label: string;
  tip?: string;
  align?: "left" | "right";
}[] = [
  { key: "fullName", label: "Team", align: "left" },
  { key: "conference", label: "Conf", align: "left" },
  { key: "gamesPlayed", label: "GP" },
  { key: "avgDiff", label: "DIFF", tip: "Avg point differential" },
  { key: "ppg", label: "PPG" },
  { key: "oppPpg", label: "OPP", tip: "Estimated opponent PPG" },
  { key: "trueShootingPct", label: "TS%", tip: "True shooting %" },
  { key: "effectiveFieldGoalPct", label: "eFG%" },
  { key: "fieldGoalPct", label: "FG%" },
  { key: "threePointPct", label: "3P%" },
  { key: "freeThrowPct", label: "FT%" },
  { key: "rpg", label: "RPG" },
  { key: "apg", label: "APG" },
  { key: "spg", label: "SPG" },
  { key: "bpg", label: "BPG" },
  { key: "topg", label: "TOV" },
  { key: "assistToTurnover", label: "AST/TO" },
  { key: "offensiveReboundPct", label: "ORB%" },
];

function defaultDir(key: SortKey): "asc" | "desc" {
  if (key === "fullName" || key === "conference") return "asc";
  if (key === "oppPpg" || key === "topg") return "asc";
  return "desc";
}

function isPct(key: SortKey): boolean {
  return (
    key === "fieldGoalPct" ||
    key === "threePointPct" ||
    key === "freeThrowPct" ||
    key === "effectiveFieldGoalPct" ||
    key === "trueShootingPct" ||
    key === "offensiveReboundPct"
  );
}

function sortValue(row: TeamSeasonStats, key: SortKey): string | number {
  if (key === "fullName") return row.abbreviation;
  if (key === "conference") return row.conference;
  const v = row[key];
  return typeof v === "number" && Number.isFinite(v) ? v : Number.NEGATIVE_INFINITY;
}

function formatCell(row: TeamSeasonStats, key: SortKey): string {
  if (key === "fullName") return row.abbreviation;
  if (key === "conference") return row.conference;
  const v = row[key] as number;
  if (key === "avgDiff") {
    return `${v > 0 ? "+" : ""}${formatNumber(v, 1)}`;
  }
  if (isPct(key)) return formatPct(v);
  if (key === "assistToTurnover" || key === "gamesPlayed") {
    return formatNumber(v, key === "gamesPlayed" ? 0 : 2);
  }
  return formatNumber(v, 1);
}

export function TeamSeasonTable({ teams }: { teams: TeamSeasonStats[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("avgDiff");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [conf, setConf] = useState<"all" | "East" | "West">("all");

  const filtered = useMemo(() => {
    const base =
      conf === "all" ? teams : teams.filter((t) => t.conference === conf);
    return [...base].sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc"
          ? av.localeCompare(bv)
          : bv.localeCompare(av);
      }
      const an = Number(av);
      const bn = Number(bv);
      if (an === bn) return a.abbreviation.localeCompare(b.abbreviation);
      return sortDir === "asc" ? an - bn : bn - an;
    });
  }, [teams, conf, sortKey, sortDir]);

  const onSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(defaultDir(key));
  };

  const activeLabel =
    COLUMNS.find((c) => c.key === sortKey)?.label ?? sortKey;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {(["all", "East", "West"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setConf(c)}
              className={cn(
                "rounded-full px-3 py-1.5 text-[14px] font-semibold transition-colors",
                conf === c
                  ? "bg-foreground text-background"
                  : "bg-secondary text-foreground hover:bg-foreground/10"
              )}
            >
              {c === "all" ? "All teams" : c}
            </button>
          ))}
        </div>
        <p className="text-[12px] text-muted-foreground">
          {filtered.length} teams · sorted by{" "}
          <span className="font-medium text-foreground">
            {activeLabel} {sortDir === "asc" ? "↑" : "↓"}
          </span>
        </p>
      </div>

      <div className="overflow-x-auto rounded-md border border-border bg-card">
        <Table container={false} className="min-w-[980px] text-[12px]">
          <TableHeader className="sticky top-0 z-20 border-b border-border bg-card">
            <TableRow className="hover:bg-transparent">
              {COLUMNS.map((col) => (
                <SortableTableHead
                  key={col.key}
                  active={sortKey === col.key}
                  dir={sortDir}
                  onClick={() => onSort(col.key)}
                  align={col.align ?? "right"}
                  title={col.tip}
                  sticky={col.key === "fullName"}
                >
                  {col.label}
                </SortableTableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((row) => {
              const brand = resolveTeamBrand(row.abbreviation);
              return (
                <TableRow
                  key={row.teamId}
                  style={
                    brand
                      ? { boxShadow: `inset 3px 0 0 ${brand.primary}` }
                      : undefined
                  }
                >
                  {COLUMNS.map((col) => {
                    if (col.key === "fullName") {
                      return (
                        <TableCell
                          key={col.key}
                          className="sticky left-0 z-10 bg-card"
                        >
                          <TeamIdentity
                            teamKey={row.teamId}
                            label={row.abbreviation}
                            season={row.season}
                            className="min-w-0"
                            nameClassName="flex items-center gap-2"
                          >
                            <TeamLogo teamKey={row.abbreviation} size="xs" />
                            <span className="whitespace-nowrap font-semibold underline decoration-foreground/40 underline-offset-2">
                              {row.abbreviation}
                            </span>
                          </TeamIdentity>
                        </TableCell>
                      );
                    }
                    const tone =
                      col.key === "avgDiff"
                        ? row.avgDiff > 0
                          ? "text-delta-up font-medium"
                          : row.avgDiff < 0
                            ? "text-delta-down font-medium"
                            : ""
                        : col.key === "oppPpg" || col.key === "conference"
                          ? "text-muted-foreground"
                          : "";
                    return (
                      <TableCell
                        key={col.key}
                        className={cn("text-right tabular-nums", tone)}
                      >
                        {formatCell(row, col.key)}
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
