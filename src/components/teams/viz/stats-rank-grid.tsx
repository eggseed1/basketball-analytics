import type { CSSProperties } from "react";

import { type } from "@/lib/design-system";
import { formatOrdinal } from "@/lib/format";
import { formatMetricDelta, type RankedMetric } from "@/lib/team-page-metrics";
import { cn } from "@/lib/utils";

import { LegendSwatch, LOSS, VizCard, WIN } from "./viz-kit";

const MIDDLE = "color-mix(in oklab, var(--foreground) 62%, transparent)";

export type RankGridRow = {
  metric: RankedMetric;
  /** Same metric's league rank last season, when both boards have it. */
  prior: { rank: number; of: number } | null;
};

function tone(rank: number, of: number): string {
  if (rank <= Math.ceil(of / 3)) return WIN;
  if (rank > of - Math.ceil(of / 3)) return LOSS;
  return MIDDLE;
}

/**
 * All Stats hero: one track per board metric with a slot for every team,
 * best on the left. The filled slot is this season's rank and the ring is
 * last season's, so movement reads as the gap between them.
 */
export function StatsRankGrid({
  rows,
  season,
  teamKey,
  missingLabels = [],
}: {
  rows: RankGridRow[];
  season: string;
  teamKey: string;
  /** Board stats with no feed this season; listed so their absence is explicit. */
  missingLabels?: string[];
}) {
  const shown = rows.filter((r) => r.metric.rank != null && r.metric.rankDenominator != null);
  if (shown.length < 3) return null;
  const hasPrior = shown.some((r) => r.prior);

  return (
    <VizCard
      title="Rank on every board stat"
      accentKey={teamKey}
      subtitle={`Each track has one slot per team, best on the left. The filled slot is the ${season} rank${hasPrior ? " and the ring is last season's" : ""}. Record ranks within the conference.`}
      footnote={
        missingLabels.length
          ? `Not on this board, so left blank rather than shown as 0: ${missingLabels.join(", ")}.`
          : undefined
      }
      aside={
        <div className="flex flex-wrap gap-3">
          <LegendSwatch color={WIN} label="Top third" />
          <LegendSwatch color={MIDDLE} label="Middle" />
          <LegendSwatch color={LOSS} label="Bottom third" />
          {hasPrior ? <LegendSwatch color="var(--foreground)" outline label="Last season" /> : null}
        </div>
      }
    >
      <div className="flex flex-col gap-1">
        {shown.map(({ metric: m, prior }, ri) => {
          const of = m.rankDenominator as number;
          const rank = m.rank as number;
          const priorRank = prior && prior.of === of ? prior.rank : null;
          const moved = priorRank != null ? priorRank - rank : null;
          const color = tone(rank, of);
          const vsAvg =
            m.differenceFromAverage != null && Number.isFinite(m.differenceFromAverage)
              ? `${formatMetricDelta(m.key, m.differenceFromAverage)} vs league average`
              : null;
          const movedLabel =
            moved == null ? null : moved === 0 ? "same as last season" : `${moved > 0 ? "up" : "down"} ${Math.abs(moved)} from ${formatOrdinal(priorRank!)} last season`;
          return (
            <div
              key={`${m.group}-${m.key}`}
              data-viz-row
              className="grid grid-cols-[6.5rem_minmax(0,1fr)_3.5rem] items-center gap-2 rounded-md px-1 py-1.5 sm:grid-cols-[11rem_minmax(0,1fr)_5.5rem]"
            >
              <div className="min-w-0">
                <p data-viz-label className={cn(type.caption, "truncate font-semibold text-muted-foreground")} title={m.label}>
                  {m.label}
                </p>
                <p className={cn(type.bodySm, "font-bold tabular-nums")}>{m.formattedValue}</p>
              </div>
              <div
                className="grid gap-[2px]"
                style={{ gridTemplateColumns: `repeat(${of}, minmax(0, 1fr))` }}
                role="img"
                aria-label={`${m.label}: ${formatOrdinal(rank)} of ${of}${movedLabel ? `, ${movedLabel}` : ""}`}
              >
                {Array.from({ length: of }, (_, i) => {
                  const slot = i + 1;
                  const current = slot === rank;
                  const was = slot === priorRank && !current;
                  const between =
                    priorRank != null && slot > Math.min(rank, priorRank) && slot < Math.max(rank, priorRank);
                  return (
                    <span
                      key={slot}
                      {...(current
                        ? {
                            "data-viz-mark": "",
                            "data-motion-dot": "",
                            "data-tip": `${formatOrdinal(rank)} of ${of} in ${m.label.toLowerCase()}${m.rankScope ? ` ${m.rankScope}` : ""}`,
                            "data-tip-sub": [m.formattedValue, vsAvg, movedLabel].filter(Boolean).join(" · "),
                            tabIndex: 0,
                          }
                        : {})}
                      className={cn("h-5 rounded-[3px] sm:h-6", current && "relative z-[2]")}
                      style={
                        {
                          background: current
                            ? color
                            : between
                              ? `color-mix(in oklab, ${moved != null && moved > 0 ? WIN : LOSS} 22%, transparent)`
                              : "color-mix(in oklab, var(--foreground) 7%, transparent)",
                          boxShadow: was ? "inset 0 0 0 2px var(--foreground)" : undefined,
                          "--viz-lift": 1.35,
                          "--i": ri * 2,
                        } as CSSProperties
                      }
                    />
                  );
                })}
              </div>
              <div className="text-right">
                <p className={cn(type.bodySm, "font-bold tabular-nums")} style={{ color }}>
                  {formatOrdinal(rank)}
                </p>
                {moved != null && moved !== 0 ? (
                  <p className={cn(type.micro, "font-semibold tabular-nums")} style={{ color: moved > 0 ? WIN : LOSS }}>
                    {moved > 0 ? "▲" : "▼"} {Math.abs(moved)}
                  </p>
                ) : moved === 0 ? (
                  <p className={cn(type.micro, "text-muted-foreground")}>no change</p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </VizCard>
  );
}
