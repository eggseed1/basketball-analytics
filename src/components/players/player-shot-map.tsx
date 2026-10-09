"use client";

import { useMemo, useState, type CSSProperties } from "react";

import { NbaHalfCourtLines } from "@/components/charts/nba-half-court-lines";
import { GlassSurface } from "@/components/brand/glass-surface";
import { useQueryNavOptional } from "@/components/continuity/query-nav";
import { useChartTheme } from "@/lib/chart-theme";
import { type } from "@/lib/design-system";
import { formatNumber, formatPct } from "@/lib/format";
import { COURT_SVG, courtX, courtY } from "@/lib/nba-court";
import { GRADE_BAND_GRADIENT, percentileSavantColor } from "@/lib/player-grade";
import { cn } from "@/lib/utils";
import {
  leagueZoneKey,
  type LeagueShotZones,
  type PlayerShotMap,
} from "@/lib/player-shot-map";

export type {
  PlayerShotDot,
  PlayerShotMap,
  PlayerShotZoneRow,
} from "@/lib/player-shot-map";

type KindFilter = "ALL" | "2PT" | "3PT";
type MapMode = "shots" | "heat";

const BIN_FT = 3;
const MIN_BIN_FGA = 3;
/** FG% gap from league average that maps to the ends of the color scale. */
const FULL_SCALE_GAP = 0.15;

function shortSeason(season: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(season);
  if (!m) return season;
  return `${m[1].slice(2)}-${m[2]}`;
}

