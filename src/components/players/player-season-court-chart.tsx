"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { SHOT_ZONE_LABELS, type ShotZoneId } from "@/lib/shots/court-geometry";
import { cn } from "@/lib/utils";

export type PlayerSeasonCourtShot = {
  gameId: string;
  eventId: string;
  x: number;
  y: number;
  made: boolean;
  shotValue: 2 | 3;
  period: number;
  clock: string;
  zone: string;
  season: string;
};

type Filter = "ALL" | "MAKES" | "MISSES" | "2PT" | "3PT";

/**
 * Season-level player court chart — precomputed coordinates only.
 */
export function PlayerSeasonCourtChart({
  shots,
  coverageLabel,
}: {
  shots: PlayerSeasonCourtShot[];
  coverageLabel: string;
}) {
  const [filter, setFilter] = useState<Filter>("ALL");
  const filtered = useMemo(() => {
    return shots.filter((s) => {
      if (filter === "MAKES") return s.made;
      if (filter === "MISSES") return !s.made;
      if (filter === "2PT") return s.shotValue === 2;
      if (filter === "3PT") return s.shotValue === 3;
      return true;
    });
  }, [shots, filter]);

  const width = 500;
  const height = 470;
  const toX = (x: number) => ((x + 25) / 50) * width;
  const toY = (y: number) => height - (y / 47) * height;

  return (
    <figure className="rounded-md border border-border p-3">
      <figcaption className="text-[13px] font-semibold">
        Season shot chart
      </figcaption>
      <p className="mt-0.5 text-[12px] text-muted-foreground">{coverageLabel}</p>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[12px]">
        {(["ALL", "MAKES", "MISSES", "2PT", "3PT"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-md px-2 py-1 font-semibold",
              filter === f
                ? "bg-foreground text-background"
                : "border border-border"
            )}
          >
            {f === "ALL" ? "All" : f === "MAKES" ? "Makes" : f === "MISSES" ? "Misses" : f}
          </button>
        ))}
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mt-3 h-auto w-full max-w-lg"
        role="img"
        aria-label="Player season shot chart"
      >
        <rect width={width} height={height} fill="transparent" stroke="currentColor" strokeOpacity={0.25} />
        <circle cx={width / 2} cy={toY(0)} r={7.5 * (width / 50)} fill="none" stroke="currentColor" strokeOpacity={0.35} />
        <rect
          x={toX(-8)}
          y={toY(19)}
          width={toX(8) - toX(-8)}
          height={toY(0) - toY(19)}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.35}
        />
        {filtered.map((s) => (
          <Link
            key={`${s.gameId}-${s.eventId}`}
            href={`/games/${encodeURIComponent(s.gameId)}?season=${encodeURIComponent(s.season)}`}
            prefetch={false}
          >
            <circle
              cx={toX(s.x)}
              cy={toY(s.y)}
              r={s.made ? 4 : 3.5}
              fill={s.made ? "currentColor" : "transparent"}
              stroke="currentColor"
              strokeWidth={1.25}
              opacity={0.85}
            >
              <title>
                {s.made ? "Make" : "Miss"} {s.shotValue}PT · {s.clock} P{s.period} ·{" "}
                {SHOT_ZONE_LABELS[(s.zone as ShotZoneId) ?? "UNKNOWN"] ?? s.zone}
              </title>
            </circle>
          </Link>
        ))}
      </svg>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Showing {filtered.length} of {shots.length} coordinate shots. Click a
        mark to open the game.
      </p>
    </figure>
  );
}
