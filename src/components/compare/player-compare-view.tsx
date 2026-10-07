"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { ChevronDown } from "lucide-react";

import type { ComparisonDimension, PlayerComparisonResult } from "@/analytics";
import {
  CATEGORY_ORDER,
  COMPARE_DEFAULT_METRIC_IDS,
} from "@/analytics/compare-players";
import { GlassSurface } from "@/components/brand/glass-surface";
import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { TeamLogo } from "@/components/brand/team-logo";
import { PlayerCompareRadarLazy } from "@/components/charts/recharts-lazy";
import { CompareShareControls } from "@/components/compare/compare-share-controls";
import {
  compareGap,
  compareScore,
  pickRadarAxes,
} from "@/components/compare/compare-scale";
import { MetricHelp } from "@/components/learn/metric-help";
import { PlayerIdentity } from "@/components/players/player-identity";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useChartTheme } from "@/lib/chart-theme";
import { conceptIdForColumnLabel } from "@/lib/learn-column-concepts";
import { type } from "@/lib/design-system";
import { formatOrdinal } from "@/lib/format";
import {
  compareMatchupColors,
  resolveTeamBrand,
  teamBrandCompareBarFill,
} from "@/lib/nba-brand";
import { normalizeTeamParam } from "@/lib/team-identity";
import { cn } from "@/lib/utils";

type ValueMode = "raw" | "percentile";
type Edge = "a" | "b" | "even";

/** Mirror share graphic: value+bar | metric | value+bar */
const MATCHUP_ROW_GRID =
  "grid grid-cols-[minmax(0,1fr)_4.75rem_minmax(0,1fr)] items-center gap-x-2 sm:gap-x-3";

const KEY_NUMBER_IDS = ["pts", "trb", "ast", "ts", "drbl100"] as const;

/** Header wash holds full strength behind the faces, then eases into the body. */
const WASH_FADE =
  "linear-gradient(to bottom, #000 0%, #000 58%, rgb(0 0 0 / 0.55) 80%, transparent 100%)";

/** Percentile points inside which two players read as even. */
const EVEN_PCT_POINTS = 3;
/** Relative raw gap inside which two players read as even (no percentiles). */
const EVEN_RAW_SHARE = 0.02;

const SECTION_LABEL = cn(
  type.micro,
  "font-bold uppercase tracking-[0.12em] text-muted-foreground"
);

/** Nested tile inside the glass card: translucent fill, no second blur layer. */
const FROST_TILE =
  "frost-surface rounded-lg shadow-[inset_0_1px_0_rgb(255_255_255/0.55)] dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.07)]";

/** Quiet capsule track shared by every compare bar, matching the percentile panel. */
const BAR_TRACK = "overflow-hidden rounded-full bg-foreground/[0.08]";

function formatPctile(n: number | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return formatOrdinal(n);
}

function edgeOf(d: ComparisonDimension): Edge {
  if (d.delta == null || !Number.isFinite(d.delta)) return "even";
  if (d.aPercentile != null && d.bPercentile != null) {
    if (Math.abs(d.delta) < EVEN_PCT_POINTS) return "even";
    return d.delta > 0 ? "a" : "b";
  }
  const peak = Math.max(Math.abs(d.aValue ?? 0), Math.abs(d.bValue ?? 0));
  if (peak > 0 && Math.abs(d.delta) / peak < EVEN_RAW_SHARE) return "even";
  if (d.delta === 0) return "even";
  return d.delta > 0 ? "a" : "b";
}

function tallyEdges(rows: ComparisonDimension[]) {
  let a = 0;
  let b = 0;
  let even = 0;
  for (const d of rows) {
    if (d.delta == null || !Number.isFinite(d.delta)) continue;
    const edge = edgeOf(d);
    if (edge === "a") a += 1;
    else if (edge === "b") b += 1;
    else even += 1;
  }
  return { a, b, even, total: a + b + even };
}

function EdgeLabel({
  edge,
  aName,
  bName,
}: {
  edge: Edge;
  aName: string;
  bName: string;
}) {
  if (edge === "even") {
    return (
      <span
        className={cn(
          type.micro,
          "font-semibold uppercase tracking-wide text-muted-foreground"
        )}
      >
        <MetricHelp conceptId="essentially_even">Even</MetricHelp>
      </span>
    );
  }
  return (
    <span
      className={cn(
        type.micro,
        "font-semibold uppercase tracking-wide text-muted-foreground"
      )}
    >
      {edge === "a" ? `${aName} ↑` : `${bName} ↑`}
    </span>
  );
}