function Chip({
  active,
  onClick,
  children,
  className,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        type.caption,
        "glass-pill inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-semibold tabular-nums transition-colors",
        active ? "glass-pill-active" : "text-muted-foreground hover:text-foreground",
        className
      )}
    >
      {children}
    </button>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: ReadonlyArray<readonly [T, string]>;
  onChange: (next: T) => void;
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex rounded-lg bg-foreground/[0.06] p-0.5"
    >
      {options.map(([id, text]) => (
        <button
          key={id}
          type="button"
          aria-pressed={value === id}
          onClick={() => onChange(id)}
          className={cn(
            type.caption,
            "rounded-md px-3 py-1 font-semibold transition-colors",
            value === id
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

/** Savant scale position for a FG% gap vs league: 50 = league average. */
function gapPercentile(gap: number) {
  return Math.max(0, Math.min(100, 50 + (gap / FULL_SCALE_GAP) * 50));
}

/** Absolute FG% fallback when league zone averages are missing. */
function absolutePercentile(fgPct: number) {
  return Math.max(0, Math.min(100, ((fgPct - 0.25) / 0.4) * 100));
}

export function PlayerShotMapView({
  map,
  seasons = [],
  leagueZones = null,
}: {
  map: PlayerShotMap;
  seasons?: string[];
  /** League FGM/FGA by NBA zone for this season, when baked. */
  leagueZones?: LeagueShotZones | null;
}) {
  const queryNav = useQueryNavOptional();
  const { surface } = useChartTheme();
  const [kind, setKind] = useState<KindFilter>("ALL");
  const [showMakes, setShowMakes] = useState(true);
  const [showMisses, setShowMisses] = useState(true);
  const [mode, setMode] = useState<MapMode>("shots");
  const [focusZone, setFocusZone] = useState<string | null>(null);

  const makeColor = percentileSavantColor(90, surface);
  const missColor = percentileSavantColor(10, surface);

  const leagueFg = useMemo(() => {
    const out = new Map<string, number>();
    for (const [zone, [fgm, fga]] of Object.entries(leagueZones ?? {})) {
      if (fga > 0) out.set(zone, fgm / fga);
    }
    return out;
  }, [leagueZones]);
  const leagueFor = (zone: string) => {
    const key = leagueZoneKey(zone);
    return key ? (leagueFg.get(key) ?? null) : null;
  };

  const byKind = useMemo(
    () => map.shots.filter((s) => kind === "ALL" || s.kind === kind),
    [kind, map.shots]
  );
  const visible = useMemo(
    () => byKind.filter((s) => (s.made ? showMakes : showMisses)),
    [byKind, showMakes, showMisses]
  );
  const makes = byKind.filter((s) => s.made).length;
  const misses = byKind.length - makes;
  const fg = byKind.length ? makes / byKind.length : null;

  const bins = useMemo(() => {
    const groups = new Map<
      string,
      { x: number; y: number; fga: number; fgm: number; zones: Map<string, number> }
    >();
    for (const shot of byKind) {
      const cx = Math.round(shot.x / BIN_FT) * BIN_FT;
      const cy = Math.round(shot.y / BIN_FT) * BIN_FT;
      const key = `${cx},${cy}`;
      const cur = groups.get(key) ?? { x: cx, y: cy, fga: 0, fgm: 0, zones: new Map() };
      cur.fga += 1;
      if (shot.made) cur.fgm += 1;
      cur.zones.set(shot.zone, (cur.zones.get(shot.zone) ?? 0) + 1);
      groups.set(key, cur);
    }
    const list = [...groups.values()];
    const max = Math.max(1, ...list.map((b) => b.fga));
    return list
      .map((b) => {
        const zone = [...b.zones.entries()].sort((p, q) => q[1] - p[1])[0]?.[0] ?? "";
        return { ...b, zone, max };
      })
      .sort((a, b) => a.fga - b.fga);
  }, [byKind]);

  const zoneRows = useMemo(() => {
    const groups = new Map<string, { fga: number; fgm: number }>();
    for (const shot of byKind) {
      const cur = groups.get(shot.zone) ?? { fga: 0, fgm: 0 };
      cur.fga += 1;
      if (shot.made) cur.fgm += 1;
      groups.set(shot.zone, cur);
    }
    const total = byKind.length || 1;
    return [...groups.entries()]
      .map(([zone, v]) => ({ zone, ...v, fgPct: v.fga ? v.fgm / v.fga : null, frequency: v.fga / total }))
      .sort((a, b) => b.fga - a.fga);
  }, [byKind]);

  function heatFill(fgm: number, fga: number, zone: string) {
    const pct = fgm / fga;
    const league = leagueFor(zone);
    return percentileSavantColor(
      league == null ? absolutePercentile(pct) : gapPercentile(pct - league),
      surface
    );
  }

  const seasonChips =
    seasons.length > 1 ? (
      <div className="flex flex-wrap gap-1" role="group" aria-label="Shot map season">
        {[...seasons]
          .sort((a, b) => b.localeCompare(a))
          .map((option) => (
            <Chip
              key={option}
              active={option === map.season}
              onClick={() => queryNav?.replaceParams({ season: option })}
            >
              {shortSeason(option)}
            </Chip>
          ))}
      </div>
    ) : null;

  if (map.emptyReason) {
    return (
      <GlassSurface effect="css" className="flex flex-col gap-2 p-4 sm:p-5">
        <h2 className={type.heading}>Shot map</h2>
        <p className={cn(type.bodySm, "text-muted-foreground")}>{map.emptyReason}</p>
        <p className={cn(type.caption, "text-muted-foreground")}>
          Source: {map.source}. Pick another season, or switch between Regular and Playoffs above.
        </p>
        {seasonChips ? <div className="mt-1">{seasonChips}</div> : null}
      </GlassSurface>
    );
  }

  const hasLeague = leagueFg.size > 0;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,21rem)]">
      <GlassSurface effect="css" className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className={type.heading}>Shot map</h2>
            <p className={cn(type.caption, "mt-1 text-muted-foreground")}>
              {map.season} · {map.seasonType === "playoffs" ? "Playoffs" : "Regular season"} ·{" "}
              {map.team}
            </p>
          </div>
          <dl className="flex gap-4 sm:text-right">
            <div>
              <dt className={cn(type.micro, "uppercase tracking-[0.1em] text-muted-foreground")}>FGA</dt>
              <dd className="text-lg font-bold tabular-nums">{formatNumber(byKind.length, 0)}</dd>
            </div>
            <div>
              <dt className={cn(type.micro, "uppercase tracking-[0.1em] text-muted-foreground")}>FG%</dt>
              <dd className="text-lg font-bold tabular-nums">{fg == null ? "—" : formatPct(fg)}</dd>
            </div>
          </dl>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label="Map view"
            value={mode}
            onChange={setMode}
            options={[
              ["shots", "Shots"],
              ["heat", "Hot zones"],
            ]}
          />
          <Segmented
            label="Shot type"
            value={kind}
            onChange={setKind}
            options={[
              ["ALL", "All"],
              ["2PT", "2PT"],
              ["3PT", "3PT"],
            ]}
          />
          {mode === "shots" ? (
            <div className="flex gap-1" role="group" aria-label="Show makes or misses">
              <Chip active={showMakes} onClick={() => setShowMakes((v) => !v || !showMisses)}>
                <span
                  aria-hidden
                  className="size-2.5 rounded-full"
                  style={{ background: makeColor }}
                />
                Makes {formatNumber(makes, 0)}
              </Chip>
              <Chip active={showMisses} onClick={() => setShowMisses((v) => !v || !showMakes)}>
                <span
                  aria-hidden
                  className="size-2.5 rounded-full border-2"
                  style={{ borderColor: missColor }}
                />
                Misses {formatNumber(misses, 0)}
              </Chip>
            </div>
          ) : null}
        </div>

        <div className="mx-auto w-full max-w-lg">
          <svg
            viewBox={`0 0 ${COURT_SVG.width} ${COURT_SVG.height}`}
            className="h-auto w-full rounded-xl bg-foreground/[0.035] text-foreground ring-1 ring-border/50"
            role="img"
            aria-label={`Shot map, ${makes} makes of ${byKind.length} attempts`}
            data-hover-svg
          >
            <NbaHalfCourtLines />
            {mode === "shots"
              ? [...visible]
                  .sort((a, b) => Number(a.made) - Number(b.made))
                  .map((shot, i) => (
                    <circle
                      key={`${shot.x}-${shot.y}-${i}`}
                      data-motion-dot
                      data-hover-point
                      data-tip={`${shot.made ? "Make" : "Miss"} · ${shot.dist.toFixed(0)} ft`}
                      data-tip-sub={`${shot.kind} · ${shot.zone}`}
                      data-zone-on={focusZone && shot.zone === focusZone ? "" : undefined}
                      style={{ "--i": i % 48 } as CSSProperties}
                      cx={courtX(shot.x)}
                      cy={courtY(shot.y)}
                      r={shot.made ? 4.2 : 3.6}
                      fill={shot.made ? makeColor : "none"}
                      fillOpacity={0.85}
                      stroke={shot.made ? "var(--background)" : missColor}
                      strokeWidth={shot.made ? 0.8 : 1.5}
                      strokeOpacity={shot.made ? 0.7 : 0.75}
                    />
                  ))
              : bins.map((bin, i) => {
                  const r = 4 + 13 * Math.sqrt(bin.fga / bin.max);
                  const small = bin.fga < MIN_BIN_FGA;
                  const pct = bin.fgm / bin.fga;
                  const league = leagueFor(bin.zone);
                  return (
                    <circle
                      key={`${bin.x}-${bin.y}`}
                      data-motion-dot
                      data-hover-point
                      data-tip={`${bin.fgm} of ${bin.fga} · ${formatPct(pct)}`}
                      data-tip-sub={`${league != null ? `League ${formatPct(league)} in ${bin.zone}` : bin.zone}${small ? " · small sample" : ""}`}
                      data-zone-on={focusZone && bin.zone === focusZone ? "" : undefined}
                      style={{ "--i": i % 30 } as CSSProperties}
                      cx={courtX(bin.x)}
                      cy={courtY(bin.y)}
                      r={r}
                      fill={small ? "currentColor" : heatFill(bin.fgm, bin.fga, bin.zone)}
                      fillOpacity={small ? 0.07 : 0.88}
                      stroke="var(--background)"
                      strokeWidth={small ? 0 : 0.8}
                    />
                  );
                })}
          </svg>
        </div>

        {mode === "heat" ? (
          <div className="flex flex-col gap-1.5">
            <div className="h-2 w-full rounded-full" style={{ background: GRADE_BAND_GRADIENT }} />
            <div className={cn(type.caption, "flex justify-between text-muted-foreground")}>
              <span>Colder</span>
              <span>{hasLeague ? "League average for the zone" : "45% FG"}</span>
              <span>Hotter</span>
            </div>
            <p className={cn(type.caption, "text-muted-foreground")}>
              Bigger circles mean more attempts from that spot. Spots with fewer than {MIN_BIN_FGA}{" "}
              attempts stay grey.
            </p>
          </div>
        ) : null}

        <p className={cn(type.caption, "text-muted-foreground")}>
          Source: {map.source}.
          {hasLeague ? " League averages come from NBA Stats for the same season." : ""}
        </p>
        {seasonChips}
      </GlassSurface>

      <GlassSurface effect="css" className="flex flex-col gap-3 p-4 sm:p-5">
        <div>
          <h2 className={type.heading}>Shot zones</h2>
          <p className={cn(type.caption, "mt-1 text-muted-foreground")}>
            Bars show the share of attempts.
            {hasLeague ? " FG% is colored against the league average in that zone." : ""}
          </p>
        </div>
        <ul data-hover-group className="flex flex-col gap-3" onMouseLeave={() => setFocusZone(null)}>
          {zoneRows.map((row) => {
            const league = leagueFor(row.zone);
            const pill =
              row.fgPct == null || row.fga < MIN_BIN_FGA
                ? null
                : percentileSavantColor(
                    league == null ? absolutePercentile(row.fgPct) : gapPercentile(row.fgPct - league),
                    surface
                  );
            return (
              <li
                key={row.zone}
                data-hover-item
                onMouseEnter={() => setFocusZone(row.zone)}
                className="group flex flex-col gap-1.5"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className={cn(type.bodySm, "font-semibold")}>{row.zone}</span>
                  <span className={cn(type.caption, "flex items-center gap-2 tabular-nums text-muted-foreground")}>
                    {row.fgm}-{row.fga}
                    <span
                      className="min-w-[3.25rem] rounded-md px-1.5 py-0.5 text-center font-semibold"
                      style={
                        pill
                          ? { background: `color-mix(in oklab, ${pill} 22%, transparent)`, color: "var(--foreground)", boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${pill} 55%, transparent)` }
                          : undefined
                      }
                    >
                      {row.fgPct == null ? "—" : formatPct(row.fgPct)}
                    </span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/[0.07]">
                    <div
                      data-motion-bar="x"
                      className="h-full rounded-full bg-foreground/55 transition-colors group-hover:bg-foreground/85"
                      style={{ width: `${Math.max(2, row.frequency * 100)}%` }}
                    />
                  </div>
                  <span className={cn(type.caption, "w-9 text-right tabular-nums text-muted-foreground")}>
                    {formatPct(row.frequency, 0)}
                  </span>
                </div>
                {league != null ? (
                  <p className={cn(type.caption, "text-muted-foreground")}>
                    League {formatPct(league)}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </GlassSurface>
    </div>
  );
}
