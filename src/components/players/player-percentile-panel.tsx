"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  Crosshair,
  Gauge,
  Maximize2,
  Shield,
  Target,
  Trophy,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { FrostFloatingSurface } from "@/components/brand/frost-floating-surface";
import {
  GlassSurface,
  type GlassSurfaceHonor,
} from "@/components/brand/glass-surface";
import { TeamLogo } from "@/components/brand/team-logo";
import { useQueryNavOptional } from "@/components/continuity/query-nav";
import { SeasonBarSlider } from "@/components/players/season-bar-slider";
import { PlayerIdentity } from "@/components/players/player-identity";
import { useSetPlayerViewSeason } from "@/components/players/player-view-season";
import { StatTooltip } from "@/components/ui/stat-tooltip";
import { type } from "@/lib/design-system";
import { BoardPlayerName } from "@/lib/board-compact-name";
import { brandAtmosphereColors } from "@/lib/game-matchup-theme";
import { CareerTeamTrendChartLazy as CareerTeamTrendChart } from "@/components/charts/recharts-lazy";
import type { CareerSeriesPoint } from "@/components/players/career-team-trend-chart";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { useChartTheme } from "@/lib/chart-theme";
import type { StatComp } from "@/lib/player-stat-comps";
import type { PlayerCardStint } from "@/lib/player-team-context";
import {
  defaultPercentileMetricId,
  type MetricInterpretation,
  type PercentileMetric,
} from "@/lib/player-percentile-metrics";
import { isHustleStatsSeason } from "@/data/providers/nba/season";
import {
  PERCENTILE_CATEGORY_CHIPS,
  PERCENTILE_CATEGORY_ORDER,
  sheetStatOrderIndex,
  type PercentileCategory,
} from "@/lib/player-stat-sheet-registry";
import {
  gradeFromPercentile,
  percentileSavantColor,
  SAVANT_LEGEND,
  type GradeBand,
} from "@/lib/player-grade";
import { cn } from "@/lib/utils";

export type { StatComp, CareerSeriesPoint };
export type {
  MetricInterpretation,
  PercentileCategory,
  PercentileMetric,
};
export { gradeFromPercentile, type GradeBand };

const CATEGORY_ICONS: Record<PercentileCategory, LucideIcon> = {
  profile: Target,
  shooting: Crosshair,
  defense: Shield,
  hustle: Zap,
  advanced: Gauge,
  impact: Trophy,
};

const CATEGORY_META: Array<{
  id: PercentileCategory;
  label: string;
  icon: LucideIcon;
}> = PERCENTILE_CATEGORY_ORDER.map((id) => ({
  id,
  label: PERCENTILE_CATEGORY_CHIPS.find((chip) => chip.id === id)?.label ?? id,
  icon: CATEGORY_ICONS[id],
}));

/** Fixed label + value columns so every Savant track shares the same start/end. */
const RANK_GRID =
  "grid grid-cols-[6.75rem_minmax(0,1fr)_3.5rem] items-center gap-x-2";

/** Track inset matches pip radius (12px) so 0 / 50 / 100 share one geometry. */
const TRACK_INSET_PX = 12;

/** 24px pip stays on the track (Savant). */
function savantMarkLeft(pct: number) {
  const t = Math.max(0, Math.min(100, pct)) / 100;
  return `calc(${TRACK_INSET_PX}px + (100% - ${TRACK_INSET_PX * 2}px) * ${t})`;
}

function ScaleLegend() {
  return (
    <div className={cn(RANK_GRID, "px-4")} aria-hidden>
      <span />
      <span className="relative h-[22px] w-full min-w-0 overflow-hidden">
        {(
          [
            // Edge labels pin to track ends so Poor/Great never collide with Avg.
            ["Poor", SAVANT_LEGEND.poor, 0, "0%"],
            ["Avg", SAVANT_LEGEND.average, 50, "50%"],
            ["Great", SAVANT_LEGEND.great, 100, "100%"],
          ] as const
        ).map(([label, color, pct, left]) => (
          <span
            key={label}
            className="absolute bottom-0 flex flex-col items-center leading-none"
            style={{
              left,
              color,
              transform:
                pct === 0
                  ? "translateX(0)"
                  : pct === 100
                    ? "translateX(-100%)"
                    : "translateX(-50%)",
            }}
          >
            <span
              className={cn(
                type.caption,
                "font-bold uppercase leading-none tracking-wide"
              )}
            >
              {label}
            </span>
            <svg width="8" height="6" viewBox="0 0 8 6" aria-hidden>
              <polygon points="4,6 0,0 8,0" fill="currentColor" />
            </svg>
          </span>
        ))}
      </span>
      <span />
    </div>
  );
}

function shortSeason(season: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(season);
  if (!m) return season;
  return `${m[1].slice(2)}-${m[2]}`;
}

function formatDelta(delta: number, value: number) {
  const digits =
    Math.abs(delta) < 1 && Math.abs(value) < 2
      ? 2
      : Math.abs(delta) < 10
        ? 1
        : 0;
  const mag =
    digits === 0 ? String(Math.round(Math.abs(delta))) : Math.abs(delta).toFixed(digits);
  const sign = delta < 0 ? "−" : "+";
  return `${sign}${mag}`;
}

