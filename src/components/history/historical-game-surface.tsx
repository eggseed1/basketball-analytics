"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import type {
  HistoricalGameArtifact,
  HistoricalPlayerGame,
} from "@/data/history/types";
import { pickTopPerformers } from "@/lib/history/performers";
import { cn } from "@/lib/utils";

export type RunWindow = {
  teamId: string;
  points: number;
  startEventIndex: number;
  endEventIndex: number;
  startPeriod?: number;
  startClock?: string;
  endPeriod?: number;
  endClock?: string;
  scoreBefore?: { home: number; away: number };
  scoreAfter?: { home: number; away: number };
  scorerIds?: string[];
};

type TimelinePoint = {
  elapsedGameTime: number;
  margin: number;
  homeScore: number;
  awayScore: number;
  clock: string;
  period: number;
  points: number;
  eventIndex?: number;
  scorerId?: string | null;
  scoringTeamId?: string;
};

function PerformerCard({
  label,
  player,
}: {
  label: string;
  player: HistoricalPlayerGame | null;
}) {
  if (!player) return null;
  return (
    <div className="sports-card p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <Link
        href={`/players/${player.playerId}`}
        className="mt-1 block text-[15px] font-semibold tracking-tight hover:underline"
      >
        {player.playerName}
      </Link>
      <p className="mt-1 text-[13px] tabular-nums text-muted-foreground">
        {player.points} PTS · {player.rebounds} REB · {player.assists} AST
      </p>
    </div>
  );
}

function MarginChart({
  timeline,
  events,
  homeLabel,
  awayLabel,
  selectedEventIndex,
  onSelectPoint,
}: {
  timeline: TimelinePoint[];
  events: HistoricalGameArtifact["events"];
  homeLabel: string;
  awayLabel: string;
  selectedEventIndex?: number | null;
  onSelectPoint?: (point: TimelinePoint) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const { poly, maxAbs, maxT, periodMarks } = useMemo(() => {
    if (!timeline.length)
      return { poly: "", maxAbs: 1, maxT: 1, periodMarks: [] as number[] };
    const maxT = Math.max(...timeline.map((p) => p.elapsedGameTime), 1);
    const maxAbs = Math.max(...timeline.map((p) => Math.abs(p.margin)), 1);
    const w = 320;
    const h = 120;
    const mid = h / 2;
    const coords = timeline.map((p) => {
      const x = (p.elapsedGameTime / maxT) * w;
      const y = mid - (p.margin / maxAbs) * (h / 2 - 8);
      return `${x},${y}`;
    });
    const marks: number[] = [];
    const maxPeriod = Math.max(...timeline.map((p) => p.period), 4);
    for (let p = 1; p < maxPeriod; p++) {
      const end = p <= 4 ? p * 12 * 60 : 4 * 12 * 60 + (p - 4) * 5 * 60;
      if (end < maxT) marks.push(end);
    }
    return { poly: coords.join(" "), maxAbs, maxT, periodMarks: marks };
  }, [timeline]);

  if (!timeline.length) return null;
  const w = 320;
  const h = 120;
  const mid = h / 2;
  const activeIdx =
    hover ??
    (selectedEventIndex != null
      ? timeline.findIndex((p) => p.eventIndex === selectedEventIndex)
      : -1);
  const active = activeIdx >= 0 ? timeline[activeIdx] : null;
  const scorerName =
    active?.scorerName?.trim() ||
    (active?.scorerId != null
      ? events.find((e) => e.playerId === active.scorerId)?.playerName
      : null);
  const play =
    active?.eventIndex != null
      ? events.find((e) => e.eventIndex === active.eventIndex)
      : null;

  return (
    <div className="sports-card p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Margin over game time
      </p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        {homeLabel} lead up · {awayLabel} lead down
      </p>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="mt-3 h-auto w-full max-w-xl"
        role="img"
        aria-label="Score margin chart"
      >
        <line
          x1={0}
          y1={mid}
          x2={w}
          y2={mid}
          stroke="currentColor"
          strokeOpacity={0.2}
        />
        {periodMarks.map((t) => {
          const x = (t / maxT) * w;
          return (
            <line
              key={t}
              x1={x}
              y1={4}
              x2={x}
              y2={h - 4}
              stroke="currentColor"
              strokeOpacity={0.12}
              strokeDasharray="2 3"
            />
          );
        })}
        <polyline
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          points={poly}
        />
        {timeline.map((p, i) => {
          const x = (p.elapsedGameTime / maxT) * w;
          const y = mid - (p.margin / maxAbs) * (h / 2 - 8);
          const selected =
            activeIdx === i ||
            (selectedEventIndex != null && p.eventIndex === selectedEventIndex);
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={selected ? 4.5 : 2.5}
              className="fill-foreground cursor-pointer"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onSelectPoint?.(p)}
            />
          );
        })}
      </svg>
      {active ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] tabular-nums text-muted-foreground">
          <span>
            Q{active.period} {active.clock} · {awayLabel} {active.awayScore}–
            {homeLabel} {active.homeScore}
            {scorerName ? ` · ${scorerName}` : ""}
            {play ? ` · ${play.description}` : ` · +${active.points}`}
          </span>
          {active.eventIndex != null && onSelectPoint ? (
            <button
              type="button"
              className="font-semibold text-foreground underline-offset-4 hover:underline"
              onClick={() => onSelectPoint(active)}
            >
              VIEW PLAY
            </button>
          ) : null}
        </div>
      ) : (
        <p className="mt-2 text-[12px] text-muted-foreground">
          Tap a scoring point for clock, score, and play.
        </p>
      )}
    </div>
  );
}

