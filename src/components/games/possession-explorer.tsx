"use client";

import { useEffect, useId, useMemo, useState } from "react";

import { TeamSeasonSwatch } from "@/components/brand/team-season-swatch";
import { type } from "@/lib/design-system";
import {
  DEFAULT_POSSESSION_FILTERS,
  POSSESSION_EXPLORER_PAGE_SIZE,
  RESULT_FILTER_OPTIONS,
  filterPossessionRows,
  nextVisibleCount,
  periodLabel,
  resetVisibleCount,
  sliceVisiblePossessions,
  visibleShowingLabel,
  type PossessionExplorerFilters,
  type PossessionExplorerModel,
  type PossessionExplorerRow,
} from "@/lib/possession-explorer";
import { cn } from "@/lib/utils";

function ChipButton({
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
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "shrink-0 rounded-md px-2 py-0.5 text-[12px] font-semibold leading-4 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        active
          ? "border border-foreground/35 bg-foreground text-background shadow-sm"
          : "border border-border/70 bg-background/70 text-muted-foreground hover:border-border hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

function ScoreAfter({
  score,
  homeAbbr,
  awayAbbr,
  homeName,
  awayName,
  compact = false,
}: {
  score: { home: number; away: number } | null;
  homeAbbr: string;
  awayAbbr: string;
  homeName: string;
  awayName: string;
  compact?: boolean;
}) {
  if (!score) {
    return <span className="text-muted-foreground">—</span>;
  }
  if (compact) {
    return (
      <span className="flex flex-col items-end gap-0.5 tabular-nums">
        <span>
          <span className="sr-only">{awayName} </span>
          {awayAbbr}&nbsp;{score.away}
        </span>
        <span>
          <span className="sr-only">{homeName} </span>
          {homeAbbr}&nbsp;{score.home}
        </span>
      </span>
    );
  }
  return (
    <span className="tabular-nums">
      <span className="sr-only">
        {awayName} {score.away}, {homeName} {score.home}
      </span>
      <span aria-hidden>
        {awayAbbr} {score.away} · {homeAbbr} {score.home}
      </span>
    </span>
  );
}

function OffenseCell({
  abbreviation,
  name,
  teamKey,
}: {
  abbreviation: string;
  name: string;
  teamKey: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <TeamSeasonSwatch teamKeys={[teamKey]} size="xs" />
      <span className="font-semibold" title={name}>
        {abbreviation}
      </span>
      <span className="sr-only">{name}</span>
    </span>
  );
}

function EventList({ row }: { row: PossessionExplorerRow }) {
  if (row.events.length === 0) {
    return (
      <p className="text-[12px] text-muted-foreground">
        No events linked for this possession.
      </p>
    );
  }
  return (
    <ol className="flex flex-col gap-1">
      {row.events.map((event) => (
        <li
          key={event.id}
          className="grid grid-cols-[2.75rem_1fr] gap-2 border-b border-border/30 pb-1 last:border-0 last:pb-0"
        >
          <span className="text-[12px] tabular-nums text-muted-foreground">
            {event.clock}
          </span>
          <div className="min-w-0">
            <p className="text-[12px] leading-4 text-foreground">
              {event.description}
            </p>
            {event.actionType ? (
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {event.actionType}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

function PlaysToggle({
  row,
  expanded,
  onToggle,
  panelId,
}: {
  row: PossessionExplorerRow;
  expanded: boolean;
  onToggle: () => void;
  panelId: string;
}) {
  return (
    <button
      type="button"
      aria-expanded={expanded}
      aria-controls={panelId}
      onClick={onToggle}
      className={cn(
        "rounded px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors",
        "hover:bg-secondary hover:text-foreground",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      )}
    >
      <span aria-hidden>{expanded ? "Hide ⌃" : "Plays ⌄"}</span>
      <span className="sr-only">
        {expanded ? "Hide" : "Show"} plays for possession {row.ordinal}
      </span>
    </button>
  );
}

function PossessionRowExpand({
  row,
  expanded,
  onToggle,
  homeAbbr,
  awayAbbr,
  homeName,
  awayName,
  variant,
}: {
  row: PossessionExplorerRow;
  expanded: boolean;
  onToggle: () => void;
  homeAbbr: string;
  awayAbbr: string;
  homeName: string;
  awayName: string;
  variant: "table" | "card";
}) {
  const panelId = useId();
  const toggle = (
    <PlaysToggle
      row={row}
      expanded={expanded}
      onToggle={onToggle}
      panelId={panelId}
    />
  );

  if (variant === "card") {
    return (
      <article className="rounded-md border border-border/50 bg-background/85 px-3 py-2.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-medium tabular-nums text-muted-foreground">
              POSS {row.ordinal} · {row.periodLabel} {row.startClock}
            </p>
            <p className="mt-0.5 text-[14px] leading-5">
              <OffenseCell
                abbreviation={row.offenseTeamAbbreviation}
                name={row.offenseTeamName}
                teamKey={row.offenseTeamId}
              />
            </p>
            <p className="text-[12px] text-muted-foreground">
              {row.endReasonLabel}
            </p>
          </div>
          <div className="text-right text-[12px]">
            <p className="font-semibold tabular-nums">{row.points} PTS</p>
            <div className="mt-0.5 text-muted-foreground">
              <ScoreAfter
                score={row.scoreAfter}
                homeAbbr={homeAbbr}
                awayAbbr={awayAbbr}
                homeName={homeName}
                awayName={awayName}
                compact
              />
            </div>
          </div>
        </div>
        <div className="mt-1.5 flex justify-end">{toggle}</div>
        {expanded ? (
          <div id={panelId} className="mt-2 border-t border-border/40 pt-2">
            <EventList row={row} />
          </div>
        ) : null}
      </article>
    );
  }

  return (
    <>
      <tr className="border-b border-border/40 transition-colors hover:bg-secondary/35">
        <td className="py-1.5 pr-2 text-[13px] tabular-nums font-medium align-middle">
          {row.ordinal}
        </td>
        <td className="px-2 py-1.5 text-[13px] tabular-nums align-middle">
          {row.periodLabel} {row.startClock}
        </td>
        <td className="px-2 py-1.5 text-[13px] align-middle">
          <OffenseCell
            abbreviation={row.offenseTeamAbbreviation}
            name={row.offenseTeamName}
            teamKey={row.offenseTeamId}
          />
        </td>
        <td className="px-2 py-1.5 text-[13px] align-middle text-muted-foreground">
          {row.endReasonLabel}
        </td>
        <td className="px-2 py-1.5 text-right text-[13px] tabular-nums font-medium align-middle">
          {row.points}
        </td>
        <td className="px-2 py-1.5 text-right text-[12px] align-middle">
          <ScoreAfter
            score={row.scoreAfter}
            homeAbbr={homeAbbr}
            awayAbbr={awayAbbr}
            homeName={homeName}
            awayName={awayName}
          />
        </td>
        <td className="py-1.5 pl-1 text-right align-middle">{toggle}</td>
      </tr>
      {expanded ? (
        <tr className="border-b border-border/30 bg-background/70">
          <td colSpan={7} className="px-3 py-2.5" id={panelId}>
            <EventList row={row} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function QualityNotices({
  model,
}: {
  model: Extract<PossessionExplorerModel, { status: "available" }>;
}) {
  const mismatch = model.quality.notices.find((n) => n.kind === "mismatch");
  const lineup = model.quality.notices.find(
    (n) => n.kind === "lineup_unavailable"
  );
  const derived = model.quality.notices.find((n) => n.kind === "derived");
  const comparisonUnavailable = model.quality.notices.find(
    (n) => n.kind === "comparison_unavailable"
  );

  return (
    <div className="flex flex-col gap-2">
      {derived ? (
        <p className="text-[12px] text-muted-foreground">
          <span className="mr-1.5 inline-flex rounded border border-border/70 bg-background/80 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-foreground">
            Derived
          </span>
          {derived.message}
        </p>
      ) : null}
      {mismatch ? (
        <p
          role="status"
          className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-[12px] text-amber-950 dark:text-amber-100"
        >
          {mismatch.message}
        </p>
      ) : null}
      {lineup ? (
        <p
          role="status"
          className="rounded-md border border-border/70 bg-background/70 px-2.5 py-2 text-[12px] text-muted-foreground"
        >
          {lineup.message}
        </p>
      ) : null}
      {comparisonUnavailable && !mismatch ? (
        <p className="text-[12px] text-muted-foreground">
          {comparisonUnavailable.message}
        </p>
      ) : null}
    </div>
  );
}

function DataDetailsDisclosure({
  model,
}: {
  model: Extract<PossessionExplorerModel, { status: "available" }>;
}) {
  const { details, officialComparison } = model.quality;
  const comparisonLabel =
    officialComparison === "matched"
      ? "Exact match"
      : officialComparison === "within_tolerance"
        ? "Within tolerance (±1) — not an exact match"
        : officialComparison === "mismatched"
          ? "Mismatched"
          : "Unavailable";

  return (
    <details className="group rounded-md border border-border/50 bg-background/60 px-3 py-1.5">
      <summary
        className={cn(
          "cursor-pointer list-none text-[12px] font-semibold text-foreground marker:content-none",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          "[&::-webkit-details-marker]:hidden"
        )}
      >
        Data details
      </summary>
      <div className="mt-2 space-y-1 text-[12px] text-muted-foreground">
        <p>
          Play-by-play: {model.provenance.playByPlayLabel} · Box score:{" "}
          {model.provenance.boxScoreLabel}
        </p>
        <p>Official comparison: {comparisonLabel}</p>
        {details.derivedHome != null && details.derivedAway != null ? (
          <p>
            Derived team possessions: {details.derivedHome} home /{" "}
            {details.derivedAway} away
          </p>
        ) : null}
        {details.officialHome != null && details.officialAway != null ? (
          <p>
            NBA-reported team possessions: {details.officialHome} home /{" "}
            {details.officialAway} away
          </p>
        ) : (
          <p>NBA-reported team possessions: unavailable</p>
        )}
        {details.deltaHome != null && details.deltaAway != null ? (
          <p>
            Delta (derived − official): {details.deltaHome} / {details.deltaAway}
          </p>
        ) : null}
        <p>
          Lineup context:{" "}
          {model.quality.lineupContextAvailable ? "available" : "unavailable"}
        </p>
        {model.quality.suppressAggregateMetrics ? (
          <p>
            Aggregate possession metrics (pace, PPP, ratings) are suppressed for
            this game.
          </p>
        ) : null}
      </div>
    </details>
  );
}

export function PossessionExplorer({
  model,
}: {
  model: PossessionExplorerModel;
}) {
  if (model.status === "unavailable") {
    return <PossessionExplorerUnavailable model={model} />;
  }
  return <PossessionExplorerAvailable model={model} />;
}

function PossessionExplorerUnavailable({
  model,
}: {
  model: Extract<PossessionExplorerModel, { status: "unavailable" }>;
}) {
  return (
    <section
      aria-labelledby="possession-explorer-heading"
      className="flex flex-col gap-3"
    >
      <div>
        <h2 id="possession-explorer-heading" className={type.heading}>
          Possession Explorer
        </h2>
        <p className={cn(type.bodySm, "mt-1 text-muted-foreground")}>
          Possession sequences reconstructed from official play-by-play.
        </p>
      </div>
      <div
        role="status"
        className="rounded-md border border-border/70 bg-background/80 px-3 py-3"
      >
        <p className="text-[14px] font-semibold text-foreground">
          {model.userMessage}
        </p>
        <p className="mt-1 text-[12px] text-muted-foreground">
          {model.secondaryMessage}
        </p>
      </div>
    </section>
  );
}

function PossessionExplorerAvailable({
  model,
}: {
  model: Extract<PossessionExplorerModel, { status: "available" }>;
}) {
  const [filters, setFilters] = useState<PossessionExplorerFilters>(
    DEFAULT_POSSESSION_FILTERS
  );
  const [visibleCount, setVisibleCount] = useState(POSSESSION_EXPLORER_PAGE_SIZE);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    setVisibleCount(resetVisibleCount());
    setExpandedId(null);
  }, [filters.period, filters.offense, filters.result]);

  const matched = useMemo(
    () => filterPossessionRows(model.rows, filters),
    [model.rows, filters]
  );

  const visible = sliceVisiblePossessions(matched, visibleCount);
  const countLabel = visibleShowingLabel(
    visible.length,
    matched.length,
    model.rows.length
  );
  const otPeriods = model.periodOptions.filter((p) => p > 4);
  const regulation = model.periodOptions.filter((p) => p >= 1 && p <= 4);

  return (
    <section
      aria-labelledby="possession-explorer-heading"
      className="flex flex-col gap-3"
    >
      <div>
        <h2 id="possession-explorer-heading" className={type.heading}>
          Possession Explorer
        </h2>
        <p className={cn(type.bodySm, "mt-1 text-muted-foreground")}>
          Possession sequences reconstructed from official play-by-play.
        </p>
      </div>

      <QualityNotices model={model} />
      <DataDetailsDisclosure model={model} />

      <div className="flex flex-col gap-2.5">
        <fieldset className="min-w-0">
          <legend className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Period
          </legend>
          <div className="flex gap-1 overflow-x-auto pb-0.5">
            <ChipButton
              active={filters.period === "all"}
              onClick={() => setFilters((f) => ({ ...f, period: "all" }))}
            >
              All
            </ChipButton>
            {regulation.map((period) => (
              <ChipButton
                key={period}
                active={filters.period === period}
                onClick={() => setFilters((f) => ({ ...f, period }))}
              >
                {periodLabel(period)}
              </ChipButton>
            ))}
            {otPeriods.map((period) => (
              <ChipButton
                key={period}
                active={filters.period === period}
                onClick={() => setFilters((f) => ({ ...f, period }))}
              >
                {periodLabel(period)}
              </ChipButton>
            ))}
          </div>
        </fieldset>

        <fieldset className="min-w-0">
          <legend className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Offense
          </legend>
          <div className="flex gap-1 overflow-x-auto pb-0.5">
            <ChipButton
              active={filters.offense === "both"}
              onClick={() => setFilters((f) => ({ ...f, offense: "both" }))}
            >
              Both teams
            </ChipButton>
            <ChipButton
              active={filters.offense === "home"}
              onClick={() => setFilters((f) => ({ ...f, offense: "home" }))}
            >
              {model.teams.home.abbreviation}
            </ChipButton>
            <ChipButton
              active={filters.offense === "away"}
              onClick={() => setFilters((f) => ({ ...f, offense: "away" }))}
            >
              {model.teams.away.abbreviation}
            </ChipButton>
          </div>
        </fieldset>

        <fieldset className="min-w-0">
          <legend className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Result
          </legend>
          <div className="flex gap-1 overflow-x-auto pb-0.5">
            {RESULT_FILTER_OPTIONS.map((option) => (
              <ChipButton
                key={option.value}
                active={filters.result === option.value}
                onClick={() =>
                  setFilters((f) => ({ ...f, result: option.value }))
                }
              >
                {option.label}
              </ChipButton>
            ))}
          </div>
        </fieldset>
      </div>

      <p
        className="text-[12px] font-medium text-muted-foreground"
        aria-live="polite"
      >
        {countLabel}
      </p>

      {matched.length === 0 ? (
        <p
          role="status"
          className="rounded-md border border-border/60 bg-background/80 px-3 py-3 text-[14px] text-muted-foreground"
        >
          No reconstructed possessions match these filters.
        </p>
      ) : (
        <>
          <div className="hidden md:block">
            <div className="overflow-x-auto rounded-md border border-border/50 bg-background/90">
              <table className="w-full min-w-[40rem] text-left">
                <thead className="sticky top-0 z-[1] bg-secondary/90 text-[11px] uppercase tracking-wide text-muted-foreground backdrop-blur-sm">
                  <tr className="border-b border-border/60">
                    <th scope="col" className="px-2 py-1.5 font-semibold">
                      POSS
                    </th>
                    <th scope="col" className="px-2 py-1.5 font-semibold">
                      Time
                    </th>
                    <th scope="col" className="px-2 py-1.5 font-semibold">
                      Offense
                    </th>
                    <th scope="col" className="px-2 py-1.5 font-semibold">
                      Result
                    </th>
                    <th
                      scope="col"
                      className="px-2 py-1.5 text-right font-semibold"
                    >
                      PTS
                    </th>
                    <th
                      scope="col"
                      className="px-2 py-1.5 text-right font-semibold"
                    >
                      Score after
                    </th>
                    <th scope="col" className="px-2 py-1.5 text-right font-semibold">
                      <span className="sr-only">Expand</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <PossessionRowExpand
                      key={row.id}
                      row={row}
                      variant="table"
                      homeAbbr={model.teams.home.abbreviation}
                      awayAbbr={model.teams.away.abbreviation}
                      homeName={model.teams.home.displayName}
                      awayName={model.teams.away.displayName}
                      expanded={expandedId === row.id}
                      onToggle={() =>
                        setExpandedId((id) => (id === row.id ? null : row.id))
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-col gap-2 md:hidden">
            {visible.map((row) => (
              <PossessionRowExpand
                key={row.id}
                row={row}
                variant="card"
                homeAbbr={model.teams.home.abbreviation}
                awayAbbr={model.teams.away.abbreviation}
                homeName={model.teams.home.displayName}
                awayName={model.teams.away.displayName}
                expanded={expandedId === row.id}
                onToggle={() =>
                  setExpandedId((id) => (id === row.id ? null : row.id))
                }
              />
            ))}
          </div>

          {visible.length < matched.length ? (
            <button
              type="button"
              onClick={() =>
                setVisibleCount((count) =>
                  nextVisibleCount(count, matched.length)
                )
              }
              className={cn(
                "self-start rounded-md border border-border/70 bg-background/80 px-2.5 py-1.5 text-[12px] font-semibold text-foreground",
                "hover:bg-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              )}
            >
              Show 25 more
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}
