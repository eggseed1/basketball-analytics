"use client";

import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
} from "recharts";

import { PlayerHeadshot } from "@/components/brand/player-headshot";
import {
  nearestDotMark,
  sameMarkKey,
  StoreSnapLayer,
  useHoverStore,
  type HoverMark,
} from "@/components/charts/hover-layer";
import { laneOriginLabel, laneUnit, sentimentPct } from "@/components/sentiment/sentiment-source";
import { MoreInfo } from "@/components/ui/more-info";
import { fitNumericDomain } from "@/lib/chart-numeric-domain";
import { useChartTheme } from "@/lib/chart-theme";
import { cdnImageUrl } from "@/lib/cdn-image";
import { type } from "@/lib/design-system";
import { playerHeadshotCandidates, resolveTeamBrand } from "@/lib/nba-brand";
import { parsePortraitPhoto } from "@/lib/portrait-photo";
import { cn } from "@/lib/utils";
import type { SentimentLaneOrigin, TrackedPlayerSentimentRow } from "@/sentiment/curated-types";
import { formatBpm, qualifiesForForm, type SeasonForm } from "@/sentiment/season-form";

type Lane = "media" | "fan";

const PHONE_QUERY = "(max-width: 639px)";

function subscribePhone(notify: () => void) {
  const mq = window.matchMedia(PHONE_QUERY);
  mq.addEventListener("change", notify);
  return () => mq.removeEventListener("change", notify);
}

/** Phones get smaller photos so 120+ players stay readable in a narrow plot. */
function usePhone(): boolean {
  return useSyncExternalStore(
    subscribePhone,
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false
  );
}

/** Smallest and largest photo radius, px. Radius follows how much people are talking. */
const R_MIN = 9;
const R_MAX = 16;

type Point = {
  playerId: string;
  name: string;
  teamKey?: string;
  /** Production on the x axis: this season's BPM, or last season's DRBL/100. */
  x: number;
  /** Tone, −1 to 1. */
  y: number;
  origin: SentimentLaneOrigin;
  volume: number;
  season: string;
  form?: SeasonForm;
  color: string;
  initials: string;
  r: number;
  /** Headshot URLs to try in order. */
  photos: string[];
};

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

function pearson(points: Point[]): number | null {
  if (points.length < 8) return null;
  const n = points.length;
  const mx = points.reduce((s, p) => s + p.x, 0) / n;
  const my = points.reduce((s, p) => s + p.y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const p of points) {
    sxy += (p.x - mx) * (p.y - my);
    sxx += (p.x - mx) ** 2;
    syy += (p.y - my) ** 2;
  }
  if (!sxx || !syy) return null;
  return Math.round((sxy / Math.sqrt(sxx * syy)) * 100) / 100;
}

/**
 * A headshot on a team-colored ring. The ring circle carries the dot key the
 * hover layer snaps to; initials sit under the photo, so a photo that fails to
 * load leaves the player readable.
 */
function HeadshotDot({ cx = 0, cy = 0, payload }: { cx?: number; cy?: number; payload?: Point }) {
  if (!payload) return null;
  const { r } = payload;
  const clipId = `sent-dot-${payload.playerId}`;
  return (
    <g>
      <defs>
        <clipPath id={clipId}>
          <circle cx={cx} cy={cy} r={r - 1} />
        </clipPath>
      </defs>
      <circle
        data-dot-key={payload.playerId}
        cx={cx}
        cy={cy}
        r={r}
        fill="var(--card)"
        stroke={payload.color}
        strokeWidth={2}
      />
      <text
        x={cx}
        y={cy + 3}
        textAnchor="middle"
        fontSize={Math.max(8, r * 0.7)}
        fontWeight={700}
        fill="currentColor"
        fillOpacity={0.55}
        pointerEvents="none"
      >
        {payload.initials}
      </text>
      <image
        href={payload.photos[0]}
        x={cx - r}
        y={cy - r}
        width={r * 2}
        height={r * 2}
        preserveAspectRatio="xMidYMin slice"
        clipPath={`url(#${clipId})`}
        pointerEvents="none"
        data-i="0"
        onLoad={(event) => {
          // The photo is in, so the initials behind it can go.
          const initials = event.currentTarget.previousElementSibling as SVGElement | null;
          if (initials) initials.style.display = "none";
        }}
        onError={(event) => {
          // Try the next source; hide the image once none are left.
          const img = event.currentTarget;
          const next = Number(img.dataset.i ?? "0") + 1;
          const url = payload.photos[next];
          if (url) {
            img.dataset.i = String(next);
            img.setAttribute("href", url);
          } else {
            img.style.display = "none";
          }
        }}
      />
    </g>
  );
}

