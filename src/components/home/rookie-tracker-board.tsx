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

function teamPaint(teamAbbr: string): { primary: string; secondary: string } {
  const brand = resolveTeamBrand(teamAbbr);
  return {
    primary: brand?.primary ?? "#64748b",
    secondary: brand?.secondary ?? brand?.primary ?? "#94a3b8",
  };
}

/** Draft-class race lanes: team color bars with headshots riding the tip. */
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
      paint: teamPaint(row.teamAbbr),
    }))
    .filter((lane) => lane.share != null)
    .slice(0, RACE_LANES);

  if (lanes.length < 2) return null;

  const metric = SORTS.find((s) => s.id === sort)?.label ?? sort;

  return (
    <div
      role="img"
      aria-label={`Rookie race by ${metric}`}
      className="relative flex flex-col gap-2 rounded-xl border border-border/50 bg-secondary/30 px-3 py-3 pr-4"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-2 right-12 w-px bg-foreground/20"
      />
      <p className={cn(type.caption, "font-semibold text-muted-foreground")}>
        {metric} race · top {lanes.length}
      </p>
      <ul data-motion-list className="flex flex-col gap-2.5">
        {lanes.map((lane, index) => {
          const widthPct = Math.round((lane.share ?? 0) * 1000) / 10;
          const lead = index === 0;
          return (
            <li key={lane.row.key} className="flex items-center gap-2">
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold tabular-nums text-white ring-1 ring-white/30",
                  lead ? "shadow-sm" : "opacity-90"
                )}
                style={{ backgroundColor: lane.paint.primary }}
              >
                {index + 1}
              </span>
              <div className="relative h-8 min-w-0 flex-1">
                <div className="absolute inset-y-1 left-0 right-3 overflow-hidden rounded-full bg-background/55">
                  <span
                    data-motion-bar="x"
                    className="absolute inset-y-0 left-0 origin-left rounded-full"
                    style={{
                      width: `${widthPct}%`,
                      background: `linear-gradient(90deg, ${lane.paint.primary}99, ${lane.paint.primary})`,
                      boxShadow: lead
                        ? `0 0 0 1px ${lane.paint.secondary}66`
                        : undefined,
                    }}
                  />
                </div>
                <span
                  className={cn(
                    type.caption,
                    "pointer-events-none absolute inset-y-0 left-2 z-[1] flex max-w-[70%] items-center truncate font-semibold text-foreground"
                  )}
                >
                  {shortLast(lane.row.name)}
                </span>
                <span
                  className="absolute top-1/2 z-[2] -translate-x-1/2 -translate-y-1/2"
                  style={{
                    left: `clamp(0.75rem, ${widthPct}%, calc(100% - 0.75rem))`,
                  }}
                >
                  <PlayerHeadshot
                    playerId={lane.row.playerId}
                    espnId={lane.row.playerId}
                    name={lane.row.name}
                    teamKey={lane.row.teamAbbr}
                    size="xs"
                    className="ring-2 ring-background shadow-sm"
                  />
                </span>
              </div>
              <span className="w-10 shrink-0 text-right text-[12px] font-bold tabular-nums">
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
      data-motion="row"
      className="flex items-center gap-2.5 rounded-xl px-2 py-2 transition-colors hover:bg-secondary/70"
      style={{
        boxShadow: `inset 3px 0 0 ${paint.primary}`,
      }}
    >
      <span
        className="flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold tabular-nums text-white"
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
      <AppLink
        href={row.href}
        className="block min-w-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
      <ol data-motion-list className="flex flex-col gap-0.5">
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
