"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

import type { ComparisonDimension, PlayerComparisonResult } from "@/analytics";
import {
  CATEGORY_ORDER,
  COMPARE_DEFAULT_METRIC_IDS,
} from "@/analytics/compare-players";
import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { TeamLogo } from "@/components/brand/team-logo";
import { CompareShareControls } from "@/components/compare/compare-share-controls";
import { MetricHelp } from "@/components/learn/metric-help";
import { PlayerIdentity } from "@/components/players/player-identity";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { conceptIdForColumnLabel } from "@/lib/learn-column-concepts";
import { type } from "@/lib/design-system";
import { teamBrandBarGradient } from "@/lib/nba-brand";
import { cn } from "@/lib/utils";

type ValueMode = "raw" | "percentile";

/** Mirror share graphic: value+bar | metric | value+bar */
const MATCHUP_ROW_GRID =
  "grid grid-cols-[minmax(0,1fr)_4.75rem_minmax(0,1fr)] items-center gap-x-2 sm:gap-x-3";

function formatPctile(n: number | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${Math.round(n)}th`;
}

function EdgeLabel({
  delta,
  evenThreshold = 3,
  aName,
  bName,
}: {
  delta?: number;
  evenThreshold?: number;
  aName: string;
  bName: string;
}) {
  if (
    delta == null ||
    !Number.isFinite(delta) ||
    Math.abs(delta) < evenThreshold
  ) {
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
      {delta > 0 ? `${aName} ↑` : `${bName} ↑`}
    </span>
  );
}

function trackPct(
  dimension: ComparisonDimension,
  side: "a" | "b"
): number | undefined {
  const pct =
    side === "a" ? dimension.aPercentile : dimension.bPercentile;
  const bar = side === "a" ? dimension.aBar : dimension.bBar;
  if (pct != null && Number.isFinite(pct)) {
    return Math.max(0, Math.min(100, pct));
  }
  if (bar != null && Number.isFinite(bar)) {
    return Math.max(0, Math.min(100, bar));
  }
  const a = dimension.aValue;
  const b = dimension.bValue;
  if (a == null && b == null) return undefined;
  const peak = Math.max(Math.abs(a ?? 0), Math.abs(b ?? 0), 1e-9);
  const v = side === "a" ? a : b;
  if (v == null) return undefined;
  return Math.max(8, (Math.abs(v) / peak) * 100);
}

function MatchupBarRow({
  dimension,
  aName,
  bName,
  valueMode,
  aGradient,
  bGradient,
}: {
  dimension: ComparisonDimension;
  aName: string;
  bName: string;
  valueMode: ValueMode;
  aGradient: string;
  bGradient: string;
}) {
  const hasPct =
    dimension.aPercentile != null || dimension.bPercentile != null;
  const showPct = valueMode === "percentile" && hasPct;

  const aTrack = trackPct(dimension, "a");
  const bTrack = trackPct(dimension, "b");

  const evenThreshold = showPct || hasPct ? 3 : 0.05;
  const aWins =
    dimension.delta != null &&
    Number.isFinite(dimension.delta) &&
    dimension.delta > evenThreshold;
  const bWins =
    dimension.delta != null &&
    Number.isFinite(dimension.delta) &&
    dimension.delta < -evenThreshold;
  const tied = !aWins && !bWins;

  const aOpacity = tied || aWins ? 1 : 0.5;
  const bOpacity = tied || bWins ? 1 : 0.5;

  const label = (() => {
    const conceptId = conceptIdForColumnLabel(dimension.label);
    return conceptId ? (
      <MetricHelp conceptId={conceptId}>{dimension.label}</MetricHelp>
    ) : (
      dimension.label
    );
  })();

  const aValue = showPct
    ? formatPctile(dimension.aPercentile)
    : dimension.aDisplay;
  const bValue = showPct
    ? formatPctile(dimension.bPercentile)
    : dimension.bDisplay;
  const aTitle = showPct
    ? dimension.aDisplay
    : dimension.aPercentile != null
      ? `${Math.round(dimension.aPercentile)}th %ile`
      : undefined;
  const bTitle = showPct
    ? dimension.bDisplay
    : dimension.bPercentile != null
      ? `${Math.round(dimension.bPercentile)}th %ile`
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
            <div className="h-2 w-full overflow-hidden rounded-full bg-foreground/[0.06]">
              <div
                className="ml-auto h-full rounded-full"
                style={{
                  width: `${aTrack ?? 0}%`,
                  background: aGradient,
                }}
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
            {label}
          </p>
          <EdgeLabel
            delta={dimension.delta}
            aName={aName}
            bName={bName}
            evenThreshold={evenThreshold}
          />
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
            <div className="h-2 w-full overflow-hidden rounded-full bg-foreground/[0.06]">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${bTrack ?? 0}%`,
                  background: bGradient,
                }}
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

