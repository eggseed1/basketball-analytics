"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";

import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { TeamLogo } from "@/components/brand/team-logo";
import { ChoiceChip, ChoiceTrack } from "@/components/ui/choice-chip";
import {
  ROOKIE_TRACKER_LIMIT,
  rookieRaceLeaderValue,
  rookieRaceShare,
  sortRookieTrackerRows,
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

const RACE_LANES = 6;

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

function shortLast(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] ?? name;
}

/** Compact finish-line lanes for the metric race (top of the card). */
function RookieRaceField({
  rows,
  sort,
  leader,
}: {
  rows: RookieTrackerRow[];
  sort: RookieTrackerSort;
  leader: number | null;
}) {
  if (sort === "pick") return null;
  const lanes = rows
    .map((row) => ({
      row,
      share: rookieRaceShare(row, sort, leader),
      value: primaryValue(row, sort),
    }))
    .filter((lane) => lane.share != null)
    .slice(0, RACE_LANES);

  if (lanes.length < 2) return null;

  return (
    <div
      role="img"
      aria-label={`Rookie race by ${SORTS.find((s) => s.id === sort)?.label ?? sort}`}
      className="flex flex-col gap-1.5 rounded-xl bg-secondary/40 px-3 py-2.5"
    >
      {lanes.map((lane, index) => {
        const width = `${Math.round((lane.share ?? 0) * 1000) / 10}%`;
        const lead = index === 0;
        return (
          <div key={lane.row.key} className="flex items-center gap-2">
            <span className="w-3.5 shrink-0 text-right text-[10px] font-bold tabular-nums text-muted-foreground">
              {index + 1}
            </span>
            <div className="relative h-5 min-w-0 flex-1 overflow-hidden rounded-md bg-background/60">
              <span
                className={cn(
                  "absolute inset-y-0 left-0 rounded-md transition-[width] duration-300",
                  lead ? "bg-foreground/80" : "bg-foreground/40"
                )}
                style={{ width }}
              />
              <span
                className={cn(
                  type.caption,
                  "absolute inset-y-0 left-2 flex items-center truncate font-semibold",
                  lead ? "text-background" : "text-foreground"
                )}
              >
                {shortLast(lane.row.name)}
              </span>
            </div>
            <span className="w-10 shrink-0 text-right text-[11px] font-bold tabular-nums">
              {lane.value}
            </span>
          </div>
        );
      })}
    </div>
  );
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
    <div
      data-motion="row"
      className="flex items-center gap-2.5 rounded-xl px-2 py-2 transition-colors hover:bg-secondary/70"
    >
      <span className="w-5 shrink-0 text-center text-[12px] font-bold tabular-nums text-muted-foreground">
        {rank}
      </span>
      <PlayerHeadshot
        playerId={row.playerId}
        nbaId={row.playerId}
        name={row.name}
        teamKey={row.teamAbbr}
        size="sm"
        className="shrink-0"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className={cn(type.bodySm, "truncate font-semibold")}>{row.name}</p>
          <p className={cn(type.bodySm, "shrink-0 font-bold tabular-nums")}>
            {primary}
          </p>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <TeamLogo teamKey={row.teamAbbr} size="2xs" />
          <span className={cn(type.caption, "truncate text-muted-foreground")}>
            {secondary}
          </span>
        </div>
      </div>
    </div>
  );

  if (!row.href) return <li>{inner}</li>;
  return (
    <li>
      <Link
        href={row.href}
        className="block min-w-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {inner}
      </Link>
    </li>
  );
}

export function RookieTrackerBoard({ model }: { model: RookieTrackerModel }) {
  const labelId = useId();
  const [sort, setSort] = useState<RookieTrackerSort>("war1");
  const rows = useMemo(
    () => sortRookieTrackerRows(model.rows, sort).slice(0, ROOKIE_TRACKER_LIMIT),
    [model.rows, sort]
  );
  const leader = useMemo(
    () => rookieRaceLeaderValue(rows, sort),
    [rows, sort]
  );

  return (
    <div className="flex flex-col gap-3">
      <ChoiceTrack aria-labelledby={labelId} className="flex-wrap">
        <span id={labelId} className="sr-only">
          Rookie race metric
        </span>
        {SORTS.map((option) => (
          <ChoiceChip
            key={option.id}
            active={sort === option.id}
            onClick={() => setSort(option.id)}
          >
            {option.label}
          </ChoiceChip>
        ))}
      </ChoiceTrack>
      <RookieRaceField rows={rows} sort={sort} leader={leader} />
      <ol className="flex flex-col gap-0.5">
        {rows.map((row, index) => (
          <RookieRow
            key={row.key}
            row={row}
            sort={sort}
            rank={index + 1}
          />
        ))}
      </ol>
    </div>
  );
}
