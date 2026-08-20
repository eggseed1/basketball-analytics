"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";

import {
  HistoricalGameSurface,
  type RunWindow,
} from "@/components/history/historical-game-surface";
import type { HistoricalGameArtifact } from "@/data/history/types";
import {
  eventIndexForShotId,
  shotEventIdsForRun,
  shotIdForEventIndex,
} from "@/lib/shots/run-shot-link";
import { shotCoverage, type GameShotEvent } from "@/lib/shots/shot-events";

const CourtShotChart = dynamic(
  () =>
    import("@/components/shots/court-shot-chart").then((m) => m.CourtShotChart),
  {
    ssr: false,
    loading: () => (
      <div
        className="h-64 animate-pulse rounded-xl border border-border bg-secondary/40"
        aria-hidden
      />
    ),
  }
);

/**
 * Client bridge: Game Flow ↔ shot chart ↔ PBP — one rabbit hole.
 */
export function HistoricalGameExperience({
  artifact,
  shots,
  homeLabel,
  awayLabel,
}: {
  artifact: HistoricalGameArtifact;
  shots: GameShotEvent[];
  homeLabel: string;
  awayLabel: string;
}) {
  const [runEventIds, setRunEventIds] = useState<string[] | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedPbpIndex, setSelectedPbpIndex] = useState<number | null>(null);
  const [activeRun, setActiveRun] = useState<RunWindow | null>(null);
  const [pbpRunWindow, setPbpRunWindow] = useState<{
    startEventIndex: number;
    endEventIndex: number;
  } | null>(null);
  const coverage = useMemo(() => shotCoverage(shots), [shots]);
  const shotIndexSet = useMemo(
    () => new Set(shots.filter((s) => s.coordinateAvailable).map((s) => s.eventIndex)),
    [shots]
  );

  const scrollToPbp = () => {
    if (typeof document === "undefined") return;
    document
      .getElementById("historical-pbp")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const scrollToShots = () => {
    if (typeof document === "undefined") return;
    document
      .getElementById("historical-shots")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const onViewRun = (run: RunWindow) => {
    setActiveRun(run);
    setPbpRunWindow({
      startEventIndex: run.startEventIndex,
      endEventIndex: run.endEventIndex,
    });
    setSelectedPbpIndex(run.startEventIndex);
    scrollToPbp();
  };

  const onShowRunPlays = (run: RunWindow) => {
    setActiveRun(run);
    setPbpRunWindow({
      startEventIndex: run.startEventIndex,
      endEventIndex: run.endEventIndex,
    });
    setSelectedPbpIndex(run.startEventIndex);
    scrollToPbp();
  };

  const onShowRunShots = (run: RunWindow) => {
    const ids = shotEventIdsForRun(shots, run);
    setActiveRun(run);
    setRunEventIds(ids.length ? ids : null);
    setSelectedEventId(ids[0] ?? null);
    if (ids[0]) {
      setSelectedPbpIndex(eventIndexForShotId(shots, ids[0]));
    } else {
      setSelectedPbpIndex(run.startEventIndex);
    }
    scrollToShots();
  };

  const onSelectTimelinePoint = (point: {
    eventIndex?: number;
    scorerId?: string | null;
  }) => {
    if (point.eventIndex == null) return;
    setSelectedPbpIndex(point.eventIndex);
    const shotId = shotIdForEventIndex(shots, point.eventIndex);
    setSelectedEventId(shotId);
    scrollToPbp();
  };

  const onSelectShot = (shot: GameShotEvent | null) => {
    if (!shot) {
      setSelectedEventId(null);
      return;
    }
    setSelectedEventId(shot.eventId);
    setSelectedPbpIndex(shot.eventIndex);
  };

  const onViewPlayFromShot = (shot: GameShotEvent) => {
    setSelectedEventId(shot.eventId);
    setSelectedPbpIndex(shot.eventIndex);
    scrollToPbp();
  };

  const onSelectPbpEvent = (eventIndex: number, eventType: string) => {
    setSelectedPbpIndex(eventIndex);
    if (eventType === "MADE_SHOT" || eventType === "MISSED_SHOT") {
      const id = shotIdForEventIndex(shots, eventIndex);
      setSelectedEventId(id);
    }
  };

  const onShowOnCourt = (eventIndex: number) => {
    const id = shotIdForEventIndex(shots, eventIndex);
    setSelectedEventId(id);
    setSelectedPbpIndex(eventIndex);
    scrollToShots();
  };

  const clearRun = () => {
    setRunEventIds(null);
    setActiveRun(null);
    setPbpRunWindow(null);
  };

  return (
    <div className="flex flex-col gap-8">
      <HistoricalGameSurface
        artifact={artifact}
        onShowRunShots={onShowRunShots}
        onShowRunPlays={onShowRunPlays}
        onViewRun={onViewRun}
        onSelectTimelinePoint={onSelectTimelinePoint}
        onSelectPbpEvent={onSelectPbpEvent}
        onShowOnCourt={onShowOnCourt}
        selectedPbpIndex={selectedPbpIndex}
        activeRun={activeRun}
        pbpRunWindow={pbpRunWindow}
        hasShotForIndex={(idx) => shotIndexSet.has(idx)}
      />

      <div id="historical-shots">
        {shots.length > 0 ? (
          <CourtShotChart
            shots={shots}
            homeTeamId={artifact.summary.homeTeamId}
            awayTeamId={artifact.summary.awayTeamId}
            homeLabel={homeLabel}
            awayLabel={awayLabel}
            selectedRunEventIds={runEventIds}
            selectedEventId={selectedEventId}
            availability={coverage.completeness}
            onSelectShot={onSelectShot}
            onViewPlay={onViewPlayFromShot}
          />
        ) : artifact.summary.pbpAvailable ? (
          <div className="sports-card p-4 text-[13px] text-muted-foreground">
            Shot locations aren&apos;t available for this game.
          </div>
        ) : null}
      </div>

      {selectedEventId && shots.some((s) => s.eventId === selectedEventId) ? (
        <p className="text-[12px] text-muted-foreground">
          Shot selected.{" "}
          <button
            type="button"
            className="font-semibold underline-offset-4 hover:underline"
            onClick={() => {
              const idx = eventIndexForShotId(shots, selectedEventId);
              if (idx != null) {
                setSelectedPbpIndex(idx);
                scrollToPbp();
              }
            }}
          >
            VIEW PLAY
          </button>
        </p>
      ) : null}

      {runEventIds || pbpRunWindow ? (
        <p className="text-[12px] text-muted-foreground">
          {runEventIds
            ? `Showing ${runEventIds.length} scoring shot${
                runEventIds.length === 1 ? "" : "s"
              } from the selected run. `
            : "Play-by-play filtered to the selected run. "}
          <button
            type="button"
            className="font-semibold underline-offset-4 hover:underline"
            onClick={clearRun}
          >
            Clear run filter
          </button>
        </p>
      ) : null}
    </div>
  );
}