type CategoryEdge = "a" | "b" | "even";

function categoryEdge(
  rows: ComparisonDimension[],
  evenThreshold: number
): CategoryEdge {
  let aWins = 0;
  let bWins = 0;
  for (const d of rows) {
    if (d.delta == null || !Number.isFinite(d.delta)) continue;
    if (Math.abs(d.delta) < evenThreshold) continue;
    if (d.delta > 0) aWins += 1;
    else bWins += 1;
  }
  if (aWins === bWins) return "even";
  return aWins > bWins ? "a" : "b";
}

function CategoryScorecard({
  dimensions,
  aName,
  bName,
  aTeamKey,
  bTeamKey,
  usePercentile,
}: {
  dimensions: ComparisonDimension[];
  aName: string;
  bName: string;
  aTeamKey?: string;
  bTeamKey?: string;
  usePercentile: boolean;
}) {
  const evenThreshold = usePercentile ? 3 : 0.05;
  const cards = CATEGORY_ORDER.map((group) => {
    const rows = dimensions.filter((d) => d.group === group);
    if (!rows.length) return null;
    const edge = categoryEdge(rows, evenThreshold);
    return { group, edge, label: GROUP_TITLE[group] ?? group };
  }).filter(Boolean) as Array<{
    group: string;
    edge: CategoryEdge;
    label: string;
  }>;

  if (!cards.length) return null;

  return (
    <section
      className="border-b border-border px-3 py-3 sm:px-5"
      aria-label="Category scorecard"
    >
      <p
        className={cn(
          type.micro,
          "mb-2 font-bold uppercase tracking-[0.12em] text-muted-foreground"
        )}
      >
        Category edge
      </p>
      <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map((card) => {
          const winner =
            card.edge === "a" ? aName : card.edge === "b" ? bName : "Even";
          const gradient =
            card.edge === "a"
              ? teamBrandBarGradient(aTeamKey)
              : card.edge === "b"
                ? teamBrandBarGradient(bTeamKey)
                : undefined;
          return (
            <li
              key={card.group}
              className={cn(
                "relative overflow-hidden rounded-lg border border-border/60 px-2.5 py-2 text-center",
                card.edge === "even" && "bg-secondary/50"
              )}
              style={
                gradient
                  ? { background: gradient }
                  : undefined
              }
            >
              <p
                className={cn(
                  type.micro,
                  "font-bold uppercase tracking-wide",
                  card.edge === "even"
                    ? "text-muted-foreground"
                    : "text-foreground/70"
                )}
              >
                {card.label}
              </p>
              <p
                className={cn(
                  type.caption,
                  "mt-0.5 truncate font-bold tracking-tight",
                  card.edge === "even"
                    ? "text-muted-foreground"
                    : "text-foreground"
                )}
                title={winner}
              >
                {winner}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function TeamChipRow({ teamKeys }: { teamKeys: string[] }) {
  if (!teamKeys.length) return null;
  return (
    <ul className="mt-1.5 flex max-w-full flex-wrap items-center justify-center gap-1.5">
      {teamKeys.map((key) => (
        <li
          key={key}
          className="inline-flex items-center gap-1 rounded-md border border-border/50 bg-background/60 px-1.5 py-0.5"
          title={key}
        >
          <TeamLogo teamKey={key} size="2xs" />
          <span
            className={cn(
              type.micro,
              "font-bold uppercase tracking-wide text-muted-foreground"
            )}
          >
            {key}
          </span>
        </li>
      ))}
    </ul>
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
          "inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-border bg-card px-2.5 py-1.5 font-semibold shadow-sm",
          "transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
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
          className="absolute right-0 z-30 mt-1.5 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card shadow-[var(--shadow-md)]"
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

export function PlayerCompareView({
  result,
}: {
  result: PlayerComparisonResult;
}) {
  const [origin, setOrigin] = useState("");
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
  const aGradient = teamBrandBarGradient(aTeamKey);
  const bGradient = teamBrandBarGradient(bTeamKey);

  return (
    <div className="flex flex-col gap-3">
      <div
        className="flex min-w-0 flex-wrap items-center justify-end gap-3"
        data-capture-exclude=""
      >
        <CompareShareControls result={result} />
      </div>

      <article
        className={cn(
          "compare-snapshot overflow-hidden rounded-xl border border-border",
          "bg-card text-card-foreground shadow-[var(--shadow-md)]"
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
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
            <p
              className={cn(
                type.caption,
                "shrink-0 font-semibold tabular-nums text-muted-foreground"
              )}
            >
              {seasonLine}
            </p>
          ) : null}
        </div>

        <header className="flex min-w-0 items-center justify-center gap-3 overflow-x-clip px-3 py-5 sm:gap-8 sm:px-5">
          <PlayerIdentity
            playerId={result.aId}
            name={result.aName}
            season={
              careerMode ? undefined : (result.seasonA ?? result.season)
            }
            className="flex min-w-0 flex-1 flex-col items-center"
            nameClassName="flex max-w-full flex-col items-center gap-1.5 text-center no-underline hover:underline"
          >
            <PlayerHeadshot
              playerId={result.aId}
              name={result.aName}
              size="lg"
            />
            <span
              className={cn(
                type.body,
                "max-w-full truncate font-bold tracking-tight"
              )}
            >
              {result.aName}
            </span>
            {result.seasonA ? (
              <span
                className={cn(
                  type.caption,
                  "font-semibold tabular-nums text-muted-foreground"
                )}
              >
                {result.seasonA}
              </span>
            ) : null}
            <TeamChipRow teamKeys={result.aTeamKeys ?? []} />
          </PlayerIdentity>

          <p
            className={cn(
              type.caption,
              "shrink-0 font-bold uppercase tracking-[0.14em] text-muted-foreground"
            )}
          >
            vs
          </p>

          <PlayerIdentity
            playerId={result.bId}
            name={result.bName}
            season={
              careerMode ? undefined : (result.seasonB ?? result.season)
            }
            className="flex min-w-0 flex-1 flex-col items-center"
            nameClassName="flex max-w-full flex-col items-center gap-1.5 text-center no-underline hover:underline"
          >
            <PlayerHeadshot
              playerId={result.bId}
              name={result.bName}
              size="lg"
            />
            <span
              className={cn(
                type.body,
                "max-w-full truncate font-bold tracking-tight"
              )}
            >
              {result.bName}
            </span>
            {result.seasonB ? (
              <span
                className={cn(
                  type.caption,
                  "font-semibold tabular-nums text-muted-foreground"
                )}
              >
                {result.seasonB}
              </span>
            ) : null}
            <TeamChipRow teamKeys={result.bTeamKeys ?? []} />
          </PlayerIdentity>
        </header>

        <CategoryScorecard
          dimensions={visibleDimensions}
          aName={aShort}
          bName={bShort}
          aTeamKey={aTeamKey}
          bTeamKey={bTeamKey}
          usePercentile={valueMode === "percentile" && hasAnyPercentile}
        />

        <div
          className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-border px-3 py-3 sm:px-5"
          data-capture-exclude=""
        >
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
          <MetricPicker
            dimensions={result.dimensions}
            selectedIds={visibleIds}
            onChange={setVisibleIds}
          />
        </div>

        <section className="border-t border-border px-3 py-1 sm:px-5">
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
                    aGradient={aGradient}
                    bGradient={bGradient}
                  />
                ))}
              </div>
            );
          })}
        </section>

        {result.differenceSummary.length ? (
          <section className="border-t border-border px-4 py-4 sm:px-5">
            <h2 className={cn(type.bodySm, "font-bold tracking-tight")}>
              How they differ
            </h2>
            <ul className="mt-2 flex flex-col gap-1.5">
              {result.differenceSummary.slice(0, 3).map((line) => (
                <li
                  key={line}
                  className={cn(
                    type.bodySm,
                    "leading-relaxed text-muted-foreground"
                  )}
                >
                  {line}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <footer className="flex items-center justify-between gap-3 border-t border-border bg-secondary/40 px-4 py-2.5 sm:px-5">
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
      </article>
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
      aGradient={aColor ?? teamBrandBarGradient(undefined)}
      bGradient={bColor ?? teamBrandBarGradient(undefined)}
    />
  );
}