function GameFlowPanel({
  artifact,
  onShowRunShots,
  onShowRunPlays,
  onViewRun,
  onSelectTimelinePoint,
  selectedEventIndex,
  activeRun,
}: {
  artifact: HistoricalGameArtifact;
  onShowRunShots?: (run: RunWindow) => void;
  onShowRunPlays?: (run: RunWindow) => void;
  onViewRun?: (run: RunWindow) => void;
  onSelectTimelinePoint?: (point: TimelinePoint) => void;
  selectedEventIndex?: number | null;
  activeRun?: RunWindow | null;
}) {
  const flow = artifact.gameFlow;
  const summary = artifact.summary;
  if (!summary.scoreTimelineAvailable || !flow) {
    return (
      <section className="flex flex-col gap-2">
        <h2 className="text-[15px] font-semibold tracking-tight">Game Flow</h2>
        <p className="text-[13px] text-muted-foreground">
          Game flow isn&apos;t available for this game.
        </p>
      </section>
    );
  }

  const homeLead = summary.largestHomeLead ?? 0;
  const awayLead = summary.largestAwayLead ?? 0;
  const leadSide =
    homeLead >= awayLead
      ? { label: summary.homeTricode ?? "Home", value: homeLead }
      : { label: summary.awayTricode ?? "Away", value: awayLead };
  const homeRunPts =
    (flow.largestStrictRunHome as { points?: number } | null)?.points ?? 0;
  const awayRunPts =
    (flow.largestStrictRunAway as { points?: number } | null)?.points ?? 0;
  const runSide =
    homeRunPts >= awayRunPts
      ? {
          label: summary.homeTricode ?? "Home",
          value: homeRunPts,
          run: flow.largestStrictRunHome as RunWindow | null,
        }
      : {
          label: summary.awayTricode ?? "Away",
          value: awayRunPts,
          run: flow.largestStrictRunAway as RunWindow | null,
        };
  const comeback = summary.largestDeficitOvercomeByWinner ?? 0;

  const topRuns = (Array.isArray(flow.topRuns) ? flow.topRuns : []) as RunWindow[];

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight">Game Flow</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          How the score moved — leads, runs, and the swing.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Largest lead"
          value={
            leadSide.value > 0
              ? `${leadSide.label} +${leadSide.value}`
              : "—"
          }
        />
        <Stat
          label="Largest run"
          value={
            runSide.value > 0 ? `${runSide.label} ${runSide.value}-0` : "—"
          }
        />
        <Stat label="Lead changes" value={`${summary.leadChanges ?? 0}`} />
        {comeback > 0 ? (
          <Stat label="Largest comeback" value={`${comeback}`} />
        ) : null}
      </div>

      {topRuns.length ? (
        <div className="sports-card p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Scoring runs
          </p>
          <ul className="mt-2 flex flex-col gap-2 text-[13px]">
            {topRuns.slice(0, 5).map((r, i) => {
              const tri =
                r.teamId === summary.homeTeamId
                  ? summary.homeTricode
                  : summary.awayTricode;
              const active =
                activeRun &&
                activeRun.startEventIndex === r.startEventIndex &&
                activeRun.endEventIndex === r.endEventIndex;
              return (
                <li
                  key={i}
                  className={cn(
                    "flex flex-col gap-1 rounded-md border border-transparent px-2 py-1.5",
                    active ? "border-border bg-secondary/50" : ""
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">
                      {tri} {r.points}-0
                      {r.startClock != null && r.endClock != null ? (
                        <span className="ml-2 font-normal text-muted-foreground">
                          {r.startClock} → {r.endClock}
                          {r.startPeriod != null
                            ? ` Q${r.startPeriod}`
                            : ""}
                        </span>
                      ) : null}
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {onViewRun &&
                      r.startEventIndex != null &&
                      r.endEventIndex != null ? (
                        <button
                          type="button"
                          className="text-[12px] font-semibold underline-offset-4 hover:underline"
                          onClick={() => onViewRun(r)}
                        >
                          VIEW RUN
                        </button>
                      ) : null}
                      {onShowRunPlays &&
                      r.startEventIndex != null &&
                      r.endEventIndex != null ? (
                        <button
                          type="button"
                          className="text-[12px] font-semibold underline-offset-4 hover:underline"
                          onClick={() => onShowRunPlays(r)}
                        >
                          SHOW PLAYS
                        </button>
                      ) : null}
                      {onShowRunShots &&
                      r.startEventIndex != null &&
                      r.endEventIndex != null ? (
                        <button
                          type="button"
                          className="text-[12px] font-semibold underline-offset-4 hover:underline"
                          onClick={() => onShowRunShots(r)}
                        >
                          SHOW SHOTS
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {active && r.scoreBefore && r.scoreAfter ? (
                    <p className="text-[12px] text-muted-foreground">
                      Score {r.scoreBefore.away}-{r.scoreBefore.home} →{" "}
                      {r.scoreAfter.away}-{r.scoreAfter.home}
                      {r.scorerIds?.length
                        ? ` · ${r.scorerIds.length} scorers`
                        : ""}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {Array.isArray(artifact.scoreTimeline) ? (
        <MarginChart
          timeline={artifact.scoreTimeline as TimelinePoint[]}
          events={artifact.events}
          homeLabel={summary.homeTricode ?? "Home"}
          awayLabel={summary.awayTricode ?? "Away"}
          selectedEventIndex={selectedEventIndex}
          onSelectPoint={onSelectTimelinePoint}
        />
      ) : null}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="sports-card p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-[14px] font-semibold tabular-nums tracking-tight">
        {value}
      </p>
    </div>
  );
}

const FILTERS = [
  "All",
  "Scoring",
  "Shots",
  "Turnovers",
  "Fouls",
  "Subs",
] as const;

function filterEvent(
  eventType: string,
  filter: (typeof FILTERS)[number]
): boolean {
  if (filter === "All") return true;
  if (filter === "Scoring")
    return (
      eventType === "MADE_SHOT" ||
      eventType === "FREE_THROW" ||
      eventType === "MISSED_SHOT"
    );
  if (filter === "Shots")
    return eventType === "MADE_SHOT" || eventType === "MISSED_SHOT";
  if (filter === "Turnovers") return eventType === "TURNOVER";
  if (filter === "Fouls") return eventType === "FOUL";
  if (filter === "Subs") return eventType === "SUBSTITUTION";
  return true;
}

function PlayByPlayPanel({
  artifact,
  selectedPbpIndex = null,
  onSelectPbpEvent,
  onShowOnCourt,
  runWindow = null,
  hasShotForIndex,
}: {
  artifact: HistoricalGameArtifact;
  selectedPbpIndex?: number | null;
  onSelectPbpEvent?: (eventIndex: number, eventType: string) => void;
  onShowOnCourt?: (eventIndex: number) => void;
  runWindow?: { startEventIndex: number; endEventIndex: number } | null;
  hasShotForIndex?: (eventIndex: number) => boolean;
}) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [showAllEvents, setShowAllEvents] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const events = artifact.events ?? [];
  const scoped = runWindow
    ? events.filter(
        (e) =>
          e.eventIndex >= runWindow.startEventIndex &&
          e.eventIndex <= runWindow.endEventIndex
      )
    : events;
  const filtered = scoped.filter((e) => filterEvent(e.eventType, filter));
  const filteredRows =
    filter === "Scoring" ? scoped.filter((e) => e.points > 0) : filtered;
  // Bound initial PBP DOM — full event array stays available for linking.
  const PBP_INITIAL = 80;
  const rows =
    showAllEvents || runWindow || filteredRows.length <= PBP_INITIAL
      ? filteredRows
      : filteredRows.slice(0, PBP_INITIAL);

  useEffect(() => {
    if (selectedPbpIndex == null || !listRef.current) return;
    const el = listRef.current.querySelector(
      `[data-event-index="${selectedPbpIndex}"]`
    );
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedPbpIndex, runWindow]);

  let lastPeriod = -1;

  return (
    <section id="historical-pbp" className="flex flex-col gap-3">
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight">
          Play-by-play
        </h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {runWindow
            ? "Showing plays inside the selected run."
            : "Recorded events. Substitutions shown as logged — no lineup claims."}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-md border px-2.5 py-1 text-[12px]",
              filter === f
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {f}
          </button>
        ))}
      </div>
      <div
        ref={listRef}
        className="sports-card max-h-[32rem] overflow-y-auto p-2 sm:p-3"
      >
        <ul className="flex flex-col gap-1">
          {rows.map((e) => {
            const showPeriod = e.period !== lastPeriod;
            lastPeriod = e.period;
            const selected = selectedPbpIndex === e.eventIndex;
            const shotLink =
              (e.eventType === "MADE_SHOT" || e.eventType === "MISSED_SHOT") &&
              hasShotForIndex?.(e.eventIndex);
            return (
              <li key={e.eventIndex} data-event-index={e.eventIndex}>
                {showPeriod ? (
                  <p className="mb-1 mt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {e.period <= 4
                      ? `Quarter ${e.period}`
                      : `OT ${e.period - 4}`}
                  </p>
                ) : null}
                <div
                  className={cn(
                    "flex flex-col gap-1 rounded-md px-1 py-1 sm:flex-row sm:items-start sm:gap-2",
                    selected ? "bg-secondary/70" : "hover:bg-secondary/40"
                  )}
                >
                  <button
                    type="button"
                    onClick={() =>
                      onSelectPbpEvent?.(e.eventIndex, e.eventType)
                    }
                    className="grid min-w-0 flex-1 grid-cols-[3rem_1fr_4.5rem] gap-2 text-left text-[13px] leading-snug sm:grid-cols-[3.5rem_1fr_5rem]"
                  >
                    <span className="tabular-nums text-muted-foreground">
                      {e.clock}
                    </span>
                    <span>
                      {e.playerId ? (
                        <Link
                          href={`/players/${e.playerId}`}
                          className="font-medium hover:underline"
                          onClick={(ev) => ev.stopPropagation()}
                        >
                          {e.playerName ?? "Player"}
                        </Link>
                      ) : null}
                      {e.playerId ? " " : null}
                      <span className="text-muted-foreground">
                        {e.description}
                      </span>
                    </span>
                    <span className="text-right tabular-nums text-muted-foreground">
                      {e.awayScore}–{e.homeScore}
                    </span>
                  </button>
                  {shotLink ? (
                    <button
                      type="button"
                      className="shrink-0 text-[11px] font-semibold underline-offset-4 hover:underline"
                      onClick={() => onShowOnCourt?.(e.eventIndex)}
                    >
                      SHOW ON COURT
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
        {!showAllEvents &&
        !runWindow &&
        filteredRows.length > PBP_INITIAL ? (
          <button
            type="button"
            className="mt-2 w-full rounded-md border border-border px-3 py-2 text-[12px] font-semibold hover:bg-secondary/40"
            onClick={() => setShowAllEvents(true)}
          >
            Show all {filteredRows.length} plays
          </button>
        ) : null}
      </div>
    </section>
  );
}

export function HistoricalGameSurface({
  artifact,
  onShowRunShots,
  onShowRunPlays,
  onViewRun,
  onSelectTimelinePoint,
  onSelectPbpEvent,
  onShowOnCourt,
  selectedPbpIndex = null,
  activeRun = null,
  pbpRunWindow = null,
  hasShotForIndex,
}: {
  artifact: HistoricalGameArtifact;
  onShowRunShots?: (run: RunWindow) => void;
  onShowRunPlays?: (run: RunWindow) => void;
  onViewRun?: (run: RunWindow) => void;
  onSelectTimelinePoint?: (point: TimelinePoint) => void;
  onSelectPbpEvent?: (eventIndex: number, eventType: string) => void;
  onShowOnCourt?: (eventIndex: number) => void;
  selectedPbpIndex?: number | null;
  activeRun?: RunWindow | null;
  pbpRunWindow?: { startEventIndex: number; endEventIndex: number } | null;
  hasShotForIndex?: (eventIndex: number) => boolean;
}) {
  const { home, away } = pickTopPerformers(artifact.playerGames);
  const s = artifact.summary;
  const dateLabel = s.date
    ? new Date(s.date + "T12:00:00").toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : s.season;

  return (
    <div className="flex flex-col gap-8">
      <p className="text-[12px] text-muted-foreground">
        <Link href="/history" className="hover:underline">
          History
        </Link>
        <span className="mx-1.5">/</span>
        <Link
          href={`/history/${encodeURIComponent(s.season)}`}
          className="hover:underline"
        >
          {s.season}
        </Link>
      </p>

      <section className="sports-card matchup-wash p-5 sm:p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Final
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[22px] font-semibold tracking-tight sm:text-[28px]">
              <Link
                href={`/teams/${s.awayTeamId}?season=${encodeURIComponent(s.season)}`}
                className="hover:underline"
              >
                {s.awayTricode ?? "Away"}
              </Link>{" "}
              <span className="score-num tabular-nums">{s.awayScore}</span>
            </p>
            <p className="mt-1 text-[22px] font-semibold tracking-tight sm:text-[28px]">
              <Link
                href={`/teams/${s.homeTeamId}?season=${encodeURIComponent(s.season)}`}
                className="hover:underline"
              >
                {s.homeTricode ?? "Home"}
              </Link>{" "}
              <span className="score-num tabular-nums">{s.homeScore}</span>
            </p>
          </div>
          <p className="text-[13px] text-muted-foreground">{dateLabel}</p>
        </div>
      </section>

      <section>
        <h2 className="text-[15px] font-semibold tracking-tight">
          Top Performers
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <PerformerCard label={s.awayTricode ?? "Away"} player={away} />
          <PerformerCard label={s.homeTricode ?? "Home"} player={home} />
        </div>
      </section>

      <QuarterByQuarter artifact={artifact} />

      <GameFlowPanel
        artifact={artifact}
        onShowRunShots={onShowRunShots}
        onShowRunPlays={onShowRunPlays}
        onViewRun={onViewRun}
        onSelectTimelinePoint={onSelectTimelinePoint}
        selectedEventIndex={selectedPbpIndex}
        activeRun={activeRun}
      />

      <PlayByPlayPanel
        artifact={artifact}
        selectedPbpIndex={selectedPbpIndex}
        onSelectPbpEvent={onSelectPbpEvent}
        onShowOnCourt={onShowOnCourt}
        runWindow={pbpRunWindow}
        hasShotForIndex={hasShotForIndex}
      />
    </div>
  );
}

function QuarterByQuarter({
  artifact,
}: {
  artifact: HistoricalGameArtifact;
}) {
  const timeline = Array.isArray(artifact.scoreTimeline)
    ? (artifact.scoreTimeline as Array<{
        period: number;
        homeScore: number;
        awayScore: number;
      }>)
    : [];
  if (!timeline.length) return null;
  const maxPeriod = Math.max(...timeline.map((p) => p.period), 4);
  const periods = Array.from({ length: maxPeriod }, (_, i) => i + 1);
  const endOf = (period: number) => {
    const pts = timeline.filter((p) => p.period === period);
    return pts[pts.length - 1] ?? null;
  };
  let prevH = 0;
  let prevA = 0;
  const rows = periods.map((period) => {
    const end = endOf(period);
    const h = end?.homeScore ?? prevH;
    const a = end?.awayScore ?? prevA;
    const qh = h - prevH;
    const qa = a - prevA;
    prevH = h;
    prevA = a;
    return { period, qh, qa };
  });

  return (
    <section>
      <h2 className="text-[15px] font-semibold tracking-tight">
        Quarter by Quarter
      </h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[20rem] text-left text-[13px]">
          <thead>
            <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="py-2 pr-3 font-semibold">Team</th>
              {rows.map((r) => (
                <th
                  key={r.period}
                  className="px-2 py-2 font-semibold tabular-nums"
                >
                  {r.period <= 4 ? `Q${r.period}` : `OT${r.period - 4}`}
                </th>
              ))}
              <th className="px-2 py-2 font-semibold">Tot</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border/60">
              <td className="py-2 pr-3 font-medium">
                {artifact.summary.awayTricode ?? "Away"}
              </td>
              {rows.map((r) => (
                <td key={r.period} className="px-2 py-2 tabular-nums">
                  {r.qa}
                </td>
              ))}
              <td className="px-2 py-2 font-semibold tabular-nums">
                {artifact.summary.awayScore}
              </td>
            </tr>
            <tr>
              <td className="py-2 pr-3 font-medium">
                {artifact.summary.homeTricode ?? "Home"}
              </td>
              {rows.map((r) => (
                <td key={r.period} className="px-2 py-2 tabular-nums">
                  {r.qh}
                </td>
              ))}
              <td className="px-2 py-2 font-semibold tabular-nums">
                {artifact.summary.homeScore}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
