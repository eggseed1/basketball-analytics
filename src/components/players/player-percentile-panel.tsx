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
  Target,
  Trophy,
  Users,
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
import { brandAtmosphereColors } from "@/lib/game-matchup-theme";
import {
  CareerTeamTrendChart,
  type CareerSeriesPoint,
} from "@/components/players/career-team-trend-chart";
import { resolveTeamBrand, teamChartColor } from "@/lib/nba-brand";
import type { StatComp } from "@/lib/player-stat-comps";
import type { PlayerCardStint } from "@/lib/player-team-context";
import {
  type MetricInterpretation,
  type PercentileMetric,
} from "@/lib/player-percentile-metrics";
import {
  PERCENTILE_CATEGORY_CHIPS,
  PERCENTILE_CATEGORY_ORDER,
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
  impact: Trophy,
  counting: Target,
  hustle: Zap,
  shooting: Crosshair,
  rates: Users,
  advanced: Gauge,
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

const RANK_GRID =
  "grid grid-cols-[minmax(7.5rem,max-content)_minmax(0,1fr)_3.5rem] items-center gap-x-2";

/** 24px pip stays on the track (Savant). */
function savantMarkLeft(pct: number) {
  const t = Math.max(0, Math.min(100, pct)) / 100;
  return `calc(12px + (100% - 24px) * ${t})`;
}

function ScaleLegend() {
  return (
    <div className={cn(RANK_GRID, "px-2")} aria-hidden>
      <span />
      <span className="relative mx-3 h-[22px]">
        {(
          [
            ["Poor", SAVANT_LEGEND.poor, 0],
            ["Average", SAVANT_LEGEND.average, 50],
            ["Great", SAVANT_LEGEND.great, 100],
          ] as const
        ).map(([label, color, pct]) => (
          <span
            key={label}
            className="absolute bottom-0 flex -translate-x-1/2 flex-col items-center leading-none"
            style={{ left: savantMarkLeft(pct), color }}
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
        "w-full whitespace-nowrap px-2 py-1.5 text-left transition-colors",
        selected ? "bg-foreground/8" : "hover:bg-foreground/5"
      )}
    >
      <span
        className={cn(type.bodySm, "text-right font-semibold")}
        onClick={(event) => event.stopPropagation()}
      >
        <StatTooltip nestable stat={metric.id} className="whitespace-nowrap">
          {metric.label}
        </StatTooltip>
      </span>
      <span className="relative mx-3 flex h-7 min-w-0 items-center">
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
              style={{ left: 12, right: 12 }}
            />
            <span
              className="absolute inset-y-[8px] rounded-full"
              aria-hidden
              style={{
                left: 12,
                width: `calc((100% - 24px) * ${pct / 100})`,
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
  const pos = Math.max(0, Math.min(100, row.percentile));
  const focalPos = Math.max(0, Math.min(100, focalPercentile));
  // Single formula for marks + gap so they stay aligned.
  const markLeft = (pct: number) =>
    `calc(8px + (100% - 16px) * ${pct / 100})`;
  const color = teamChartColor(row.teamKey).color;
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
        row.isSelf ? "bg-white/60" : "hover:bg-white/55"
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
          <span className={cn("truncate", row.isSelf && "font-bold")}>
            {row.playerName}
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
}) {
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
  const focalColor = teamChartColor(teamKey).color;

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

  const chartHeight = inline ? 140 : 180;

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col",
        inline ? "gap-2 py-2" : "h-full gap-3"
      )}
    >
      {!inline ? <h2 className={type.heading}>{metric.label}</h2> : null}

      <div className="shrink-0" style={{ height: chartHeight }}>
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
            metric.id === "lebron" ||
            metric.id === "olebron" ||
            metric.id === "dlebron" ||
            metric.id === "wins"
              ? "No career series for this impact metric yet."
              : "Not enough seasons to chart this metric yet."}
          </p>
        )}
      </div>

      <div className="h-px shrink-0 bg-border" aria-hidden />

      <div className="flex min-h-0 flex-col gap-1.5">
        <div className="flex h-7 shrink-0 items-center justify-between gap-2">
          <p className={cn(type.caption, "min-w-0 truncate font-semibold text-foreground")}>
            Closest {metric.label} this season
          </p>
          <div className="flex shrink-0 gap-1">
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
        <p
          className={cn(
            type.caption,
            "flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground"
          )}
        >
          <span className="inline-flex items-center gap-1.5">
            <span
              className="size-2.5 rounded-full border border-background bg-foreground"
              aria-hidden
            />
            player in this row
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-3 w-1 rounded-sm ring-1 ring-background"
              style={{ backgroundColor: focalColor }}
              aria-hidden
            />
            {playerName} on this scale
          </span>
          <span className="text-muted-foreground/80">
            Bar = league percentile
          </span>
        </p>

        {rows.length <= 1 ? (
          <p
            className={cn(type.bodySm, "text-muted-foreground")}
            style={{
              minHeight: `calc(${VISIBLE_COMP_ROWS} * 3.5rem + ${VISIBLE_COMP_ROWS - 1} * 0.25rem)`,
            }}
          >
            No close comps found for this stat
            {mode === "history" ? " in recent seasons" : " in the league"}.
          </p>
        ) : (
          <ul
            className="flex min-h-0 flex-col gap-1 overflow-y-auto overscroll-contain pr-1"
            style={{
              height: `calc(${VISIBLE_COMP_ROWS} * 3.5rem + ${VISIBLE_COMP_ROWS - 1} * 0.25rem)`,
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
  mode: "fast" | "full" = "full"
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
    void fetchPercentiles(playerId, urlSeason)
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
      const cached = readCache(playerId, next);
      if (cached && cached.metrics.length > 0) {
        setViewMetrics(cached.metrics);
        setViewTeamKey(cached.teamKey);
        setBusy(false);
      } else {
        setBusy(true);
        const gen = ++fetchGen.current;
        void fetchPercentiles(playerId, next)
          .then((json) => {
            if (gen !== fetchGen.current || !json) return;
            if (desiredSeason.current !== next) return;
            if (json.metrics.length === 0) {
              setBusy(false);
              return;
            }
            applyCached(next, json);
            setBusy(false);
          })
          .catch(() => {
            if (gen === fetchGen.current) setBusy(false);
          });
      }
      queryNav?.replaceParams({ season: next });
    },
    [applyCached, playerId, queryNav, setViewSeasonShared, viewSeason]
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

  const grouped = useMemo(
    () =>
      categories
        .map((c) => ({
          ...c,
          metrics: listed.filter((m) => m.category === c.id),
        }))
        .filter((c) => c.metrics.length > 0),
    [categories, listed]
  );

  const [activeId, setActiveId] = useState(viewMetrics[0]?.id ?? "");
  const [openCategory, setOpenCategory] = useState<PercentileCategory>(
    grouped[0]?.id ?? "impact"
  );
  const accent = teamChartColor(viewTeamKey).color;

  const openSection =
    grouped.find((section) => section.id === openCategory) ?? grouped[0];

  const selectCategory = useCallback(
    (id: PercentileCategory) => {
      setOpenCategory(id);
      if (id === openCategory) return;
      const first = grouped.find((section) => section.id === id)?.metrics[0];
      if (first) {
        setActiveId(first.id);
      }
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
      <h2 className={type.heading}>{viewSeason} percentile ranking</h2>

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
              "min-[800px]:grid-cols-[minmax(0,1fr)_minmax(11rem,15rem)]"
            )}
          >
            <div className="relative min-w-0">
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
                              onSelect={() => setActiveId(m.id)}
                            />
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
            </div>

            {active ? (
              <aside
                className="min-w-0 self-start min-[800px]:sticky min-[800px]:top-4"
                aria-label="Metric chart and comparisons"
              >
                <div
                  className="rounded-md border border-border/60 bg-white/30 p-3"
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
    </GlassSurface>
  );
}