function MetricRow({
  metric,
  selected,
  onSelect,
}: {
  metric: PercentileMetric;
  selected: boolean;
  onSelect: () => void;
}) {
  const pct = Math.max(0, Math.min(100, metric.percentile));
  const fill = percentileSavantColor(pct);

  const caption =
    metric.interpretation === "descriptive"
      ? "Volume · not a skill grade"
      : metric.interpretation === "role"
        ? "Role context"
        : null;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={
        metric.showPercentile
          ? `${metric.label}, ${Math.round(metric.percentile)}th percentile, ${metric.display}`
          : `${metric.label}, ${metric.display}`
      }
      className={cn(
        RANK_GRID,
        "w-full whitespace-nowrap px-4 py-1.5 text-left transition-colors",
        selected ? "bg-foreground/8" : "hover:bg-foreground/5"
      )}
    >
      <span
        className={cn(type.bodySm, "min-w-0 truncate text-left font-semibold")}
        onClick={(event) => event.stopPropagation()}
      >
        <StatTooltip nestable stat={metric.id} className="whitespace-nowrap">
          {metric.label}
        </StatTooltip>
      </span>
      <span className="relative flex h-7 w-full min-w-0 items-center overflow-hidden">
        {metric.showPercentile ? (
          <>
            {([0, 50, 100] as const).map((mark) => (
              <span
                key={mark}
                className="pointer-events-none absolute inset-y-0 w-px -translate-x-1/2 bg-foreground/25"
                style={{ left: savantMarkLeft(mark) }}
                aria-hidden
              />
            ))}
            <span
              className="absolute inset-y-[8px] rounded-full bg-foreground/[0.08]"
              aria-hidden
              style={{ left: TRACK_INSET_PX, right: TRACK_INSET_PX }}
            />
            <span
              className="absolute inset-y-[8px] rounded-full"
              aria-hidden
              style={{
                left: TRACK_INSET_PX,
                width: `calc((100% - ${TRACK_INSET_PX * 2}px) * ${pct / 100})`,
                backgroundColor: fill,
              }}
            />
            <span
              className={cn(
                type.caption,
                "absolute top-1/2 z-[1] flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background font-bold tabular-nums text-foreground"
              )}
              style={{ left: savantMarkLeft(pct) }}
              aria-hidden
            >
              {Math.round(metric.percentile)}
            </span>
          </>
        ) : (
          <span className={cn(type.caption, "text-muted-foreground")}>
            {caption ?? "-"}
          </span>
        )}
      </span>
      <span
        className={cn(
          type.bodySm,
          "shrink-0 text-right font-semibold tabular-nums"
        )}
      >
        {metric.display}
      </span>
    </button>
  );
}

type CompRowModel = {
  playerId: string;
  playerName: string;
  season: string;
  teamKey?: string;
  stints?: PlayerCardStint[];
  value: number;
  display: string;
  delta: number;
  /** League percentile (same peer pool as the ranking). Drives the track. */
  percentile: number;
  isSelf: boolean;
};

const VISIBLE_COMP_ROWS = 3;
/** Name + bar + padding - keeps exactly three rows in view. */
const COMP_ROW_HEIGHT_CLASS = "h-[3.5rem]";

function formatPercentileTip(display: string, percentile: number) {
  const pct = Math.max(0, Math.min(100, Math.round(percentile)));
  return `${display} · ${pct}th pct`;
}

function CompMarkTip({
  label,
  value,
  left,
  className,
  children,
}: {
  label: string;
  value: string;
  left: string;
  className?: string;
  children: ReactNode;
}) {
  const tipId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null
  );
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setCoords(null);
      return;
    }
    const rect = triggerRef.current.getBoundingClientRect();
    const width = 180;
    const tipHeight = 48;
    setCoords({
      top: Math.max(8, rect.top - 8 - tipHeight),
      left: Math.min(
        Math.max(8, rect.left + rect.width / 2 - width / 2),
        window.innerWidth - width - 8
      ),
    });
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-describedby={open ? tipId : undefined}
        aria-label={`${label}, ${value}`}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className={cn(
          "absolute top-1/2 z-[2] flex -translate-x-1/2 -translate-y-1/2 items-center justify-center border-0 bg-transparent p-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className
        )}
        style={{ left }}
      >
        {children}
      </button>
      {mounted && open && coords
        ? createPortal(
            <FrostFloatingSurface
              id={tipId}
              role="tooltip"
              className="pointer-events-none z-[80] w-[180px] px-2.5 py-1.5"
              style={{
                position: "fixed",
                top: coords.top,
                left: coords.left,
              }}
            >
              <p className={cn(type.caption, "font-semibold")}>{label}</p>
              <p className={cn(type.caption, "text-muted-foreground")}>
                {value}
              </p>
            </FrostFloatingSurface>,
            document.body
          )
        : null}
    </>
  );
}

