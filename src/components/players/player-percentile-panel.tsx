"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { TeamWashCard } from "@/components/brand/team-wash-card";
import { TeamLogo } from "@/components/brand/team-logo";
import {
  CareerTeamTrendChart,
  type CareerSeriesPoint,
} from "@/components/players/career-team-trend-chart";
import { formatOrdinal } from "@/lib/format";
import { resolveTeamBrand, teamChartColor } from "@/lib/nba-brand";
import type { StatComp } from "@/lib/player-stat-comps";
import { cn } from "@/lib/utils";

export type { StatComp, CareerSeriesPoint };

export type PercentileCategory =
  | "value"
  | "offense"
  | "shooting"
  | "defense"
  | "advanced";

export type PercentileMetric = {
  id: string;
  category: PercentileCategory;
  label: string;
  /** 0-100 (higher = better) */
  percentile: number;
  display: string;
  /** Raw metric value used for comps. */
  value: number;
  series?: CareerSeriesPoint[];
  leagueComps: StatComp[];
  historicalComps: StatComp[];
};

export type GradeBand =
  | "poor"
  | "below"
  | "average"
  | "good"
  | "great"
  | "elite";

const CATEGORY_META: Array<{
  id: PercentileCategory;
  label: string;
  blurb: string;
}> = [
  { id: "value", label: "Value", blurb: "Overall impact" },
  { id: "offense", label: "Offense", blurb: "Creation & scoring volume" },
  { id: "shooting", label: "Shooting", blurb: "Efficiency" },
  { id: "defense", label: "Defense", blurb: "Stocks & impact" },
  { id: "advanced", label: "Advanced", blurb: "Rates & ratings" },
];

function shortSeason(season: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(season);
  if (!m) return season;
  return `${m[1].slice(2)}-${m[2]}`;
}

export function gradeFromPercentile(percentile: number): {
  band: GradeBand;
  label: string;
} {
  const p = Math.max(0, Math.min(100, percentile));
  if (p < 20) return { band: "poor", label: "Poor" };
  if (p < 40) return { band: "below", label: "Below avg" };
  if (p < 55) return { band: "average", label: "Average" };
  if (p < 75) return { band: "good", label: "Good" };
  if (p < 90) return { band: "great", label: "Great" };
  return { band: "elite", label: "Elite" };
}

const BAND_FILL: Record<GradeBand, string> = {
  poor: "#ff3b30",
  below: "#ff9f0a",
  average: "#8e8e93",
  good: "#0071e3",
  great: "#34c759",
  elite: "#0a7d3e",
};

function MetricRow({
  metric,
  selected,
  onSelect,
}: {
  metric: PercentileMetric;
  selected: boolean;
  onSelect: () => void;
}) {
  const grade = gradeFromPercentile(metric.percentile);
  // Grade-band colors must match the legend key (not team theme wash).
  const fill = BAND_FILL[grade.band];
  const width = Math.max(6, Math.min(100, metric.percentile));

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full rounded-md px-2 py-2 text-left transition-colors",
        selected ? "bg-white/70" : "hover:bg-white/45"
      )}
    >
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-semibold">{metric.label}</span>
        <span className="text-[12px] tabular-nums text-muted-foreground">
          {metric.display}
        </span>
      </div>
      <div className="relative h-2.5 overflow-hidden rounded-full bg-black/[0.06]">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-[width]"
          style={{ width: `${width}%`, backgroundColor: fill }}
        />
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span
          className="text-[11px] font-bold uppercase tracking-wide"
          style={{ color: fill }}
        >
          {grade.label}
        </span>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {formatOrdinal(metric.percentile)} pctile
        </span>
      </div>
    </button>
  );
}