function metricLabel(label: string) {
  const conceptId = conceptIdForColumnLabel(label);
  return conceptId ? (
    <MetricHelp conceptId={conceptId}>{label}</MetricHelp>
  ) : (
    label
  );
}

function MatchupBarRow({
  dimension,
  aName,
  bName,
  valueMode,
  aFill,
  bFill,
}: {
  dimension: ComparisonDimension;
  aName: string;
  bName: string;
  valueMode: ValueMode;
  aFill: string;
  bFill: string;
}) {
  const hasPct =
    dimension.aPercentile != null || dimension.bPercentile != null;
  const showPct = valueMode === "percentile" && hasPct;

  const aTrack = compareScore(dimension, "a");
  const bTrack = compareScore(dimension, "b");

  const edge = edgeOf(dimension);
  // Keep the trailing side readable — faint fills made losing bars disappear.
  const aOpacity = edge === "b" ? 0.72 : 1;
  const bOpacity = edge === "a" ? 0.72 : 1;

  const aValue = showPct
    ? formatPctile(dimension.aPercentile)
    : dimension.aDisplay;
  const bValue = showPct
    ? formatPctile(dimension.bPercentile)
    : dimension.bDisplay;
  const aTitle = showPct
    ? dimension.aDisplay
    : dimension.aPercentile != null
      ? `${formatOrdinal(dimension.aPercentile)} percentile`
      : undefined;
  const bTitle = showPct
    ? dimension.bDisplay
    : dimension.bPercentile != null
      ? `${formatOrdinal(dimension.bPercentile)} percentile`
      : undefined;

  return (
    <div className="border-b border-border/60 py-2.5 last:border-0">
      <div className={MATCHUP_ROW_GRID}>
        <div className="min-w-0" style={{ opacity: aOpacity }}>
          <div className="flex w-full flex-col items-end gap-1">
            <span
              className={cn(
                type.bodySm,
                "w-full truncate text-right font-semibold tabular-nums"
              )}
              title={aTitle ?? aName}
            >
              {aValue}
            </span>
            <div className={cn(BAR_TRACK, "h-2 w-full")}>
              <div
                className="ml-auto h-full rounded-full"
                style={{ width: `${aTrack ?? 0}%`, background: aFill }}
              />
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-col items-center gap-0.5 px-0.5 text-center">
          <p
            className={cn(
              type.caption,
              "max-w-full truncate font-bold leading-tight tracking-tight"
            )}
          >
            {metricLabel(dimension.label)}
          </p>
          <EdgeLabel edge={edge} aName={aName} bName={bName} />
        </div>

        <div className="min-w-0" style={{ opacity: bOpacity }}>
          <div className="flex w-full flex-col items-start gap-1">
            <span
              className={cn(
                type.bodySm,
                "w-full truncate text-left font-semibold tabular-nums"
              )}
              title={bTitle ?? bName}
            >
              {bValue}
            </span>
            <div className={cn(BAR_TRACK, "h-2 w-full")}>
              <div
                className="h-full rounded-full"
                style={{ width: `${bTrack ?? 0}%`, background: bFill }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function shortName(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) return name;
  return parts[parts.length - 1]!;
}

const GROUP_TITLE: Record<string, string> = {
  profile: "Profile",
  shooting: "Shooting",
  defense: "Defense",
  hustle: "Hustle",
  advanced: "Advanced",
  impact: "Impact",
};

function SplitBar({
  a,
  even,
  b,
  aColor,
  bColor,
  className,
}: {
  a: number;
  even: number;
  b: number;
  aColor: string;
  bColor: string;
  className?: string;
}) {
  const total = a + even + b;
  if (!total) return null;
  return (
    <div
      className={cn(
        BAR_TRACK,
        "flex w-full gap-0.5",
        className
      )}
      aria-hidden
    >
      {a ? (
        <div
          className="rounded-full"
          style={{ flexGrow: a, background: aColor }}
        />
      ) : null}
      {even ? (
        <div
          className="rounded-full bg-foreground/20"
          style={{ flexGrow: even }}
        />
      ) : null}
      {b ? (
        <div
          className="rounded-full"
          style={{ flexGrow: b, background: bColor }}
        />
      ) : null}
    </div>
  );
}

/** Head count of metric edges. Every metric counts once, so it is a tally. */
function EdgeTally({
  dimensions,
  aName,
  bName,
  aColor,
  bColor,
}: {
  dimensions: ComparisonDimension[];
  aName: string;
  bName: string;
  aColor: string;
  bColor: string;
}) {
  const t = tallyEdges(dimensions);
  if (!t.total) return null;
  return (
    <section
      className="border-b border-border/60 px-3 py-4 sm:px-5"
      aria-label="Metric edges"
    >
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p
            className="text-3xl font-black tabular-nums leading-none tracking-tight"
            style={{ color: aColor }}
          >
            {t.a}
          </p>
          <p className={cn(type.caption, "mt-1 truncate font-semibold")}>
            {aName} ahead
          </p>
        </div>
        <div className="min-w-0 text-center">
          <p className={SECTION_LABEL}>Metric edges</p>
          <p
            className={cn(
              type.caption,
              "mt-1 font-semibold tabular-nums text-muted-foreground"
            )}
          >
            {t.even} even of {t.total}
          </p>
        </div>
        <div className="min-w-0 text-right">
          <p
            className="text-3xl font-black tabular-nums leading-none tracking-tight"
            style={{ color: bColor }}
          >
            {t.b}
          </p>
          <p className={cn(type.caption, "mt-1 truncate font-semibold")}>
            {bName} ahead
          </p>
        </div>
      </div>
      <SplitBar
        a={t.a}
        even={t.even}
        b={t.b}
        aColor={aColor}
        bColor={bColor}
        className="mt-3 h-3"
      />
      <p className={cn(type.caption, "mt-2 text-muted-foreground")}>
        A count of the metrics shown. Each one counts the same, so this is a
        tally, not an overall rating.
      </p>
    </section>
  );
}

function KeyNumbers({
  dimensions,
  aColor,
  bColor,
}: {
  dimensions: ComparisonDimension[];
  aColor: string;
  bColor: string;
}) {
  const byId = new Map(dimensions.map((d) => [d.id, d]));
  const cards = KEY_NUMBER_IDS.map((id) => byId.get(id)).filter(
    (d): d is ComparisonDimension =>
      d != null && (d.aValue != null || d.bValue != null)
  );
  if (!cards.length) return null;
  return (
    <section
      className="grid grid-cols-2 gap-2 border-b border-border/60 p-3 sm:grid-cols-5 sm:px-5"
      aria-label="Key numbers"
    >
      {cards.map((d) => {
        const edge = edgeOf(d);
        const aTrack = compareScore(d, "a") ?? 0;
        const bTrack = compareScore(d, "b") ?? 0;
        return (
          <div key={d.id} className={cn(FROST_TILE, "px-3 py-3")}>
            <p className={cn(SECTION_LABEL, "text-center")}>
              {metricLabel(d.label)}
            </p>
            <div className="mt-1.5 flex items-baseline justify-between gap-2 tabular-nums">
              <span
                className={cn(
                  "text-lg font-black tracking-tight",
                  edge === "b" && "text-muted-foreground"
                )}
                style={edge === "a" ? { color: aColor } : undefined}
              >
                {d.aDisplay}
              </span>
              <span
                className={cn(
                  "text-lg font-black tracking-tight",
                  edge === "a" && "text-muted-foreground"
                )}
                style={edge === "b" ? { color: bColor } : undefined}
              >
                {d.bDisplay}
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-0.5" aria-hidden>
              <div className={cn(BAR_TRACK, "flex h-1.5 flex-1 justify-end")}>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${aTrack}%`, background: aColor }}
                />
              </div>
              <div className={cn(BAR_TRACK, "flex h-1.5 flex-1")}>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${bTrack}%`, background: bColor }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}

function CategoryEdges({
  dimensions,
  aName,
  bName,
  aColor,
  bColor,
}: {
  dimensions: ComparisonDimension[];
  aName: string;
  bName: string;
  aColor: string;
  bColor: string;
}) {
  const rows = CATEGORY_ORDER.map((group) => {
    const t = tallyEdges(dimensions.filter((d) => d.group === group));
    return { group, label: GROUP_TITLE[group] ?? group, ...t };
  }).filter((r) => r.total > 0);
  if (!rows.length) return null;
  return (
    <section className="flex min-w-0 flex-col gap-2" aria-label="Category edge">
      <div>
        <p className={SECTION_LABEL}>Category edge</p>
        <p className={cn(type.caption, "mt-0.5 text-muted-foreground")}>
          Metrics won in each group. Grey is even.
        </p>
      </div>
      <ul className="flex flex-col gap-3 pt-1">
        {rows.map((r) => {
          const winner =
            r.a === r.b ? "Even" : r.a > r.b ? aName : bName;
          const winnerColor =
            r.a === r.b ? undefined : r.a > r.b ? aColor : bColor;
          return (
            <li key={r.group}>
              <div className="flex items-baseline justify-between gap-2">
                <span className={cn(type.caption, "font-bold")}>
                  {r.label}
                </span>
                <span
                  className={cn(
                    type.caption,
                    "truncate font-bold",
                    !winnerColor && "text-muted-foreground"
                  )}
                  style={winnerColor ? { color: winnerColor } : undefined}
                >
                  {winner}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span
                  className={cn(
                    type.micro,
                    "w-4 text-right font-bold tabular-nums"
                  )}
                >
                  {r.a}
                </span>
                <SplitBar
                  a={r.a}
                  even={r.even}
                  b={r.b}
                  aColor={aColor}
                  bColor={bColor}
                  className="h-2.5"
                />
                <span
                  className={cn(type.micro, "w-4 font-bold tabular-nums")}
                >
                  {r.b}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function BiggestGaps({
  dimensions,
  aName,
  bName,
  aColor,
  bColor,
  fallbackNote,
}: {
  dimensions: ComparisonDimension[];
  aName: string;
  bName: string;
  aColor: string;
  bColor: string;
  fallbackNote?: string;
}) {
  const usesPercentile = dimensions.some(
    (d) => d.aPercentile != null && d.bPercentile != null
  );
  const gaps = dimensions
    .map((d) => ({ d, gap: compareGap(d) }))
    .filter(
      (x): x is { d: ComparisonDimension; gap: number } =>
        x.gap != null && Number.isFinite(x.gap) && edgeOf(x.d) !== "even"
    )
    .sort((x, y) => Math.abs(y.gap) - Math.abs(x.gap))
    .slice(0, 6);

  return (
    <section
      className="border-t border-border/60 px-3 py-4 sm:px-5"
      aria-label="Where they differ most"
    >
      <p className={SECTION_LABEL}>Where they differ most</p>
      {gaps.length ? (
        <>
          <p className={cn(type.caption, "mt-0.5 text-muted-foreground")}>
            {usesPercentile
              ? "Gap in peer percentile points. Bars point toward the player who leads."
              : "Percent gap between the two numbers. Bars point toward the player who leads."}
          </p>
          <div
            className={cn(
              type.micro,
              "mt-3 grid grid-cols-[minmax(0,1fr)_6.5rem_minmax(0,1fr)] font-bold uppercase tracking-wide text-muted-foreground"
            )}
          >
            <span className="truncate text-right">← {aName}</span>
            <span />
            <span className="truncate">{bName} <span data-motion-arrow aria-hidden>→</span></span>
          </div>
          <ul className="mt-1 flex flex-col gap-2">
            {gaps.map(({ d, gap }) => {
              const width = Math.min(100, Math.abs(gap));
              const aLeads = gap > 0;
              const gapLabel = `+${Math.round(Math.abs(gap))}${
                d.aPercentile != null && d.bPercentile != null ? "" : "%"
              }`;
              return (
                <li
                  key={d.id}
                  className="grid grid-cols-[minmax(0,1fr)_6.5rem_minmax(0,1fr)] items-center"
                >
                  <div className="flex h-6 items-center gap-1.5">
                    <span
                      className={cn(
                        type.micro,
                        "w-9 shrink-0 text-right font-bold tabular-nums"
                      )}
                    >
                      {aLeads ? gapLabel : null}
                    </span>
                    <div className={cn(BAR_TRACK, "flex h-2 flex-1 justify-end")}>
                      {aLeads ? (
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${width}%`, background: aColor }}
                        />
                      ) : null}
                    </div>
                  </div>
                  <div className="flex min-w-0 flex-col items-center px-1 text-center">
                    <span
                      className={cn(
                        type.caption,
                        "max-w-full truncate font-bold leading-tight"
                      )}
                    >
                      {metricLabel(d.label)}
                    </span>
                    <span
                      className={cn(
                        type.micro,
                        "max-w-full truncate tabular-nums text-muted-foreground"
                      )}
                    >
                      {d.aDisplay} vs {d.bDisplay}
                    </span>
                  </div>
                  <div className="flex h-6 items-center gap-1.5">
                    <div className={cn(BAR_TRACK, "flex h-2 flex-1")}>
                      {!aLeads ? (
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${width}%`, background: bColor }}
                        />
                      ) : null}
                    </div>
                    <span
                      className={cn(
                        type.micro,
                        "w-9 shrink-0 font-bold tabular-nums"
                      )}
                    >
                      {!aLeads ? gapLabel : null}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      ) : fallbackNote ? (
        <p className={cn(type.bodySm, "mt-1 text-muted-foreground")}>
          {fallbackNote}
        </p>
      ) : null}
    </section>
  );
}

function TeamChipRow({ teamKeys }: { teamKeys: string[] }) {
  // Keys arrive as abbreviations or ESPN ids ("ATL" and "1"); show one chip
  // per franchise, labeled by abbreviation.
  const chips = new Map<string, { key: string; label: string; title: string }>();
  for (const key of teamKeys) {
    const brand = resolveTeamBrand(key);
    const id = brand?.id ?? key;
    if (chips.has(id)) continue;
    chips.set(id, {
      key,
      label: brand?.abbr ?? key,
      title: normalizeTeamParam(key)?.displayName ?? brand?.abbr ?? key,
    });
  }
  if (!chips.size) return null;
  return (
    <ul className="mt-1.5 flex max-w-full flex-wrap items-center justify-center gap-1.5">
      {[...chips.entries()].map(([id, chip]) => (
        <li
          key={id}
          className="inline-flex items-center gap-1 rounded-md border border-border/50 bg-background/60 px-1.5 py-0.5"
          title={chip.title}
        >
          <TeamLogo teamKey={chip.key} size="2xs" />
          <span
            className={cn(
              type.micro,
              "font-bold uppercase tracking-wide text-muted-foreground"
            )}
          >
            {chip.label}
          </span>
        </li>
      ))}
    </ul>
  );
}

function FaceSide({
  playerId,
  name,
  season,
  linkSeason,
  teamKeys,
  portraitUrl,
  color,
  align,
}: {
  playerId: string;
  name: string;
  season?: string;
  linkSeason?: string;
  teamKeys: string[];
  portraitUrl?: string | null;
  color: string;
  align: "left" | "right";
}) {
  return (
    <div
      className={cn(
        "relative flex min-w-0 flex-1 flex-col items-center px-2 pb-5 pt-6",
        align === "left" ? "pr-8" : "pl-8"
      )}
    >
      <PlayerIdentity
        playerId={playerId}
        name={name}
        season={linkSeason}
        className="flex min-w-0 max-w-full flex-col items-center"
        nameClassName="flex max-w-full flex-col items-center gap-1.5 text-center no-underline hover:underline"
      >
        <span
          className="flex shrink-0 rounded-full p-[3px] shadow-[0_8px_24px_rgb(0_0_0/0.12)]"
          style={{ background: color }}
        >
          <PlayerHeadshot
            playerId={playerId}
            name={name}
            portraitUrl={portraitUrl}
            size="lg"
            className="ring-0"
          />
        </span>
        <span
          className={cn(
            type.body,
            "mt-1 max-w-full truncate font-bold tracking-tight"
          )}
        >
          {name}
        </span>
        {season ? (
          <span
            className={cn(
              type.caption,
              "font-semibold tabular-nums text-muted-foreground"
            )}
          >
            {season}
          </span>
        ) : null}
        <TeamChipRow teamKeys={teamKeys} />
      </PlayerIdentity>
    </div>
  );
}

function MetricPicker({
  dimensions,
  selectedIds,
  onChange,
}: {
  dimensions: ComparisonDimension[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = (id: string) => {
    if (selected.has(id)) {
      if (selectedIds.length <= 1) return;
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const selectDefaults = () => {
    const available = new Set(dimensions.map((d) => d.id));
    const defaults = COMPARE_DEFAULT_METRIC_IDS.filter((id) =>
      available.has(id)
    );
    onChange(
      defaults.length ? [...defaults] : dimensions.map((d) => d.id)
    );
  };

  const selectAll = () => onChange(dimensions.map((d) => d.id));

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          type.caption,
          "glass-pill inline-flex items-center gap-1.5 rounded-[var(--radius-md)] px-2.5 py-1.5 font-semibold",
          "transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          open && "glass-pill-active"
        )}
      >
        Metrics
        <span className="tabular-nums text-muted-foreground">
          {selectedIds.length}/{dimensions.length}
        </span>
        <ChevronDown
          className={cn(
            "size-3.5 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
          aria-hidden
        />
      </button>
      {open ? (
        <div
          id={listId}
          role="group"
          aria-label="Visible metrics"
          className="hover-frost absolute right-0 z-30 mt-1.5 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-[var(--radius-lg)]"
          // Backdrop blur can't sample through the glass article, so the fill carries legibility.
          style={{
            background: "color-mix(in oklab, var(--popover) 90%, transparent)",
          }}
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            <p
              className={cn(
                type.micro,
                "font-bold uppercase tracking-[0.12em] text-muted-foreground"
              )}
            >
              Sheet metrics
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={selectDefaults}
                className={cn(
                  type.caption,
                  "font-semibold text-muted-foreground underline-offset-2 hover:underline"
                )}
              >
                Defaults
              </button>
              <button
                type="button"
                onClick={selectAll}
                className={cn(
                  type.caption,
                  "font-semibold text-muted-foreground underline-offset-2 hover:underline"
                )}
              >
                All
              </button>
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto p-2">
            {CATEGORY_ORDER.map((group) => {
              const rows = dimensions.filter((d) => d.group === group);
              if (!rows.length) return null;
              return (
                <div key={group} className="mb-2 last:mb-0">
                  <p
                    className={cn(
                      type.micro,
                      "px-2 py-1 font-bold uppercase tracking-wide text-muted-foreground"
                    )}
                  >
                    {GROUP_TITLE[group] ?? group}
                  </p>
                  <ul className="grid grid-cols-2 gap-0.5">
                    {rows.map((d) => {
                      const on = selected.has(d.id);
                      return (
                        <li key={d.id}>
                          <label
                            className={cn(
                              "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5",
                              on ? "bg-foreground/8" : "hover:bg-foreground/5"
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={() => toggle(d.id)}
                              className="size-3.5 accent-foreground"
                            />
                            <span
                              className={cn(
                                type.caption,
                                "truncate font-semibold"
                              )}
                            >
                              {d.label}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function defaultVisibleIds(dimensions: ComparisonDimension[]): string[] {
  const available = new Set(dimensions.map((d) => d.id));
  const defaults = COMPARE_DEFAULT_METRIC_IDS.filter((id) => available.has(id));
  return defaults.length ? [...defaults] : dimensions.map((d) => d.id);
}

export type PlayerCompareEra = {
  result: PlayerComparisonResult;
  reference: string;
  source: string;
  unadjustedA: string[];
  unadjustedB: string[];
  initiallyOn: boolean;
};

function EraNote({
  era,
  aName,
  bName,
  percentileOnly,
}: {
  era: PlayerCompareEra;
  aName: string;
  bName: string;
  percentileOnly: boolean;
}) {
  const left = [
    { name: aName, labels: era.unadjustedA },
    { name: bName, labels: era.unadjustedB },
  ].filter((x) => x.labels.length);
  return (
    <div
      className={cn(
        type.caption,
        "flex flex-col gap-1 border-b border-border/60 px-3 py-2.5 text-muted-foreground sm:px-5"
      )}
    >
      <p>
        Restated in {era.reference} league terms. Counting stats scale by each
        season&apos;s league average: if teams grabbed 60% more rebounds a game
        back then, a player&apos;s rebounds are divided by 1.6. Shooting
        percentages and ORtg/DRtg move by the gap in league averages. USG%,
        PER, BPM and the other rate stats already measure a player against his
        own league, so they stay as played. 3-point volume isn&apos;t scaled.
        The result is an estimate of how far each player stood above his
        league. It can&apos;t tell you how anyone would play today.
      </p>
      {percentileOnly ? (
        <p>
          Percentiles already rank each player within his own season, so they
          don&apos;t change. Switch Display to raw values to see the adjusted
          numbers.
        </p>
      ) : null}
      {left.map((x) => (
        <p key={x.name}>
          Left as played for {x.name}: {x.labels.join(", ")}. The league
          didn&apos;t track these for some of those seasons.
        </p>
      ))}
    </div>
  );
}

export function PlayerCompareView({
  result: playedResult,
  era,
  coverage = [],
  aPortraitUrl,
  bPortraitUrl,
}: {
  result: PlayerComparisonResult;
  era?: PlayerCompareEra | null;
  /** Notes on stats the league hadn't started tracking yet. */
  coverage?: string[];
  aPortraitUrl?: string | null;
  bPortraitUrl?: string | null;
}) {
  const [origin, setOrigin] = useState("");
  const [eraOn, setEraOn] = useState(() => Boolean(era?.initiallyOn));
  const eraActive = Boolean(era && eraOn);
  const result = eraActive && era ? era.result : playedResult;
  const theme = useChartTheme();

  const setEraMode = (on: boolean) => {
    setEraOn(on);
    const url = new URL(window.location.href);
    if (on) url.searchParams.set("era", "adj");
    else url.searchParams.delete("era");
    window.history.replaceState(window.history.state, "", url);
  };
  const hasAnyPercentile = result.dimensions.some(
    (d) => d.aPercentile != null || d.bPercentile != null
  );
  const [valueMode, setValueMode] = useState<ValueMode>(() =>
    hasAnyPercentile ? "percentile" : "raw"
  );
  const [visibleIds, setVisibleIds] = useState(() =>
    defaultVisibleIds(result.dimensions)
  );

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (!hasAnyPercentile && valueMode === "percentile") {
      setValueMode("raw");
    }
  }, [hasAnyPercentile, valueMode]);

  useEffect(() => {
    if (hasAnyPercentile) setValueMode("percentile");
  }, [hasAnyPercentile, result.aId, result.bId, result.seasonA, result.seasonB]);

  useEffect(() => {
    setVisibleIds(defaultVisibleIds(result.dimensions));
  }, [result.aId, result.bId, result.seasonA, result.seasonB]);

  const visibleSet = useMemo(() => new Set(visibleIds), [visibleIds]);
  const visibleDimensions = useMemo(
    () => result.dimensions.filter((d) => visibleSet.has(d.id)),
    [result.dimensions, visibleSet]
  );
  const radarAxes = useMemo(
    () => pickRadarAxes(visibleDimensions),
    [visibleDimensions]
  );
  const showRadar = radarAxes.length >= 3;

  const seasonLine =
    result.seasonA && result.seasonB
      ? result.seasonA === result.seasonB
        ? result.seasonA
        : `${result.seasonA}  ·  ${result.seasonB}`
      : result.season ?? "";

  const careerMode = result.mode === "career";
  const aShort = shortName(result.aName);
  const bShort = shortName(result.bName);
  const aTeamKey = result.aTeamKeys?.[0] ?? result.aTeamKey;
  const bTeamKey = result.bTeamKeys?.[0] ?? result.bTeamKey;
  const colors = compareMatchupColors(aTeamKey, bTeamKey, theme.surface);
  const aFill = colors.a;
  const bFill = colors.b;

  const closeNote = careerMode
    ? "The career metrics shown are close. No gap clears the even line."
    : "The season metrics shown are within a few percentile points of each other. Small gaps may be sample noise.";

  return (
    <div className="flex flex-col gap-3">
      <div
        className="flex min-w-0 flex-wrap items-center justify-end gap-3"
        data-capture-exclude=""
      >
        <CompareShareControls result={result} />
      </div>

      <GlassSurface
        as="article"
        accentColor={aFill}
        accentColorB={bFill}
        className="compare-snapshot rounded-xl text-card-foreground"
      >
        <div className="relative isolate">
        <div
          aria-hidden
          className="matchup-wash--subtle pointer-events-none absolute inset-0 -z-10"
          style={
            {
              "--away-color": aFill,
              "--home-color": bFill,
              maskImage: WASH_FADE,
              WebkitMaskImage: WASH_FADE,
            } as CSSProperties
          }
        />
        <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p
              className={cn(
                type.micro,
                "font-bold uppercase tracking-[0.14em] text-muted-foreground"
              )}
            >
              DRBL · Player matchup
            </p>
            <p className={cn(type.title, "mt-0.5 truncate")}>
              {result.aName} vs {result.bName}
            </p>
          </div>
          {seasonLine ? (
            <div
              className={cn(
                type.caption,
                "flex shrink-0 flex-col items-end font-semibold tabular-nums text-muted-foreground"
              )}
            >
              <p>{seasonLine}</p>
              {eraActive && era ? (
                <p className={cn(type.micro, "uppercase tracking-wide")}>
                  Era-adjusted to {era.reference}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <header className="relative flex min-w-0 items-stretch">
          <FaceSide
            playerId={result.aId}
            name={result.aName}
            season={result.seasonA}
            linkSeason={
              careerMode ? undefined : (result.seasonA ?? result.season)
            }
            teamKeys={result.aTeamKeys ?? []}
            portraitUrl={aPortraitUrl}
            color={aFill}
            align="left"
          />
          <div className="pointer-events-none absolute inset-y-0 left-1/2 flex -translate-x-1/2 items-center">
            <span
              className={cn(
                type.caption,
                "glass-pill glass-pill-active flex size-12 items-center justify-center rounded-full font-black uppercase tracking-wide shadow-[0_6px_18px_rgb(0_0_0/0.14)]"
              )}
            >
              vs
            </span>
          </div>
          <FaceSide
            playerId={result.bId}
            name={result.bName}
            season={result.seasonB}
            linkSeason={
              careerMode ? undefined : (result.seasonB ?? result.season)
            }
            teamKeys={result.bTeamKeys ?? []}
            portraitUrl={bPortraitUrl}
            color={bFill}
            align="right"
          />
        </header>
        </div>

        <KeyNumbers
          dimensions={result.dimensions}
          aColor={aFill}
          bColor={bFill}
        />

        <EdgeTally
          dimensions={visibleDimensions}
          aName={aShort}
          bName={bShort}
          aColor={aFill}
          bColor={bFill}
        />

        <div
          className={cn(
            "grid min-w-0 gap-3 border-b border-border/60 p-3 sm:px-5 sm:py-4",
            showRadar && "md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]"
          )}
        >
          {showRadar ? (
            <div className={cn(FROST_TILE, "min-w-0 p-4")}>
              <PlayerCompareRadarLazy
                axes={radarAxes}
                dimensions={visibleDimensions}
                aName={aShort}
                bName={bShort}
                aColor={aFill}
                bColor={bFill}
              />
            </div>
          ) : null}
          <div className={cn(FROST_TILE, "min-w-0 p-4")}>
            <CategoryEdges
              dimensions={visibleDimensions}
              aName={aShort}
              bName={bShort}
              aColor={aFill}
              bColor={bFill}
            />
          </div>
        </div>

        <BiggestGaps
          dimensions={visibleDimensions}
          aName={aShort}
          bName={bShort}
          aColor={aFill}
          bColor={bFill}
          fallbackNote={closeNote}
        />

        <div
          className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-y border-border/60 px-3 py-3 sm:px-5"
          data-capture-exclude=""
        >
          <div className="flex min-w-0 flex-wrap items-end gap-3">
            <SegmentedControl
              size="sm"
              label="Display"
              value={valueMode}
              onChange={setValueMode}
              className="min-w-0 max-w-full"
              options={[
                { id: "raw", label: "Raw values" },
                {
                  id: "percentile",
                  label: "Percentile",
                  disabled: !hasAnyPercentile,
                },
              ]}
            />
            {era ? (
              <SegmentedControl
                size="sm"
                label="Era"
                value={eraActive ? "adjusted" : "played"}
                onChange={(id) => setEraMode(id === "adjusted")}
                className="min-w-0 max-w-full"
                options={[
                  { id: "played", label: "As played" },
                  { id: "adjusted", label: `Adjusted to ${era.reference}` },
                ]}
              />
            ) : null}
          </div>
          <MetricPicker
            dimensions={result.dimensions}
            selectedIds={visibleIds}
            onChange={setVisibleIds}
          />
        </div>

        {eraActive && era ? (
          <EraNote
            era={era}
            aName={result.aName}
            bName={result.bName}
            percentileOnly={!careerMode && valueMode === "percentile"}
          />
        ) : null}

        {coverage.length ? (
          <div
            className={cn(
              type.caption,
              "flex flex-col gap-1 border-b border-border/60 px-3 py-2.5 text-muted-foreground sm:px-5"
            )}
          >
            {coverage.map((note) => (
              <p key={note}>{note}</p>
            ))}
          </div>
        ) : null}

        <section className="px-3 py-1 sm:px-5">
          <h2 className="sr-only">Dimensions</h2>
          {CATEGORY_ORDER.map((group) => {
            const rows = visibleDimensions.filter((d) => d.group === group);
            if (!rows.length) return null;
            return (
              <div key={group} className="mb-1 last:mb-0">
                <h3
                  className={cn(
                    type.micro,
                    "border-b border-border/70 py-2 font-bold uppercase tracking-wide text-muted-foreground"
                  )}
                >
                  {GROUP_TITLE[group] ?? group}
                </h3>
                {rows.map((d) => (
                  <MatchupBarRow
                    key={d.id}
                    dimension={d}
                    aName={aShort}
                    bName={bShort}
                    valueMode={valueMode}
                    aFill={aFill}
                    bFill={bFill}
                  />
                ))}
              </div>
            );
          })}
        </section>

        <footer className="frost-surface-muted flex items-center justify-between gap-3 border-t border-border/60 px-4 py-2.5 sm:px-5">
          <p
            className={cn(
              type.micro,
              "font-bold uppercase tracking-[0.12em] text-muted-foreground"
            )}
          >
            DRBL
          </p>
          <p className={cn(type.micro, "truncate text-muted-foreground")}>
            {origin ? origin.replace(/^https?:\/\//, "") : "drbl"} · compare
          </p>
        </footer>
      </GlassSurface>
    </div>
  );
}

/** @deprecated Prefer MatchupBarRow — kept for team compare imports if any */
export function ComparisonDimensionRow({
  dimension,
  aName,
  bName,
  aColor,
  bColor,
}: {
  dimension: ComparisonDimension;
  aName: string;
  bName: string;
  evenThreshold?: number;
  edgeDisplay?: string;
  aColor?: string;
  bColor?: string;
}) {
  return (
    <MatchupBarRow
      dimension={dimension}
      aName={aName}
      bName={bName}
      valueMode="raw"
      aFill={aColor ?? teamBrandCompareBarFill(undefined)}
      bFill={bColor ?? teamBrandCompareBarFill(undefined)}
    />
  );
}