export function SentimentPerformanceScatter({ rows }: { rows: TrackedPlayerSentimentRow[] }) {
  const router = useRouter();
  const chartTheme = useChartTheme();
  const [lane, setLane] = useState<Lane>("media");
  const phone = usePhone();
  const plotRef = useRef<HTMLDivElement>(null);
  const hover = useHoverStore<HoverMark>(sameMarkKey);
  // On touch, the first tap opens the numbers and a second tap on the same photo opens the player.
  const armed = useRef<string | null>(null);

  // This season's BPM once enough players have a real sample; last season's DRBL/100 before that.
  const useForm = useMemo(
    () => rows.filter((row) => row[lane] && qualifiesForForm(row.form)).length >= 20,
    [lane, rows]
  );
  const xLabel = useForm ? "BPM" : "DRBL/100";

  const points = useMemo(() => {
    const raw = rows.flatMap((row) => {
      const data = row[lane];
      if (!data) return [];
      const production = useForm
        ? qualifiesForForm(row.form)
          ? { x: row.form.bpm, season: row.form.season, form: row.form }
          : null
        : row.performance
          ? { x: row.performance.drbl100, season: row.performance.season, form: undefined }
          : null;
      if (!production) return [];
      return [{ row, data, production }];
    });
    // Radius by the square root of volume, scaled to the busiest player in view.
    const maxVolume = Math.max(1, ...raw.map((item) => item.data.mentionVolume));
    return raw
      .map(({ row, data, production }): Point => {
        const share = Math.sqrt(Math.max(0, data.mentionVolume) / maxVolume);
        return {
          playerId: row.playerId,
          name: row.displayName,
          teamKey: row.teamKey,
          x: production.x,
          y: data.score,
          origin: data.origin ?? "curated",
          volume: data.mentionVolume,
          season: production.season,
          form: production.form,
          color: chartTheme.leagueTeamColor(row.teamKey).color,
          initials: initialsOf(row.displayName),
          r: Math.round((R_MIN + (R_MAX - R_MIN) * share) * (phone ? 0.6 : 1) * 10) / 10,
          photos: playerHeadshotCandidates({ playerId: row.playerId })
            .slice(0, 3)
            .map((url) => cdnImageUrl(parsePortraitPhoto(url).src, R_MAX * 2)),
        };
      })
      // Quietest first, so the busiest players paint on top.
      .sort((a, b) => a.volume - b.volume);
  }, [chartTheme, lane, phone, rows, useForm]);

  const byKey = useMemo(() => new Map(points.map((p) => [p.playerId, p])), [points]);

  const groups = useMemo(() => {
    const byOrigin = new Map<SentimentLaneOrigin, Point[]>();
    for (const p of points) {
      const list = byOrigin.get(p.origin) ?? [];
      list.push(p);
      byOrigin.set(p.origin, list);
    }
    return [...byOrigin.entries()];
  }, [points]);

  const season = points[0]?.season;

  // Whole-number steps of 4 on the x axis; tone stays inside its real −1 to 1 range.
  const xAxis = useMemo(() => {
    const [lo, hi] = fitNumericDomain(
      points.map((p) => p.x),
      { allowNegative: true, includeZero: true, padRatio: 0.06, padAbsolute: 0.5, minSpan: 4 }
    );
    const min = Math.floor(lo / 4) * 4;
    const max = Math.ceil(hi / 4) * 4;
    const ticks: number[] = [];
    for (let v = min; v <= max; v += 4) ticks.push(v);
    return { domain: [min, max] as [number, number], ticks };
  }, [points]);
  const yAxis = useMemo(() => {
    const [lo, hi] = fitNumericDomain(
      points.map((p) => p.y),
      { allowNegative: true, includeZero: true, padRatio: 0.12, padAbsolute: 0.08, minSpan: 0.5 }
    );
    const domain: [number, number] = [Math.max(-1, lo), Math.min(1, hi)];
    return { domain, ticks: [-1, -0.5, 0, 0.5, 1].filter((t) => t >= domain[0] && t <= domain[1]) };
  }, [points]);

  const openHovered = () => {
    const key = hover.get()?.key;
    if (key) router.push(`/players/${encodeURIComponent(key)}?view=sentiment`);
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h2 className={cn(type.bodySm, "font-bold")}>Sentiment vs on-court value</h2>
          <p className={cn(type.caption, "max-w-2xl text-muted-foreground")}>
            Each photo is a player: current {lane} tone against {xLabel}
            {season ? ` from ${season}` : ""}. Bigger photos mean more talk. An association, not cause
            and effect.
          </p>
          <MoreInfo>
            <p>
              Tone describes this week and {xLabel} describes {useForm ? "this season" : "last season"}.
              {useForm ? " BPM ranks players with 8+ games and 15+ minutes a game." : ""} Sources are
              never pooled into one correlation.
            </p>
          </MoreInfo>
        </div>
        <div className="flex gap-1.5" role="group" aria-label="Lane">
          {(["media", "fan"] as const).map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={lane === id}
              onClick={() => setLane(id)}
              className={cn(
                type.caption,
                "glass-pill rounded-md px-2.5 py-1 font-semibold capitalize",
                lane === id ? "glass-pill-active" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {id}
            </button>
          ))}
        </div>
      </div>

      <div className="sports-card p-4">
        {points.length < 3 ? (
          <p className={cn(type.caption, "text-muted-foreground")}>
            Too few players have both a {lane} lane and a {xLabel} to plot.
          </p>
        ) : (
          <div
            key={lane}
            ref={plotRef}
            data-snap-host
            data-sentiment-scatter
            className="relative h-[400px] w-full sm:h-[440px] [&_*]:!outline-none"
            onPointerMove={(event) => {
              if (event.pointerType === "touch") return;
              if (plotRef.current) hover.set(nearestDotMark(plotRef.current, event.clientX, event.clientY));
            }}
            onPointerLeave={(event) => {
              if (event.pointerType !== "touch") hover.set(null);
            }}
            onPointerDown={(event) => {
              if (event.pointerType !== "touch" || !plotRef.current) return;
              const mark = nearestDotMark(plotRef.current, event.clientX, event.clientY);
              armed.current = mark && hover.get()?.key === mark.key ? mark.key : null;
              hover.set(mark);
            }}
            onClick={(event) => {
              const key = hover.get()?.key;
              if (!key) return;
              // The tap that opened the numbers does not also open the player.
              const touch = (event.nativeEvent as PointerEvent).pointerType === "touch";
              if (touch && armed.current !== key) return;
              openHovered();
            }}
          >
            <div
              aria-hidden
              className={cn(
                type.caption,
                "pointer-events-none absolute inset-0 z-10 font-semibold uppercase tracking-wide text-muted-foreground/70"
              )}
            >
              <span className="absolute left-16 top-4">Talked up</span>
              <span className="absolute right-9 top-4">Loved, producing</span>
              <span className="absolute bottom-14 left-16">Panned, struggling</span>
              <span className="absolute bottom-14 right-9">Overlooked</span>
            </div>
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 22, right: 24, bottom: 28, left: 12 }}>
                <CartesianGrid strokeDasharray="2 2" className="stroke-border" strokeOpacity={0.55} />
                <XAxis
                  type="number"
                  dataKey="x"
                  name={xLabel}
                  domain={xAxis.domain}
                  ticks={xAxis.ticks}
                  allowDecimals={false}
                  allowDataOverflow={false}
                  padding={{ left: 10, right: 10 }}
                  tick={{ fontSize: 11 }}
                  label={{ value: xLabel, position: "insideBottom", offset: -16, style: { fontSize: 11 } }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name="Tone"
                  domain={yAxis.domain}
                  ticks={yAxis.ticks}
                  allowDataOverflow={false}
                  padding={{ top: 10, bottom: 10 }}
                  width={48}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => sentimentPct(Number(v))}
                  label={{
                    value: `${lane === "fan" ? "Fan" : "Media"} tone`,
                    angle: -90,
                    position: "insideLeft",
                    offset: 4,
                    style: { fontSize: 11, textAnchor: "middle" },
                  }}
                />
                <ReferenceLine y={0} stroke="currentColor" strokeOpacity={0.3} strokeDasharray="4 4" />
                <ReferenceLine x={0} stroke="currentColor" strokeOpacity={0.3} strokeDasharray="4 4" />
                <Scatter data={points} isAnimationActive={false} shape={HeadshotDot} />
              </ScatterChart>
            </ResponsiveContainer>
            <StoreSnapLayer
              store={hover}
              size={40}
              color={(m) => byKey.get(m.key)?.color ?? "var(--foreground)"}
              render={(m) => {
                const p = byKey.get(m.key);
                if (!p) return null;
                const brand = resolveTeamBrand(p.teamKey);
                return (
                  <>
                    <p className="flex items-center gap-1.5 font-semibold">
                      <PlayerHeadshot playerId={p.playerId} name={p.name} teamKey={p.teamKey} size="xs" />
                      {p.name}
                      {brand?.abbr ? ` · ${brand.abbr}` : ""}
                    </p>
                    <p className="tabular-nums">
                      {laneOriginLabel(p.origin)} tone {sentimentPct(p.y)} · {p.volume.toLocaleString()}{" "}
                      {laneUnit(p.origin)}
                    </p>
                    <p className="tabular-nums">
                      {xLabel} {useForm ? formatBpm(p.x) : `${p.x > 0 ? "+" : ""}${p.x.toFixed(1)}`}
                      {p.form ? ` · ${p.form.gp} GP, ${p.form.mpg.toFixed(1)} mpg` : ""}
                    </p>
                  </>
                );
              }}
            />
          </div>
        )}
        <p className={cn(type.caption, "mt-2 text-muted-foreground")}>
          Dashed lines are neutral tone and average {xLabel}. Hover a photo for the numbers; click it to
          open the player. Rings use team colors.
        </p>
        <ul className={cn(type.caption, "mt-1 flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground")}>
          {groups.map(([origin, data]) => {
            const r = pearson(data);
            return (
              <li key={origin}>
                {laneOriginLabel(origin)}: {data.length} players
                {r != null ? ` · r = ${r.toFixed(2)}` : " · too few for a correlation"}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