function CompRow({
  row,
  focalName,
  focalPercentile,
  focalDisplay,
  focalColor,
}: {
  row: CompRowModel;
  focalName: string;
  /** Focal player's league percentile on the same 0–100 track. */
  focalPercentile: number;
  focalDisplay: string;
  /** Focal player's team color (gap gradient + tick). */
  focalColor: string;
}) {
  const chartTheme = useChartTheme();
  const pos = Math.max(0, Math.min(100, row.percentile));
  const focalPos = Math.max(0, Math.min(100, focalPercentile));
  // Single formula for marks + gap so they stay aligned.
  const markLeft = (pct: number) =>
    `calc(8px + (100% - 16px) * ${pct / 100})`;
  const color = chartTheme.teamColor(row.teamKey).color;
  const lo = Math.min(pos, focalPos);
  const hi = Math.max(pos, focalPos);
  const gapWidth = hi - lo;
  // Gradient follows left→right mark order on the track.
  const gapFrom = pos <= focalPos ? color : focalColor;
  const gapTo = pos <= focalPos ? focalColor : color;

  return (
    <div
      className={cn(
        "flex flex-col justify-center rounded-md px-2 py-1",
        COMP_ROW_HEIGHT_CLASS,
        row.isSelf ? "frost-surface" : "frost-surface-hover"
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <PlayerIdentity
          playerId={row.playerId}
          name={row.playerName}
          teamKey={row.teamKey}
          stints={row.stints}
          season={row.season || undefined}
          variant="compact"
          className="min-w-0 flex-1"
          nameClassName={cn(type.bodySm, "gap-1.5")}
        >
          {row.teamKey ? <TeamLogo teamKey={row.teamKey} size="2xs" /> : null}
          <span className={cn("min-w-0", row.isSelf && "font-bold")}>
            <BoardPlayerName name={row.playerName} />
          </span>
          {row.isSelf ? (
            <span
              className={cn(
                type.caption,
                "shrink-0 font-medium text-muted-foreground"
              )}
            >
              this page
            </span>
          ) : row.season ? (
            <span
              className={cn(
                type.caption,
                "shrink-0 font-medium text-muted-foreground"
              )}
            >
              {shortSeason(row.season)}
            </span>
          ) : null}
        </PlayerIdentity>
        <span
          className={cn(
            type.caption,
            "flex shrink-0 items-baseline gap-1.5 tabular-nums text-muted-foreground"
          )}
        >
          <span className="font-semibold text-foreground">{row.display}</span>
          {!row.isSelf ? <span>{formatDelta(row.delta, row.value)}</span> : null}
        </span>
      </div>
      <div className="relative mt-1 h-4">
        <div
          className="absolute inset-x-2 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-foreground/[0.08]"
          aria-hidden
        />
        {!row.isSelf && gapWidth > 0.5 ? (
          <div
            className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full"
            style={{
              left: markLeft(lo),
              width: `calc((100% - 16px) * ${gapWidth / 100})`,
              backgroundImage: `linear-gradient(90deg, ${gapFrom}, ${gapTo})`,
            }}
            aria-hidden
          />
        ) : null}
        {!row.isSelf ? (
          <CompMarkTip
            label={focalName}
            value={formatPercentileTip(focalDisplay, focalPercentile)}
            left={markLeft(focalPos)}
            className="z-[1]"
          >
            <span
              className="block h-3.5 w-1 rounded-sm ring-1 ring-background"
              style={{ backgroundColor: focalColor }}
              aria-hidden
            />
          </CompMarkTip>
        ) : null}
        <CompMarkTip
          label={row.playerName}
          value={formatPercentileTip(row.display, row.percentile)}
          left={markLeft(pos)}
          className="z-[2]"
        >
          <span
            className="block size-3 rounded-full border-2 border-background shadow-sm"
            style={{ backgroundColor: color }}
            aria-hidden
          />
        </CompMarkTip>
      </div>
    </div>
  );
}

function CompComparePanel({
  metric,
  playerId,
  playerName,
  teamKey,
  stints,
  viewSeason,
  seasons,
  onSeasonSelect,
  inline = false,
  chartHeight: chartHeightProp,
  visibleCompRows,
}: {
  metric: PercentileMetric | undefined;
  playerId: string;
  playerName: string;
  teamKey?: string;
  stints?: PlayerCardStint[];
  viewSeason: string;
  seasons: string[];
  onSeasonSelect: (season: string) => void;
  /** Renders under the selected metric row — no duplicate title. */
  inline?: boolean;
  chartHeight?: number;
  visibleCompRows?: number;
}) {
  const chartTheme = useChartTheme();
  const [mode, setMode] = useState<"league" | "history">("league");

  if (!metric) {
    return (
      <p className={cn(type.bodySm, "text-muted-foreground")}>
        Select a ranking to see the graph and similar players.
      </p>
    );
  }

  const comps =
    mode === "league" ? metric.leagueComps : metric.historicalComps;
  const baseRows = [
    {
      playerId,
      playerName,
      season: "",
      teamKey,
      stints,
      value: metric.value,
      display: metric.display,
      delta: 0,
      percentile: metric.percentile,
      isSelf: true,
    },
    ...comps.map((c) => ({ ...c, isSelf: false as const })),
  ];
  // Sort by raw metric so the list reads like a mini leaderboard for this set.
  const invert = metric.interpretation === "lower_is_better";
  baseRows.sort((a, b) =>
    invert ? a.value - b.value : b.value - a.value
  );

  const rows: CompRowModel[] = baseRows;
  const focalPercentile =
    rows.find((r) => r.isSelf)?.percentile ?? metric.percentile;
  const focalColor = chartTheme.teamColor(teamKey).color;

  const hasSeries = Boolean(metric.series && metric.series.length > 1);

  const resolveSeason = (raw: string) => {
    if (seasons.includes(raw)) return raw;
    const short =
      raw.length <= 5 && raw.includes("-") ? raw : raw.slice(2);
    return (
      seasons.find((s) => s === raw || s.slice(2) === short || s.endsWith(short)) ??
      raw
    );
  };

  const handleChartSeason = (raw: string) => {
    const next = resolveSeason(raw);
    if (next && seasons.includes(next)) onSeasonSelect(next);
  };

  const chartHeight = chartHeightProp ?? (inline ? 140 : 180);
  const compRowCount = visibleCompRows ?? VISIBLE_COMP_ROWS;

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col",
        inline ? "gap-3 py-2" : "h-full gap-3"
      )}
    >
      {!inline ? <h2 className={type.heading}>{metric.label}</h2> : null}

      <div className="min-w-0 shrink-0">
        {hasSeries ? (
          <CareerTeamTrendChart
            points={metric.series!}
            height={chartHeight}
            savantScale
            selectedSeason={viewSeason}
            onSeasonSelect={handleChartSeason}
          />
        ) : (
          <p className={cn(type.bodySm, "text-muted-foreground")}>
            {metric.id.startsWith("darko") ||
            metric.id === "raptor" ||
            metric.id === "oraptor" ||
            metric.id === "draptor"
              ? "No career series for this impact metric yet."
              : "Not enough seasons to chart this metric yet."}
          </p>
        )}
      </div>
      {metric.id === "r1WinEquivalents" ||
      metric.id.startsWith("drbl") ? (
        <p className={cn(type.caption, "text-muted-foreground")}>
          DRBL / WAR1 coverage starts in 2020-21. Switch to DARKO for earlier seasons.
        </p>
      ) : null}

      <div className="h-px shrink-0 bg-border" aria-hidden />

      <div className="flex min-h-0 flex-col gap-1.5">
        <div className="flex flex-col gap-1.5">
          <p className={cn(type.caption, "font-semibold text-foreground")}>
            Closest {metric.label} this season
          </p>
          <div className="flex flex-wrap gap-1">
            {(
              [
                ["league", "This season"],
                ["history", "Other seasons"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                aria-pressed={mode === id}
                className={cn(
                  type.caption,
                  "glass-pill rounded-md px-2.5 py-1 font-semibold transition-colors",
                  mode === id
                    ? "glass-pill-active"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {rows.length <= 1 ? (
          <p
            className={cn(type.bodySm, "text-muted-foreground")}
            style={{
              minHeight: `calc(${compRowCount} * 3.5rem + ${compRowCount - 1} * 0.25rem)`,
            }}
          >
            No close comps found for this stat
            {mode === "history" ? " across other seasons" : " in the league"}.
          </p>
        ) : (
          <ul
            className="flex min-h-0 flex-col gap-1 overflow-y-auto overscroll-contain pr-1"
            style={{
              height: `calc(${compRowCount} * 3.5rem + ${compRowCount - 1} * 0.25rem)`,
            }}
          >
            {rows.map((row) => (
              <li key={`${row.playerId}-${row.season}-${row.isSelf}`}>
                <CompRow
                  row={row}
                  focalName={playerName}
                  focalPercentile={focalPercentile}
                  focalDisplay={metric.display}
                  focalColor={focalColor}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}


type SeasonMetricsCache = {
  metrics: PercentileMetric[];
  teamKey?: string;
};

const percentileCache = new Map<string, SeasonMetricsCache>();

function PercentileHeatTile({
  metric,
  selected,
  onSelect,
}: {
  metric: PercentileMetric;
  selected: boolean;
  onSelect: () => void;
}) {
  const pct = Math.max(0, Math.min(100, metric.percentile));
  const fill = metric.showPercentile
    ? percentileSavantColor(pct)
    : "color-mix(in oklch, var(--muted) 70%, transparent)";

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex flex-col gap-1.5 rounded-md border px-2.5 py-2 text-left transition-colors",
        selected
          ? "border-foreground/40 bg-foreground/8"
          : "border-border/70 bg-background/40 hover:border-foreground/25 hover:bg-foreground/5"
      )}
    >
      <span className="flex items-baseline justify-between gap-2">
        <span className={cn(type.caption, "font-semibold text-foreground")}>
          {metric.label}
        </span>
        <span className={cn(type.caption, "tabular-nums text-muted-foreground")}>
          {metric.display}
        </span>
      </span>
      <span className="relative h-2 w-full overflow-hidden rounded-full bg-foreground/10">
        <span
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: metric.showPercentile ? `${pct}%` : "100%",
            backgroundColor: fill,
          }}
        />
      </span>
      <span className="flex items-center justify-between gap-2">
        <span
          className={cn(type.caption, "font-bold tabular-nums")}
          style={{ color: metric.showPercentile ? fill : undefined }}
        >
          {metric.showPercentile ? `${Math.round(pct)}` : "—"}
        </span>
        <span className={cn(type.caption, "text-muted-foreground")}>
          {metric.showPercentile ? "pct" : "n/a"}
        </span>
      </span>
    </button>
  );
}

function PercentileExpandDialog({
  open,
  onClose,
  playerName,
  viewSeason,
  timeline,
  seasonTeams,
  seasonTeamKeys,
  accent,
  busy,
  onCommitSeason,
  grouped,
  listed,
  active,
  activeId,
  onSelectMetric,
  playerId,
  viewTeamKey,
  stints,
  hustleEmptyCopy,
}: {
  open: boolean;
  onClose: () => void;
  playerName: string;
  viewSeason: string;
  timeline: string[];
  seasonTeams?: Record<string, string>;
  seasonTeamKeys?: Record<string, string[]>;
  accent: string;
  busy: boolean;
  onCommitSeason: (season: string) => void;
  grouped: Array<{
    id: PercentileCategory;
    label: string;
    icon: LucideIcon;
    metrics: PercentileMetric[];
  }>;
  listed: PercentileMetric[];
  active: PercentileMetric | undefined;
  activeId: string;
  onSelectMetric: (id: string) => void;
  playerId: string;
  viewTeamKey?: string;
  stints?: PlayerCardStint[];
  hustleEmptyCopy: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open) {
      if (!el.open) el.showModal();
    } else if (el.open) {
      el.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby={titleId}
      className={cn(
        "fixed inset-[0.75rem] z-[80] m-0 h-[calc(100dvh-1.5rem)] w-[calc(100dvw-1.5rem)] max-h-none max-w-none",
        "rounded-lg border border-border bg-background p-0 shadow-2xl",
        "backdrop:bg-black/50",
        "open:flex open:flex-col"
      )}
    >
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2
            id={titleId}
            className={cn(type.heading, "truncate tracking-tight")}
          >
            {playerName} · {viewSeason} percentiles
          </h2>
          <p className={cn(type.caption, "mt-0.5 text-muted-foreground")}>
            All rankings for this season. Select a metric for career chart and
            similar players.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
          aria-label="Close full percentiles"
        >
          <X className="size-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
        {timeline.length > 0 ? (
          <div className={cn("mb-4", busy && "opacity-80")}>
            <SeasonBarSlider
              seasons={timeline}
              value={viewSeason}
              seasonTeams={seasonTeams}
              seasonTeamKeys={seasonTeamKeys}
              accentColor={accent}
              onCommit={onCommitSeason}
            />
          </div>
        ) : null}

        {!listed.length ? (
          <p className={cn(type.bodySm, "py-10 text-center text-muted-foreground")}>
            Percentile rankings unavailable for this season.
          </p>
        ) : (
          <div className="grid items-start gap-5 xl:grid-cols-[minmax(14rem,1.35fr)_minmax(18rem,24rem)]">
            <div className="flex min-w-0 flex-col gap-5 overflow-hidden">
              <section aria-label="Percentile overview">
                <h3 className={cn(type.bodySm, "mb-2 font-bold")}>Overview</h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                  {listed.map((metric) => (
                    <PercentileHeatTile
                      key={metric.id}
                      metric={metric}
                      selected={activeId === metric.id}
                      onSelect={() => onSelectMetric(metric.id)}
                    />
                  ))}
                </div>
              </section>

              {grouped.map((section) => {
                const Icon = section.icon;
                return (
                  <section key={section.id} aria-label={section.label}>
                    <div className="mb-1.5 flex items-center gap-1.5 border-b border-foreground/20 pb-1.5">
                      <Icon
                        className="size-3.5 shrink-0"
                        strokeWidth={2.25}
                        aria-hidden
                      />
                      <h3 className={cn(type.bodySm, "font-bold")}>
                        {section.label}
                      </h3>
                    </div>
                    <ScaleLegend />
                    {section.metrics.length === 0 ? (
                      <p
                        className={cn(
                          type.bodySm,
                          "py-4 text-muted-foreground"
                        )}
                      >
                        {section.id === "hustle"
                          ? hustleEmptyCopy
                          : "No rankings in this category for this season."}
                      </p>
                    ) : (
                    <ul>
                      {section.metrics.map((m, i) => {
                        const isActive = activeId === m.id;
                        return (
                          <li
                            key={m.id}
                            className={cn(
                              !isActive &&
                                i < section.metrics.length - 1 &&
                                "border-b border-dashed border-border/80"
                            )}
                          >
                            <MetricRow
                              metric={m}
                              selected={isActive}
                              onSelect={() => onSelectMetric(m.id)}
                            />
                          </li>
                        );
                      })}
                    </ul>
                    )}
                  </section>
                );
              })}
            </div>

            <aside
              className="min-w-0 overflow-hidden xl:sticky xl:top-0"
              aria-label="Selected metric visualization"
            >
              <div
                className="min-w-0 overflow-hidden rounded-md border border-border/60 frost-surface-muted p-3 sm:p-4"
                style={{ borderLeftColor: accent, borderLeftWidth: 2 }}
              >
                <div className="mb-3 flex flex-col gap-0.5 border-b border-border/50 pb-2">
                  <span className={cn(type.bodySm, "font-semibold text-foreground")}>
                    {active?.label ?? "Select a metric"}
                  </span>
                  <span className={cn(type.caption, "text-muted-foreground")}>
                    Career chart & similar players
                  </span>
                </div>
                <CompComparePanel
                  metric={active}
                  playerId={playerId}
                  playerName={playerName}
                  teamKey={viewTeamKey}
                  stints={stints}
                  viewSeason={viewSeason}
                  seasons={timeline}
                  onSeasonSelect={onCommitSeason}
                  chartHeight={220}
                  visibleCompRows={6}
                />
              </div>
            </aside>
          </div>
        )}
      </div>
    </dialog>
  );
}

function cacheKey(playerId: string, season: string) {
  return `${playerId}:${season}`;
}

function readCache(playerId: string, season: string) {
  return percentileCache.get(cacheKey(playerId, season));
}

function writeCache(
  playerId: string,
  season: string,
  value: SeasonMetricsCache
) {
  percentileCache.set(cacheKey(playerId, season), value);
}

async function fetchPercentiles(
  playerId: string,
  season: string,
  mode: "fast" | "full" = "fast"
): Promise<SeasonMetricsCache | null> {
  const res = await fetch(
    `/api/players/${encodeURIComponent(playerId)}/percentiles?season=${encodeURIComponent(season)}&mode=${mode}`
  );
  if (!res.ok) return null;
  const json = (await res.json()) as SeasonMetricsCache & { season?: string };
  if (!json.metrics) return null;
  const payload = { metrics: json.metrics, teamKey: json.teamKey };
  // Never cache empty payloads — historical peer boards can fail transiently.
  if (payload.metrics.length > 0) {
    writeCache(playerId, json.season ?? season, payload);
  }
  return payload;
}

/** Update ?season= without triggering a full App Router RSC refetch. */
function replaceSeasonInUrl(season: string) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("season", season);
  window.history.replaceState(window.history.state, "", url.toString());
}

function neighborSeasons(seasons: string[], current: string): string[] {
  const i = seasons.indexOf(current);
  if (i < 0) return seasons.slice(0, 2);
  const ordered: string[] = [];
  for (let d = 1; d < seasons.length; d++) {
    if (i - d >= 0) ordered.push(seasons[i - d]);
    if (i + d < seasons.length) ordered.push(seasons[i + d]);
  }
  return ordered;
}

export function PlayerPercentilePanel({
  season,
  seasons,
  playerId,
  playerName,
  teamKey,
  metrics,
  seasonTeams,
  stintsBySeason,
  honor,
}: {
  season: string;
  seasons: string[];
  playerId: string;
  playerName: string;
  teamKey?: string;
  metrics: PercentileMetric[];
  seasonTeams?: Record<string, string>;
  stintsBySeason?: Record<string, PlayerCardStint[]>;
  honor?: GlassSurfaceHonor;
}) {
  const chartTheme = useChartTheme();
  const queryNav = useQueryNavOptional();
  const setViewSeasonShared = useSetPlayerViewSeason();
  const fetchGen = useRef(0);
  const desiredSeason = useRef(season);

  const [viewSeason, setViewSeason] = useState(season);
  const [viewMetrics, setViewMetrics] = useState(metrics);
  const [viewTeamKey, setViewTeamKey] = useState(teamKey);
  const [busy, setBusy] = useState(false);

  const applyCached = useCallback(
    (nextSeason: string, next: SeasonMetricsCache) => {
      writeCache(playerId, nextSeason, next);
      setViewSeason(nextSeason);
      setViewMetrics(next.metrics);
      setViewTeamKey(next.teamKey);
    },
    [playerId]
  );

  useEffect(() => {
    if (metrics.length > 0) {
      writeCache(playerId, season, { metrics, teamKey });
    }
    if (season !== desiredSeason.current) return;
    setViewSeason(season);
    if (metrics.length > 0) {
      setViewMetrics(metrics);
      setViewTeamKey(teamKey);
    }
    setBusy(false);
  }, [metrics, playerId, season, teamKey]);

  // SSR ships fast metrics; upgrade sparklines + YoY peers when idle.
  const hydratedFull = useRef(false);
  useEffect(() => {
    if (hydratedFull.current) return;
    hydratedFull.current = true;
    let cancelled = false;
    const targetSeason = season;
    const hydrate = () => {
      void fetchPercentiles(playerId, targetSeason, "full").then((json) => {
        if (cancelled || !json) return;
        if (desiredSeason.current !== targetSeason) return;
        applyCached(targetSeason, json);
      });
    };
    if (typeof requestIdleCallback === "function") {
      const idleId = requestIdleCallback(hydrate);
      return () => {
        cancelled = true;
        cancelIdleCallback(idleId);
      };
    }
    const timeoutId = window.setTimeout(hydrate, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [applyCached, playerId, season]);

  const urlSeason = queryNav?.searchParams.get("season");
  useEffect(() => {
    // Ignore URL-driven reloads we already handled via shallow replace / commit.
    if (!urlSeason || urlSeason === desiredSeason.current) return;
    desiredSeason.current = urlSeason;
    setViewSeason(urlSeason);
    const cached = readCache(playerId, urlSeason);
    if (cached && cached.metrics.length > 0) {
      setViewMetrics(cached.metrics);
      setViewTeamKey(cached.teamKey);
      setBusy(false);
      return;
    }
    setBusy(true);
    const gen = ++fetchGen.current;
    void fetchPercentiles(playerId, urlSeason, "fast")
      .then((json) => {
        if (gen !== fetchGen.current || !json) return;
        if (desiredSeason.current !== urlSeason) return;
        if (json.metrics.length === 0) {
          setBusy(false);
          return;
        }
        applyCached(urlSeason, json);
        setBusy(false);
      })
      .catch(() => {
        if (gen === fetchGen.current) setBusy(false);
      });
  }, [applyCached, playerId, urlSeason]);

  const timeline = useMemo(
    () => [...seasons].sort((a, b) => a.localeCompare(b)),
    [seasons]
  );

  useEffect(() => {
    let cancelled = false;
    const nearby = neighborSeasons(timeline, viewSeason).filter(
      (s) => !readCache(playerId, s)
    );
    const load = async () => {
      for (const s of nearby.slice(0, 4)) {
        if (cancelled) return;
        try {
          await fetchPercentiles(playerId, s, "fast");
        } catch {
          /* slider still works from the active season */
        }
      }
    };
    let idleId: number | undefined;
    let timeoutId: number | undefined;
    if (typeof requestIdleCallback === "function") {
      idleId = requestIdleCallback(() => {
        void load();
      });
    } else {
      timeoutId = window.setTimeout(() => {
        void load();
      }, 280);
    }
    return () => {
      cancelled = true;
      if (idleId != null && typeof cancelIdleCallback === "function") {
        cancelIdleCallback(idleId);
      }
      if (timeoutId != null) window.clearTimeout(timeoutId);
    };
  }, [playerId, timeline, viewSeason]);

  const commitSeason = useCallback(
    (next: string) => {
      if (!next || next === viewSeason) return;
      desiredSeason.current = next;
      setViewSeason(next);
      setViewSeasonShared?.(next);
      // Shallow URL only — App Router replace would re-render the whole player
      // page (~10s+) while the percentile board already loads client-side.
      replaceSeasonInUrl(next);
      const cached = readCache(playerId, next);
      if (cached && cached.metrics.length > 0) {
        setViewMetrics(cached.metrics);
        setViewTeamKey(cached.teamKey);
        setBusy(false);
        return;
      }
      setBusy(true);
      const gen = ++fetchGen.current;
      void fetchPercentiles(playerId, next, "fast")
        .then((json) => {
          if (gen !== fetchGen.current || !json) return;
          if (desiredSeason.current !== next) return;
          if (json.metrics.length === 0) {
            setBusy(false);
            return;
          }
          applyCached(next, json);
          setBusy(false);
          // Upgrade sparklines / YoY peers after paint.
          void fetchPercentiles(playerId, next, "full").then((full) => {
            if (
              !full ||
              gen !== fetchGen.current ||
              desiredSeason.current !== next
            ) {
              return;
            }
            applyCached(next, full);
          });
        })
        .catch(() => {
          if (gen === fetchGen.current) setBusy(false);
        });
    },
    [applyCached, playerId, setViewSeasonShared, viewSeason]
  );

  const categories = useMemo(
    () =>
      CATEGORY_META.filter((c) =>
        viewMetrics.some((m) => m.category === c.id && !m.profileHidden)
      ),
    [viewMetrics]
  );

  const listed = useMemo(
    () => viewMetrics.filter((m) => !m.profileHidden),
    [viewMetrics]
  );

  const grouped = useMemo(() => {
    const sections = categories
      .map((c) => ({
        ...c,
        metrics: listed
          .filter((m) => m.category === c.id)
          .sort(
            (a, b) => sheetStatOrderIndex(a.id) - sheetStatOrderIndex(b.id)
          ),
      }))
      .filter((c) => c.metrics.length > 0);

    const hasHustle = sections.some((s) => s.id === "hustle");
    if (!hasHustle && listed.length > 0) {
      const hustleMeta = CATEGORY_META.find((c) => c.id === "hustle");
      if (hustleMeta) {
        const order = PERCENTILE_CATEGORY_ORDER.indexOf("hustle");
        let insertAt = sections.length;
        for (let i = 0; i < sections.length; i++) {
          const sectionOrder = PERCENTILE_CATEGORY_ORDER.indexOf(sections[i]!.id);
          if (sectionOrder > order) {
            insertAt = i;
            break;
          }
        }
        sections.splice(insertAt, 0, { ...hustleMeta, metrics: [] });
      }
    }
    return sections;
  }, [categories, listed]);

  const hustleEmptyCopy = useMemo(() => {
    if (isHustleStatsSeason(viewSeason)) {
      return "No hustle tracking for this player-season (or peers lacked hustle rates).";
    }
    return "NBA.com hustle tracking starts in 2015-16. Earlier seasons have no hustle percentiles.";
  }, [viewSeason]);

  const [activeId, setActiveId] = useState(() =>
    defaultPercentileMetricId(viewMetrics)
  );
  const [openCategory, setOpenCategory] = useState<PercentileCategory>(
    "impact"
  );
  const [expanded, setExpanded] = useState(false);
  const accent = chartTheme.teamColor(viewTeamKey).color;

  const selectMetric = useCallback(
    (id: string) => {
      setActiveId(id);
      const category = viewMetrics.find((m) => m.id === id)?.category;
      if (category) setOpenCategory(category);
    },
    [viewMetrics]
  );

  // Ensure sparklines + comps are loaded when opening the full view.
  useEffect(() => {
    if (!expanded) return;
    void fetchPercentiles(playerId, viewSeason, "full").then((json) => {
      if (!json || desiredSeason.current !== viewSeason) return;
      applyCached(viewSeason, json);
    });
  }, [applyCached, expanded, playerId, viewSeason]);

  // Keep selection valid across season / SSR→client metric upgrades; prefer WAR1.
  useEffect(() => {
    if (!viewMetrics.length) return;
    if (viewMetrics.some((m) => m.id === activeId && !m.profileHidden)) return;
    setActiveId(defaultPercentileMetricId(viewMetrics));
  }, [viewMetrics, activeId]);

  const openSection =
    grouped.find((section) => section.id === openCategory) ?? grouped[0];

  const selectCategory = useCallback(
    (id: PercentileCategory) => {
      setOpenCategory(id);
      if (id === openCategory) return;
      const section = grouped.find((s) => s.id === id);
      if (!section || section.metrics.length === 0) return;
      const preferred =
        id === "impact"
          ? defaultPercentileMetricId(section.metrics)
          : section.metrics[0]?.id;
      if (preferred) setActiveId(preferred);
    },
    [grouped, openCategory]
  );

  const active = useMemo(
    () =>
      viewMetrics.find((m) => m.id === activeId) ??
      listed[0] ??
      viewMetrics[0],
    [viewMetrics, activeId, listed]
  );

  const wash = brandAtmosphereColors(
    resolveTeamBrand(viewTeamKey)?.primary,
    resolveTeamBrand(viewTeamKey)?.secondary
  );

  const seasonTeamKeys = useMemo(() => {
    if (!stintsBySeason) return undefined;
    return Object.fromEntries(
      Object.entries(stintsBySeason).map(([option, stints]) => [
        option,
        stints.map((stint) => stint.teamKey),
      ])
    );
  }, [stintsBySeason]);

  return (
    <GlassSurface
      effect="css"
      accentColor={wash?.colorA}
      accentColorB={wash?.colorB}
      className="flex min-h-[28rem] flex-col p-4"
      honor={honor}
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className={type.heading}>{viewSeason} percentile ranking</h2>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          disabled={!listed.length}
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border/70 px-2 py-1",
            type.caption,
            "font-semibold text-muted-foreground transition-colors",
            "hover:border-foreground/30 hover:bg-foreground/5 hover:text-foreground",
            "disabled:pointer-events-none disabled:opacity-40"
          )}
          aria-haspopup="dialog"
          aria-expanded={expanded}
          aria-label="Expand full percentile rankings"
        >
          <Maximize2 className="size-3.5" aria-hidden />
          <span className="hidden sm:inline">Expand</span>
        </button>
      </div>

      {timeline.length > 0 ? (
        <div className={cn(busy && "opacity-80")}>
          <SeasonBarSlider
            seasons={timeline}
            value={viewSeason}
            seasonTeams={seasonTeams}
            seasonTeamKeys={seasonTeamKeys}
            accentColor={accent}
            onCommit={commitSeason}
          />
        </div>
      ) : null}

      {!viewMetrics.length ? (
        <p className={cn(type.bodySm, "py-8 text-center text-muted-foreground")}>
          Percentile rankings unavailable for this season.
        </p>
      ) : grouped.length === 0 ? (
        <p
          className={cn(
            type.bodySm,
            "py-6 text-center text-muted-foreground"
          )}
        >
          No verified advanced rates for this season. Missing ratings stay
          unavailable rather than fabricated.
        </p>
      ) : (
        <div className="flex min-h-0 flex-col gap-4">
          <div
            role="tablist"
            aria-label="Percentile categories"
            className="flex flex-wrap items-center gap-x-2 gap-y-2 border-b-2 border-foreground/70 px-1 py-2"
          >
            {grouped.map((section) => {
              const Icon = section.icon;
              const selected = section.id === openSection?.id;
              return (
                <button
                  key={section.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  id={`pct-tab-${section.id}`}
                  onClick={() => selectCategory(section.id)}
                  className={cn(
                    type.bodySm,
                    "inline-flex items-center gap-1 px-2 py-1 font-bold tracking-tight",
                    selected
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon
                    className="size-3.5 shrink-0"
                    strokeWidth={2.25}
                    aria-hidden
                  />
                  {section.label}
                </button>
              );
            })}
          </div>

          <div
            className={cn(
              "grid items-start gap-4",
              // Aside needs room for chart + comps; require a usable metrics track.
              "min-[960px]:grid-cols-[minmax(14rem,1fr)_minmax(16rem,20rem)]"
            )}
          >
            <div className="relative min-w-0 overflow-hidden">
              {grouped.map((section) => {
                const selected = section.id === openSection?.id;
                return (
                  <section
                    key={section.id}
                    role="tabpanel"
                    aria-labelledby={`pct-tab-${section.id}`}
                    hidden={!selected}
                  >
                    <ScaleLegend />
                    {section.metrics.length === 0 ? (
                      <p
                        className={cn(
                          type.bodySm,
                          "py-4 text-muted-foreground"
                        )}
                      >
                        {section.id === "hustle"
                          ? hustleEmptyCopy
                          : "No rankings in this category for this season."}
                      </p>
                    ) : (
                        <ul>
                          {section.metrics.map((m, i) => {
                            const isActive = selected && active?.id === m.id;
                            return (
                              <li
                                key={m.id}
                                className={cn(
                                  !isActive &&
                                    i < section.metrics.length - 1 &&
                                    "border-b border-dashed border-border/80"
                                )}
                              >
                                <MetricRow
                                  metric={m}
                                  selected={isActive}
                                  onSelect={() => selectMetric(m.id)}
                                />
                              </li>
                            );
                          })}
                        </ul>
                    )}
                  </section>
                );
              })}
            </div>

            {active ? (
              <aside
                className="min-w-0 self-start overflow-hidden min-[960px]:sticky min-[960px]:top-4"
                aria-label="Metric chart and comparisons"
              >
                <div
                  className="min-w-0 overflow-hidden rounded-md border border-border/60 frost-surface-muted p-3"
                  style={{ borderLeftColor: accent, borderLeftWidth: 2 }}
                >
                  <div className="mb-2 flex flex-col gap-0.5 border-b border-border/50 pb-2">
                    <span className={cn(type.caption, "font-semibold text-foreground")}>
                      {active.label}
                    </span>
                    <span className={cn(type.caption, "text-muted-foreground")}>
                      Chart & similar players
                    </span>
                  </div>
                  <CompComparePanel
                    inline
                    metric={active}
                    playerId={playerId}
                    playerName={playerName}
                    teamKey={viewTeamKey}
                    stints={stintsBySeason?.[viewSeason]}
                    viewSeason={viewSeason}
                    seasons={timeline}
                    onSeasonSelect={commitSeason}
                  />
                </div>
              </aside>
            ) : (
              <p className={cn(type.caption, "text-muted-foreground")}>
                Select a ranking to compare.
              </p>
            )}
          </div>
        </div>
      )}

      <PercentileExpandDialog
        open={expanded}
        onClose={() => setExpanded(false)}
        playerName={playerName}
        viewSeason={viewSeason}
        timeline={timeline}
        seasonTeams={seasonTeams}
        seasonTeamKeys={seasonTeamKeys}
        accent={accent}
        busy={busy}
        onCommitSeason={commitSeason}
        grouped={grouped}
        listed={listed}
        active={active}
        activeId={activeId}
        onSelectMetric={selectMetric}
        playerId={playerId}
        viewTeamKey={viewTeamKey}
        stints={stintsBySeason?.[viewSeason]}
        hustleEmptyCopy={hustleEmptyCopy}
      />
    </GlassSurface>
  );
}
