"use client";

import { useId, useMemo, useState } from "react";

import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { TeamLogo } from "@/components/brand/team-logo";
import { AppLink } from "@/components/ui/app-link";
import { ChoiceChip, ChoiceTrack } from "@/components/ui/choice-chip";
import {
  availableRookieTrackerSorts,
  boardRowsForRookieSort,
  defaultRookieTrackerSort,
  type RookieTrackerModel,
  type RookieTrackerRow,
  type RookieTrackerSort,
} from "@/lib/home-rookie-tracker";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

const SORTS: { id: RookieTrackerSort; label: string }[] = [
  { id: "war1", label: "WAR1" },
  { id: "points", label: "PTS" },
  { id: "rebounds", label: "REB" },
  { id: "assists", label: "AST" },
  { id: "pick", label: "Pick" },
];

function fmt(n: number | null, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

function fmtInt(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return String(Math.round(n));
}

function primaryValue(row: RookieTrackerRow, sort: RookieTrackerSort): string {
  if (sort === "pick") return `#${row.overall}`;
  if (sort === "war1") return fmt(row.war1, 2);
  if (sort === "points") return fmtInt(row.points);
  if (sort === "rebounds") return fmtInt(row.rebounds);
  return fmtInt(row.assists);
}

function RookieRow({
  row,
  sort,
  rank,
}: {
  row: RookieTrackerRow;
  sort: RookieTrackerSort;
  rank: number;
}) {
  const primary = primaryValue(row, sort);
  const secondary =
    sort === "pick"
      ? row.gp
        ? `${fmt(row.ppg)} / ${fmt(row.rpg)} / ${fmt(row.apg)} · ${row.gp} GP`
        : "No line yet"
      : row.gp
        ? `${fmt(row.mpg)} min · ${row.gp} GP · pick ${row.overall}`
        : `Pick ${row.overall} · no line yet`;

  const inner = (
    <>
      <span
        className={cn(
          type.bodySm,
          "w-4 shrink-0 text-center font-bold tabular-nums text-muted-foreground"
        )}
        aria-hidden
      >
        {rank}
      </span>
      <PlayerHeadshot
        playerId={row.playerId}
        espnId={row.playerId}
        name={row.name}
        teamKey={row.teamAbbr}
        size="md"
        className="h-12 w-12 shrink-0 sm:h-14 sm:w-14"
      />
      <div className="min-w-0 flex-1">
        <p className={cn(type.body, "truncate font-semibold")}>{row.name}</p>
        <div className="mt-0.5 flex items-center gap-1.5">
          <TeamLogo teamKey={row.teamAbbr} size="xs" />
          <span className={cn(type.caption, "truncate text-muted-foreground")}>
            {secondary}
          </span>
        </div>
      </div>
      <span
        className={cn(
          type.body,
          "shrink-0 font-bold tabular-nums"
        )}
      >
        {primary}
      </span>
    </>
  );

  const rowClass =
    "flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-secondary/70";

  if (!row.href) {
    return (
      <li data-motion="row">
        <div className={rowClass}>{inner}</div>
      </li>
    );
  }
  return (
    <li data-motion="row">
      <AppLink
        href={row.href}
        className={cn(
          rowClass,
          "outline-none focus-visible:ring-2 focus-visible:ring-ring"
        )}
      >
        {inner}
      </AppLink>
    </li>
  );
}

export function RookieTrackerBoard({ model }: { model: RookieTrackerModel }) {
  const labelId = useId();
  const sortOptions = useMemo(
    () => availableRookieTrackerSorts(model.rows),
    [model.rows]
  );
  const initialSort = useMemo(
    () => defaultRookieTrackerSort(model.rows),
    [model.rows]
  );
  const [sort, setSort] = useState<RookieTrackerSort>(initialSort);
  const activeSort = sortOptions.includes(sort) ? sort : initialSort;
  const rows = useMemo(
    () => boardRowsForRookieSort(model.rows, activeSort),
    [model.rows, activeSort]
  );
  const metric = SORTS.find((s) => s.id === activeSort)?.label ?? activeSort;

  return (
    <div className="flex flex-col gap-2">
      <ChoiceTrack aria-labelledby={labelId} className="flex-wrap">
        <span id={labelId} className="sr-only">
          Rookie race metric
        </span>
        {SORTS.filter((option) => sortOptions.includes(option.id)).map(
          (option) => (
            <ChoiceChip
              key={option.id}
              active={activeSort === option.id}
              onClick={() => setSort(option.id)}
            >
              {option.label}
            </ChoiceChip>
          )
        )}
      </ChoiceTrack>
      {/* One list: rank, player, and the value for the chosen metric. */}
      <ol
        data-motion-list
        aria-label={`Rookie race by ${metric}`}
        className="flex min-w-0 flex-col divide-y divide-border/40"
      >
        {rows.map((row, index) => (
          <RookieRow
            key={row.key}
            row={row}
            sort={activeSort}
            rank={index + 1}
          />
        ))}
      </ol>
    </div>
  );
}
