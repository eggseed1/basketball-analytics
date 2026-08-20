"use client";

import { useMemo, useState } from "react";

import { NbaHalfCourtLines } from "@/components/charts/nba-half-court-lines";
import { GlassSurface } from "@/components/brand/glass-surface";
import { useQueryNavOptional } from "@/components/continuity/query-nav";
import { type } from "@/lib/design-system";
import { formatNumber, formatPct } from "@/lib/format";
import { COURT_SVG, courtX, courtY } from "@/lib/nba-court";
import { percentileSavantColor } from "@/lib/player-grade";
import { cn } from "@/lib/utils";
import {
  type PlayerShotMap,
  type PlayerShotZoneRow,
} from "@/lib/player-shot-map";

export type {
  PlayerShotDot,
  PlayerShotMap,
  PlayerShotZoneRow,
} from "@/lib/player-shot-map";

type ShotFilter = "ALL" | "MADE" | "MISS" | "2PT" | "3PT";
type MapMode = "dots" | "frequency" | "efficiency";
type ZoneSort = keyof Pick<
  PlayerShotZoneRow,
  "zone" | "fga" | "fgm" | "fgPct" | "frequency"
>;

const BIN_FT = 1.75;

function shortSeason(season: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(season);
  if (!m) return season;
  return `${m[1].slice(2)}-${m[2]}`;
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        type.caption,
        "rounded-md px-2.5 py-1 font-semibold",
        active
          ? "bg-foreground text-background"
          : "bg-secondary/70 text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

function fgFill(fgPct: number) {
  const t = (fgPct - 0.25) / 0.4;
  return percentileSavantColor(Math.max(0, Math.min(100, t * 100)));
}

export function PlayerShotMapView({
  map,
  seasons = [],
}: {
  map: PlayerShotMap;
  seasons?: string[];
}) {
  const queryNav = useQueryNavOptional();
  const [filter, setFilter] = useState<ShotFilter>("ALL");
  const [mode, setMode] = useState<MapMode>("frequency");
  const [sortKey, setSortKey] = useState<ZoneSort>("fga");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const filtered = useMemo(() => {
    return map.shots.filter((shot) => {
      if (filter === "MADE") return shot.made;
      if (filter === "MISS") return !shot.made;
      if (filter === "2PT") return shot.kind === "2PT";
      if (filter === "3PT") return shot.kind === "3PT";
      return true;
    });
  }, [filter, map.shots]);

  const bins = useMemo(() => {
    const groups = new Map<
      string,
      { x: number; y: number; fga: number; fgm: number }
    >();
    for (const shot of filtered) {
      const cx = Math.round(shot.x / BIN_FT) * BIN_FT;
      const cy = Math.round(shot.y / BIN_FT) * BIN_FT;
      const key = `${cx},${cy}`;
      const cur = groups.get(key) ?? { x: cx, y: cy, fga: 0, fgm: 0 };
      cur.fga += 1;
      if (shot.made) cur.fgm += 1;
      groups.set(key, cur);
    }
    const list = [...groups.values()];
    const max = Math.max(1, ...list.map((b) => b.fga));
    return list.map((b) => ({ ...b, max }));
  }, [filtered]);

  const zoneRows = useMemo(() => {
    const copy = [...map.zones];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "string" || typeof bv === "string") {
        return sortDir === "asc"
          ? String(av).localeCompare(String(bv))
          : String(bv).localeCompare(String(av));
      }
      const an = av ?? -1;
      const bn = bv ?? -1;
      return sortDir === "asc" ? an - bn : bn - an;
    });
    return copy;
  }, [map.zones, sortDir, sortKey]);

  const made = filtered.filter((s) => s.made).length;
  const fg = filtered.length ? made / filtered.length : 0;

  function setSeason(next: string) {
    queryNav?.replaceParams({ season: next });
  }

  const seasonChips =
    seasons.length > 1 ? (
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        <p
          className={cn(
            type.caption,
            "shrink-0 font-semibold uppercase tracking-wide text-muted-foreground"
          )}
        >
          Season
        </p>
        <div className="flex flex-wrap gap-1">
          {[...seasons]
            .sort((a, b) => a.localeCompare(b))
            .map((option) => (
              <Chip
                key={option}
                active={option === map.season}
                onClick={() => setSeason(option)}
              >
                {shortSeason(option)}
              </Chip>
            ))}
        </div>
      </div>
    ) : null;

  function sortBy(key: ZoneSort) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "zone" ? "asc" : "desc");
    }
  }

  function head(
    key: ZoneSort,
    label: string,
    align: "left" | "right" = "right"
  ) {
    return (
      <th
        className={cn(
          "px-2 py-2 font-semibold",
          align === "left" ? "text-left" : "text-right"
        )}
      >
        <button type="button" className="tabular-nums" onClick={() => sortBy(key)}>
          {label}
          {sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
        </button>
      </th>
    );
  }

  if (map.emptyReason) {
    return (
      <GlassSurface effect="css" className="p-4">
        <h2 className={type.title}>Shot map</h2>
        <p className={cn(type.bodySm, "mt-2 text-muted-foreground")}>
          {map.emptyReason}
        </p>
        <p className={cn(type.caption, "mt-2 text-muted-foreground")}>
          Source: {map.source}. Pick a season below, or Regular / Playoffs
          above.
        </p>
        {seasonChips ? <div className="mt-3">{seasonChips}</div> : null}
      </GlassSurface>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)]">
      <GlassSurface effect="css" className="p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className={type.title}>Shot map</h2>
            <p className={cn(type.caption, "mt-1 text-muted-foreground")}>
              {map.season} ·{" "}
              {map.seasonType === "playoffs" ? "Playoffs" : "Regular season"} ·{" "}
              {map.team}. Filled = make, hollow = miss.
            </p>
          </div>
          <p className={cn(type.caption, "tabular-nums text-muted-foreground")}>
            {filtered.length} FGA · {formatPct(fg)} make
          </p>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          {seasonChips}
          <div className="flex flex-wrap gap-1">
            {(
              [
                ["ALL", "All"],
                ["MADE", "Makes"],
                ["MISS", "Misses"],
                ["2PT", "2PT"],
                ["3PT", "3PT"],
              ] as const
            ).map(([id, label]) => (
              <Chip key={id} active={filter === id} onClick={() => setFilter(id)}>
                {label}
              </Chip>
            ))}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {(
            [
              ["dots", "Dots"],
              ["frequency", "Frequency"],
              ["efficiency", "Efficiency"],
            ] as const
          ).map(([id, label]) => (
            <Chip key={id} active={mode === id} onClick={() => setMode(id)}>
              {label}
            </Chip>
          ))}
        </div>

        <div className="mx-auto mt-3 w-full max-w-md">
          <svg
            viewBox={`0 0 ${COURT_SVG.width} ${COURT_SVG.height}`}
            className="h-auto w-full rounded-md bg-foreground/[0.04]"
            role="img"
            aria-label={`Shot map, ${made} makes of ${filtered.length} attempts`}
          >
            <NbaHalfCourtLines />
            {mode === "dots"
              ? filtered.map((shot, i) => (
                  <circle
                    key={`${shot.x}-${shot.y}-${i}`}
                    cx={courtX(shot.x)}
                    cy={courtY(shot.y)}
                    r={shot.kind === "3PT" ? 5 : 4}
                    fill={shot.made ? "currentColor" : "none"}
                    stroke="currentColor"
                    strokeWidth="1.5"
                    opacity={0.8}
                  >
                    <title>
                      {`${shot.made ? "Make" : "Miss"} ${shot.kind} · ${shot.dist.toFixed(0)} ft · ${shot.zone}`}
                    </title>
                  </circle>
                ))
              : bins.map((bin) => {
                  const r = 4 + 10 * Math.sqrt(bin.fga / bin.max);
                  const fgPct = bin.fgm / bin.fga;
                  const fill =
                    mode === "efficiency"
                      ? bin.fga >= 3
                        ? fgFill(fgPct)
                        : "transparent"
                      : "currentColor";
                  const opacity =
                    mode === "frequency"
                      ? 0.25 + 0.7 * (bin.fga / bin.max)
                      : 0.9;
                  return (
                    <circle
                      key={`${bin.x}-${bin.y}`}
                      cx={courtX(bin.x)}
                      cy={courtY(bin.y)}
                      r={r}
                      fill={fill}
                      stroke="currentColor"
                      strokeWidth={mode === "efficiency" && bin.fga < 3 ? 1 : 0}
                      strokeDasharray={
                        bin.fga < 3 && mode === "efficiency" ? "2 2" : undefined
                      }
                      opacity={opacity}
                    >
                      <title>
                        {`${bin.fgm}/${bin.fga} · ${formatPct(fgPct)}${bin.fga < 3 ? " · small sample" : ""}`}
                      </title>
                    </circle>
                  );
                })}
          </svg>
        </div>
        <p className={cn(type.caption, "mt-2 text-muted-foreground")}>
          Source: {map.source}. Efficiency bins with fewer
          than 3 attempts are outlined, not colored.
        </p>
      </GlassSurface>

      <GlassSurface effect="css" className="p-4">
        <h2 className={type.title}>Shot zones</h2>
        <p className={cn(type.caption, "mt-1 text-muted-foreground")}>
          Sort any column. Frequency is share of this map’s attempts.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className={cn(type.caption, "w-full")}>
            <thead>
              <tr>
                {head("zone", "Zone", "left")}
                {head("fga", "FGA")}
                {head("fgm", "FGM")}
                {head("fgPct", "FG%")}
                {head("frequency", "Freq")}
              </tr>
            </thead>
            <tbody>
              {zoneRows.map((row) => (
                <tr key={row.zone} className="border-t border-border/70">
                  <td className="px-2 py-1.5">{row.zone}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {formatNumber(row.fga, 0)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {formatNumber(row.fgm, 0)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {row.fgPct == null ? "-" : formatPct(row.fgPct)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {formatPct(row.frequency, 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassSurface>
    </div>
  );
}
