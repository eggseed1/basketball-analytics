"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  FrostRechartsTooltip,
  rechartsFrostWrapperStyle,
} from "@/components/brand/frost-recharts-tooltip";
import { laneOriginLabel, sentimentPct } from "@/components/sentiment/sentiment-source";
import { MoreInfo } from "@/components/ui/more-info";
import type { SentimentLaneOrigin, TrackedPlayerSentimentRow } from "@/sentiment/curated-types";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

type Lane = "media" | "fan";

const ORIGIN_COLOR: Record<SentimentLaneOrigin, string> = {
  headlines: "rgb(16 185 129)",
  reddit: "rgb(59 130 246)",
  fans: "rgb(59 130 246)",
  curated: "rgb(245 158 11)",
};

type Point = {
  playerId: string;
  name: string;
  drbl: number;
  score: number;
  origin: SentimentLaneOrigin;
  volume: number;
  season: string;
};

function pearson(points: Point[]): number | null {
  if (points.length < 8) return null;
  const n = points.length;
  const mx = points.reduce((s, p) => s + p.drbl, 0) / n;
  const my = points.reduce((s, p) => s + p.score, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const p of points) {
    sxy += (p.drbl - mx) * (p.score - my);
    sxx += (p.drbl - mx) ** 2;
    syy += (p.score - my) ** 2;
  }
  if (!sxx || !syy) return null;
  return Math.round((sxy / Math.sqrt(sxx * syy)) * 100) / 100;
}

export function SentimentPerformanceScatter({ rows }: { rows: TrackedPlayerSentimentRow[] }) {
  const [lane, setLane] = useState<Lane>("media");

  const points = useMemo(
    () =>
      rows.flatMap((row): Point[] => {
        const data = row[lane];
        if (!data || !row.performance) return [];
        return [
          {
            playerId: row.playerId,
            name: row.displayName,
            drbl: row.performance.drbl100,
            score: data.score,
            origin: data.origin ?? "curated",
            volume: data.mentionVolume,
            season: row.performance.season,
          },
        ];
      }),
    [lane, rows]
  );

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

  const xDomain = useMemo((): [number, number] => {
    if (points.length === 0) return [-1, 1];
    const xs = points.map((p) => p.drbl);
    return [Math.floor(Math.min(0, ...xs)), Math.ceil(Math.max(0, ...xs))];
  }, [points]);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h2 className={cn(type.bodySm, "font-bold")}>Sentiment vs on-court value</h2>
          <p className={cn(type.caption, "max-w-2xl text-muted-foreground")}>
            Each dot is a player: current {lane} tone against DRBL/100
            {season ? ` from ${season}` : ""}. An association, not cause and effect.
          </p>
          <MoreInfo>
            <p>
              Tone describes this week and DRBL describes last season. Colors mark the source,
              and sources are never pooled into one correlation.
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
            Too few players have both a {lane} lane and last season&apos;s DRBL/100 to plot.
          </p>
        ) : (
          <div key={lane} data-sentiment-scatter style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.45} />
                <XAxis
                  type="number"
                  dataKey="drbl"
                  name="DRBL/100"
                  domain={xDomain}
                  allowDecimals={false}
                  tick={{ fontSize: 10 }}
                  label={{ value: "DRBL/100", position: "insideBottomRight", offset: -4, fontSize: 10 }}
                />
                <YAxis
                  type="number"
                  dataKey="score"
                  domain={[-1, 1]}
                  ticks={[-1, -0.5, 0, 0.5, 1]}
                  tickFormatter={(v) => sentimentPct(Number(v))}
                  width={40}
                  tick={{ fontSize: 10 }}
                />
                <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.5} strokeDasharray="4 3" />
                <ReferenceLine x={0} stroke="var(--muted-foreground)" strokeOpacity={0.35} />
                <Tooltip
                  content={({ active, payload }) => {
                    const p = payload?.[0]?.payload as Point | undefined;
                    if (!active || !p) return null;
                    return (
                      <FrostRechartsTooltip active className="w-max">
                        <p className={cn(type.caption, "font-semibold")}>{p.name}</p>
                        <p className={cn(type.caption, "tabular-nums text-muted-foreground")}>
                          {laneOriginLabel(p.origin)} {lane} {sentimentPct(p.score)}
                          {p.origin === "headlines" ? ` · ${p.volume} headlines` : ""}
                        </p>
                        <p className={cn(type.caption, "tabular-nums text-muted-foreground")}>
                          DRBL/100 {p.drbl > 0 ? "+" : ""}
                          {p.drbl.toFixed(1)} ({p.season})
                        </p>
                      </FrostRechartsTooltip>
                    );
                  }}
                  wrapperStyle={rechartsFrostWrapperStyle}
                />
                {groups.map(([origin, data]) => (
                  <Scatter
                    key={origin}
                    name={laneOriginLabel(origin)}
                    data={data}
                    fill={ORIGIN_COLOR[origin]}
                    fillOpacity={origin === "curated" ? 0.55 : 0.9}
                    isAnimationActive={false}
                  />
                ))}
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        )}
        <ul className={cn(type.caption, "mt-2 flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground")}>
          {groups.map(([origin, data]) => {
            const r = pearson(data);
            return (
              <li key={origin} className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="inline-block size-2.5 rounded-full"
                  style={{ background: ORIGIN_COLOR[origin] }}
                />
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
