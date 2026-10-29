"use client";

import { useId, useMemo, useState } from "react";

import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { TeamLogo } from "@/components/brand/team-logo";
import { AppLink } from "@/components/ui/app-link";
import { ChoiceChip, ChoiceTrack } from "@/components/ui/choice-chip";
import {
  ROOKIE_TRACKER_LIMIT,
  defaultRookieTrackerSort,
  rookieRaceLeaderValue,
  rookieRaceShare,
  sortRookieTrackerRows,
  type RookieTrackerModel,
  type RookieTrackerRow,
  type RookieTrackerSort,
} from "@/lib/home-rookie-tracker";
import { type } from "@/lib/design-system";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { cn } from "@/lib/utils";

const SORTS: { id: RookieTrackerSort; label: string }[] = [
  { id: "war1", label: "WAR1" },
  { id: "points", label: "PTS" },
  { id: "rebounds", label: "REB" },
  { id: "assists", label: "AST" },
  { id: "pick", label: "Pick" },
];

/** Match the home board length — this chart is a glance, not a second leaderboard. */
const RACE_LANES = ROOKIE_TRACKER_LIMIT;

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

function teamPaint(teamAbbr: string): { primary: string; secondary: string } {
  const brand = resolveTeamBrand(teamAbbr);
  return {
    primary: brand?.primary ?? "#64748b",
    secondary: brand?.secondary ?? brand?.primary ?? "#94a3b8",
  };
}

type RaceLane = {
  row: RookieTrackerRow;
  share: number;
  value: string;
  paint: { primary: string; secondary: string };
};

function buildRaceLanes(
  rows: RookieTrackerRow[],
  sort: RookieTrackerSort,
  leader: number | null
): RaceLane[] {
  if (sort === "pick") return [];
  return rows
    .map((row) => {
      const share = rookieRaceShare(row, sort, leader);
      if (share == null) return null;
      return {
        row,
        share,
        value: primaryValue(row, sort),
        paint: teamPaint(row.teamAbbr),
      };
    })
    .filter((lane): lane is RaceLane => lane != null)
    .slice(0, RACE_LANES);
}

/** Compact race lanes — color + last name only; headshots live on the board. */
function RookieRaceField({
  lanes,
  sort,
  className,
}: {
  lanes: RaceLane[];
  sort: RookieTrackerSort;
  className?: string;
}) {
  if (lanes.length < 2) return null;

  const metric = SORTS.find((s) => s.id === sort)?.label ?? sort;

  return (
    <div
      role="img"
      aria-label={`Rookie race by ${metric}`}
      className={cn(
        "relative flex flex-col gap-1.5 rounded-lg border border-border/50 bg-secondary/25 px-2.5 py-2 pr-3",
        className
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-1.5 right-9 w-px bg-foreground/15"
      />
      <p className={cn(type.micro, "font-semibold uppercase tracking-wide text-muted-foreground")}>
        {metric} · top {lanes.length}
      </p>
      <ul data-motion-list className="flex flex-col gap-1.5">
        {lanes.map((lane, index) => {
          const widthPct = Math.round(lane.share * 1000) / 10;
          const lead = index === 0;
          return (
            <li
              key={lane.row.key}
              data-hover-item
              className="flex items-center gap-1.5 rounded-md px-0.5 py-0.5"
            >
              <span
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold tabular-nums text-white",
                  lead ? "ring-1 ring-white/35" : "opacity-90"
                )}
                style={{ backgroundColor: lane.paint.primary }}
              >
                {index + 1}
              </span>
              <div className="relative h-5 min-w-0 flex-1">
                <div className="absolute inset-y-0.5 left-0 right-2 overflow-hidden rounded-full bg-background/55">
                  <span
                    data-motion-bar="x"
                    className="absolute inset-y-0 left-0 origin-left rounded-full"
                    style={{
                      width: `${widthPct}%`,
                      background: `linear-gradient(90deg, ${lane.paint.primary}99, ${lane.paint.primary})`,
                      boxShadow: lead
                        ? `0 0 0 1px ${lane.paint.secondary}55`
                        : undefined,
                    }}
                  />
                </div>
                <span
                  className={cn(
                    type.micro,
                    "pointer-events-none absolute inset-y-0 left-1.5 z-[1] flex max-w-[75%] items-center truncate font-semibold text-foreground"
                  )}
                >
                  {shortLast(lane.row.name)}
                </span>
              </div>
              <span className="w-8 shrink-0 text-right text-[11px] font-bold tabular-nums">
                {lane.value}
              </span>
            </li>
          );
        })}
      </ul>
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
  const paint = teamPaint(row.teamAbbr);
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
      className="flex items-center gap-2 rounded-lg px-1.5 py-1"
      style={{
        boxShadow: `inset 2px 0 0 ${paint.primary}`,
      }}
    >
      <span
        className="flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold tabular-nums text-white"
        style={{ backgroundColor: paint.primary }}
        aria-hidden
      >
        {rank}
      </span>
      <PlayerHeadshot
        playerId={row.playerId}
        espnId={row.playerId}
        name={row.name}
        teamKey={row.teamAbbr}
        size="xs"
        className="shrink-0"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className={cn(type.caption, "truncate font-semibold")}>{row.name}</p>
          <p className={cn(type.caption, "shrink-0 font-bold tabular-nums")}>
            {primary}
          </p>
        </div>
        <div className="mt-px flex items-center gap-1">
          <TeamLogo teamKey={row.teamAbbr} size="2xs" />
          <span className={cn(type.micro, "truncate text-muted-foreground")}>
            {secondary}
          </span>
        </div>
      </div>
    </div>
  );

  if (!row.href) {
    return (
      <li data-motion="row">{inner}</li>
    );
  }
  return (
    <li data-motion="row">
      <AppLink
        href={row.href}
        className="block min-w-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {inner}
      </AppLink>
    </li>
  );
}

export function RookieTrackerBoard({ model }: { model: RookieTrackerModel }) {
  const labelId = useId();
  const initialSort = useMemo(
    () => defaultRookieTrackerSort(model.rows),
    [model.rows]
  );
  const [sort, setSort] = useState<RookieTrackerSort>(initialSort);
  const rows = useMemo(
    () => sortRookieTrackerRows(model.rows, sort).slice(0, ROOKIE_TRACKER_LIMIT),
    [model.rows, sort]
  );
  const leader = useMemo(
    () => rookieRaceLeaderValue(rows, sort),
    [rows, sort]
  );
  const lanes = useMemo(
    () => buildRaceLanes(rows, sort, leader),
    [rows, sort, leader]
  );
  const showRace = lanes.length >= 2;

  return (
    <div className="flex flex-col gap-2">
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
      {/*
        Mobile stacks race above the board. Desktop places the race beside the
        list so the card stays short and secondary.
      */}
      <div
        className={cn(
          "grid min-w-0 gap-2",
          showRace &&
            "lg:grid-cols-[minmax(0,1fr)_minmax(12.5rem,15.5rem)] lg:items-start"
        )}
      >
        {showRace ? (
          <div className="min-w-0 lg:col-start-2 lg:row-start-1">
            <RookieRaceField lanes={lanes} sort={sort} />
          </div>
        ) : null}
        <ol
          data-motion-list
          className={cn(
            "flex min-w-0 flex-col",
            showRace && "lg:col-start-1 lg:row-start-1"
          )}
        >
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
    </div>
  );
}
