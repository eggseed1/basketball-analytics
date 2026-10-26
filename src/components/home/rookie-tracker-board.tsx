"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";

import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { TeamLogo } from "@/components/brand/team-logo";
import { ChoiceChip, ChoiceTrack } from "@/components/ui/choice-chip";
import {
  ROOKIE_TRACKER_LIMIT,
  sortRookieTrackerRows,
  type RookieTrackerModel,
  type RookieTrackerRow,
  type RookieTrackerSort,
} from "@/lib/home-rookie-tracker";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

const SORTS: { id: RookieTrackerSort; label: string }[] = [
  { id: "ppg", label: "PTS" },
  { id: "rpg", label: "REB" },
  { id: "apg", label: "AST" },
  { id: "pick", label: "Pick" },
];

function fmt(n: number | null, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

function primaryValue(row: RookieTrackerRow, sort: RookieTrackerSort): string {
  if (sort === "pick") return `#${row.overall}`;
  if (sort === "ppg") return fmt(row.ppg);
  if (sort === "rpg") return fmt(row.rpg);
  return fmt(row.apg);
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
  const [sort, setSort] = useState<RookieTrackerSort>("ppg");
  const rows = useMemo(
    () => sortRookieTrackerRows(model.rows, sort).slice(0, ROOKIE_TRACKER_LIMIT),
    [model.rows, sort]
  );

  return (
    <div className="flex flex-col gap-3">
      <ChoiceTrack aria-labelledby={labelId} className="flex-wrap">
        <span id={labelId} className="sr-only">
          Sort rookies
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