function CompComparePanel({
  metric,
  playerId,
  playerName,
  teamKey,
}: {
  metric: PercentileMetric | undefined;
  playerId: string;
  playerName: string;
  teamKey?: string;
}) {
  const [mode, setMode] = useState<"league" | "history" | "trend">("league");

  if (!metric) {
    return (
      <TeamWashCard
        teamKey={teamKey}
        className="flex flex-col justify-center gap-2 p-5 text-[13px] text-muted-foreground"
      >
        Select a ranking to see similar players.
      </TeamWashCard>
    );
  }

  const comps =
    mode === "league"
      ? metric.leagueComps
      : mode === "history"
        ? metric.historicalComps
        : [];

  const rows =
    mode === "trend"
      ? []
      : [
          {
            playerId,
            playerName,
            season: "",
            teamName: undefined as string | undefined,
            teamKey,
            value: metric.value,
            display: metric.display,
            delta: 0,
            isSelf: true,
          },
          ...comps.map((c) => ({ ...c, isSelf: false })),
        ].sort((a, b) => b.value - a.value);

  const maxAbs = Math.max(
    ...rows.map((r) => Math.abs(r.value)),
    metric.value,
    0.0001
  );

  const grade = gradeFromPercentile(metric.percentile);

  return (
    <TeamWashCard teamKey={teamKey} className="flex flex-col gap-3 p-4 sm:p-5">
      <div>
        <h2 className="text-[17px] font-bold tracking-tight">
          Similar · {metric.label}
        </h2>
        <p className="text-[13px] text-muted-foreground">
          {grade.label} · {formatOrdinal(metric.percentile)} · closest matches
          on this stat
          {mode === "trend" ? " · line color follows team by season" : ""}
        </p>
      </div>

      <div className="flex flex-wrap gap-1">
        {(
          [
            ["league", "This league"],
            ["history", "Historically"],
            ["trend", "Career"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setMode(id)}
            className={cn(
              "rounded-md px-2.5 py-1 text-[12px] font-semibold transition-colors",
              mode === id
                ? "bg-foreground text-background"
                : "bg-white/55 text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "trend" ? (
        metric.series && metric.series.length > 1 ? (
          <CareerTeamTrendChart points={metric.series} />
        ) : (
          <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-black/10 bg-white/50 px-4 py-16 text-center text-[13px] text-muted-foreground">
            {metric.id.startsWith("darko") ||
            metric.id === "lebron" ||
            metric.id === "olebron" ||
            metric.id === "dlebron" ||
            metric.id === "wins"
              ? "No historical series for this impact metric yet — live snapshots are season-specific, not a career timeline."
              : "Not enough seasons to chart this metric yet."}
          </div>
        )
      ) : rows.length <= 1 ? (
        <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-black/10 bg-white/50 px-4 py-16 text-center text-[13px] text-muted-foreground">
          No close comps found for this stat
          {mode === "history" ? " in recent seasons" : " in the league"}.
        </div>
      ) : (
        <ul className="flex max-h-[480px] flex-col gap-2 overflow-y-auto pr-1">
          {rows.map((row) => {
            const width = Math.max(
              4,
              Math.min(100, (Math.abs(row.value) / maxAbs) * 100)
            );
            const deltaLabel =
              row.isSelf || row.delta === 0
                ? "you"
                : `${row.delta > 0 ? "+" : ""}${
                    Math.abs(row.delta) < 1 && Math.abs(row.value) < 2
                      ? row.delta.toFixed(2)
                      : Math.abs(row.delta) < 10
                        ? row.delta.toFixed(1)
                        : Math.round(row.delta)
                  }`;
            const rowBrand = resolveTeamBrand(row.teamKey);
            // Self bar follows the same grade key as percentile rankings;
            // comps keep team primary for identity.
            const barColor = row.isSelf
              ? BAND_FILL[grade.band]
              : (rowBrand?.primary ?? "rgba(29,29,31,0.35)");
            const inner = (
              <>
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span
                    className={cn(
                      "flex min-w-0 items-center gap-1.5 truncate text-[13px]",
                      row.isSelf ? "font-bold" : "font-semibold"
                    )}
                  >
                    {row.teamKey ? (
                      <TeamLogo teamKey={row.teamKey} size="2xs" />
                    ) : null}
                    <span className="truncate">{row.playerName}</span>
                    {!row.isSelf && row.season ? (
                      <span className="ml-0.5 shrink-0 text-[11px] font-medium text-muted-foreground">
                        {shortSeason(row.season)}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">
                    {row.display}
                    {!row.isSelf ? (
                      <span className="ml-1.5 text-[11px]">({deltaLabel})</span>
                    ) : null}
                  </span>
                </div>
                <div className="relative h-2 overflow-hidden rounded-full bg-black/[0.06]">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{ width: `${width}%`, backgroundColor: barColor }}
                  />
                </div>
              </>
            );

            return (
              <li key={`${row.playerId}-${row.season}-${row.isSelf}`}>
                {row.isSelf ? (
                  <div className="rounded-md bg-white/60 px-2 py-2">{inner}</div>
                ) : (
                  <Link
                    href={`/players/${row.playerId}?season=${row.season}`}
                    className="block rounded-md px-2 py-2 transition-colors hover:bg-white/55"
                  >
                    {inner}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </TeamWashCard>
  );
}

export function PlayerPercentilePanel({
  season,
  seasons,
  playerId,
  playerName,
  teamKey,
  metrics,
  /** Canonical season → teamId for timeline coloring. */
  seasonTeams,
}: {
  season: string;
  seasons: string[];
  playerId: string;
  playerName: string;
  teamKey?: string;
  metrics: PercentileMetric[];
  seasonTeams?: Record<string, string>;
}) {
  const categories = useMemo(
    () =>
      CATEGORY_META.filter((c) => metrics.some((m) => m.category === c.id)),
    [metrics]
  );

  const [categoryId, setCategoryId] = useState<PercentileCategory>(
    categories[0]?.id ?? "offense"
  );
  const [activeId, setActiveId] = useState(metrics[0]?.id ?? "");
  const accent = teamChartColor(teamKey).color;

  const visible = useMemo(
    () => metrics.filter((m) => m.category === categoryId),
    [metrics, categoryId]
  );

  const active = useMemo(
    () =>
      metrics.find((m) => m.id === activeId) ??
      visible[0] ??
      metrics[0],
    [metrics, activeId, visible]
  );

  const timeline = useMemo(
    () => [...seasons].sort((a, b) => a.localeCompare(b)),
    [seasons]
  );

  return (
    <div className="grid h-full gap-4 lg:grid-cols-2">
      <TeamWashCard teamKey={teamKey} className="flex flex-col gap-4 p-4 sm:p-5">
        <div>
          <h2 className="text-[17px] font-bold tracking-tight">
            {season} percentile ranking
          </h2>
          <p className="text-[13px] text-muted-foreground">
            Value, offense, shooting, defense, and advanced vs qualified peers.
          </p>
        </div>

        {timeline.length > 0 ? (
          <div className="-mx-1 overflow-x-auto px-1">
            <div
              className="relative flex min-w-max items-center gap-0 py-1"
              role="navigation"
              aria-label="Season timeline"
            >
              <div
                className="pointer-events-none absolute top-[7px] right-4 left-4 h-px bg-border"
                aria-hidden
              />
              {timeline.map((option) => {
                const selected = option === season;
                const seasonTeam = seasonTeams?.[option];
                const dotColor = seasonTeam
                  ? teamChartColor(seasonTeam).color
                  : selected
                    ? accent
                    : undefined;
                return (
                  <Link
                    key={option}
                    href={`/players/${playerId}?season=${option}`}
                    scroll={false}
                    className={cn(
                      "relative z-[1] mx-1 flex min-w-[3.25rem] flex-col items-center gap-1.5 px-1.5 py-0.5 text-center transition-colors",
                      selected
                        ? "text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    aria-current={selected ? "page" : undefined}
                    title={
                      seasonTeam
                        ? `${option} · ${teamChartColor(seasonTeam).abbr}`
                        : option
                    }
                  >
                    <span
                      className={cn(
                        "size-2.5 rounded-full border-2 border-background shadow-sm",
                        !dotColor &&
                          (selected
                            ? "bg-foreground"
                            : "bg-muted-foreground/35")
                      )}
                      style={
                        dotColor ? { backgroundColor: dotColor } : undefined
                      }
                    />
                    <span
                      className={cn(
                        "text-[11px] font-semibold tabular-nums",
                        selected && "underline decoration-2 underline-offset-4"
                      )}
                    >
                      {shortSeason(option)}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        ) : null}

        {categories.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setCategoryId(c.id);
                  const first = metrics.find((m) => m.category === c.id);
                  if (first) setActiveId(first.id);
                }}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[12px] font-semibold transition-colors",
                  categoryId === c.id
                    ? "bg-foreground text-background"
                    : "bg-white/55 text-muted-foreground hover:text-foreground"
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
        ) : null}

        {!metrics.length ? (
          <p className="py-8 text-center text-[13px] text-muted-foreground">
            Percentile rankings unavailable for this season.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-[12px] text-muted-foreground">
              {CATEGORY_META.find((c) => c.id === categoryId)?.blurb}
            </p>
            <ul className="flex max-h-[420px] flex-col gap-2 overflow-y-auto pr-1">
              {visible.map((m) => (
                <li key={m.id}>
                  <MetricRow
                    metric={m}
                    selected={active?.id === m.id}
                    onSelect={() => setActiveId(m.id)}
                  />
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {(
                [
                  ["poor", "Poor"],
                  ["below", "Below"],
                  ["average", "Avg"],
                  ["good", "Good"],
                  ["great", "Great"],
                  ["elite", "Elite"],
                ] as const
              ).map(([band, label]) => (
                <span key={band} className="inline-flex items-center gap-1">
                  <span
                    className="inline-block size-2 rounded-full"
                    style={{ backgroundColor: BAND_FILL[band] }}
                  />
                  {label}
                </span>
              ))}
            </div>
          </div>
        )}
      </TeamWashCard>

      <CompComparePanel
        metric={active}
        playerId={playerId}
        playerName={playerName}
        teamKey={teamKey}
      />
    </div>
  );
}
