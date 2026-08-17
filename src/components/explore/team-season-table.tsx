"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { TeamLogo } from "@/components/team/team-logo";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatTooltip } from "@/components/ui/stat-tooltip";
import type { TeamSeason } from "@/data/types";
import {
  TEAM_TABLE_COLUMNS,
  getTeamSortOption,
  parseSortDir,
  sortTeamSeasons,
  type TeamSortKey,
} from "@/lib/team-explore-sort";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";

export function TeamSeasonTable({ teams }: { teams: TeamSeason[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const sortKey = getTeamSortOption(searchParams.get("sort")).key;
  const sortDir = parseSortDir(searchParams.get("dir"));

  const rows = useMemo(
    () => sortTeamSeasons(teams, sortKey, sortDir),
    [teams, sortKey, sortDir]
  );

  function setSort(key: TeamSortKey) {
    const next = new URLSearchParams(searchParams.toString());
    if (key === sortKey) {
      next.set("dir", sortDir === "asc" ? "desc" : "asc");
    } else {
      const opt = getTeamSortOption(key);
      next.set("sort", key);
      next.set("dir", opt.defaultDir);
    }
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const columns = TEAM_TABLE_COLUMNS.map((key) => getTeamSortOption(key));

  return (
    <section aria-labelledby="team-table-heading" className="flex flex-col gap-3">
      <div>
        <h2 id="team-table-heading" className="text-lg font-semibold">
          Team standings & efficiency
        </h2>
        <p className="text-sm text-muted-foreground">
          {rows.length} teams · click a column to sort
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 text-muted-foreground">#</TableHead>
              {columns.map((col) => {
                const active = sortKey === col.key;
                const arrow = active ? (sortDir === "asc" ? " ↑" : " ↓") : "";
                return (
                  <TableHead
                    key={col.key}
                    className={cn(col.numeric && "text-right")}
                  >
                    <button
                      type="button"
                      className={cn(
                        "inline-flex items-center gap-0.5 font-medium hover:text-foreground",
                        active ? "text-foreground" : "text-muted-foreground",
                        col.numeric && "w-full justify-end"
                      )}
                      onClick={() => setSort(col.key)}
                      aria-label={`Sort by ${col.label}`}
                    >
                      <StatTooltip nestable stat={col.label}>
                        {col.label}
                      </StatTooltip>
                      <span aria-hidden>{arrow}</span>
                    </button>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length + 1}
                  className="text-muted-foreground"
                >
                  No teams match the current filters.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((team, index) => (
                <TableRow key={`${team.teamId}-${team.season}`}>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {index + 1}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/teams/${team.teamId}?season=${team.season}`}
                      className="inline-flex items-center gap-2 font-medium underline-offset-4 hover:underline"
                    >
                      <TeamLogo
                        teamId={team.teamId}
                        abbreviation={team.teamAbbreviation}
                        size="xs"
                      />
                      <span>{team.teamName}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {team.teamAbbreviation}
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(team.wins)}-{formatNumber(team.losses)}
                  </TableCell>
                  {columns.slice(2).map((col) => (
                    <TableCell
                      key={col.key}
                      className={cn("tabular-nums", col.numeric && "text-right")}
                    >
                      {col.format(team)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
