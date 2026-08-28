"use client";

import dynamic from "next/dynamic";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { TeamLogo } from "@/components/brand/team-logo";
import type { StandingsTrackerPayload } from "@/data/queries/standings-tracker";
import {
  buildStandingsTrackerChartRows,
  filterTrackerTeamsByConference,
  trackerYAxisDomain,
  type StandingsTrackerWindow,
} from "@/lib/standings-tracker";
import { useChartTheme } from "@/lib/chart-theme";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

const WINDOW_OPTIONS: { id: StandingsTrackerWindow; label: string }[] = [
  { id: 7, label: "7" },
  { id: 14, label: "14" },
  { id: 30, label: "30" },
  { id: 60, label: "60" },
  { id: "all", label: "All" },
];

const CONFERENCE_OPTIONS = [
  { id: "East" as const, label: "East" },
  { id: "West" as const, label: "West" },
  { id: "All" as const, label: "All" },
];

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        type.caption,
        "glass-pill rounded-md px-2.5 py-1 font-semibold transition-colors",
        active
          ? "glass-pill-active"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

function diffLabel(diff: number) {
  return diff > 0 ? `+${diff}` : `${diff}`;
}

const StandingsTrackerChart = dynamic(
  () =>
    import("@/components/standings/standings-tracker-chart").then((m) => ({
      default: m.StandingsTrackerChart,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="h-[min(420px,58vw)] min-h-[280px] animate-pulse rounded-lg bg-secondary/40" />
    ),
  }
);

export function StandingsTrackerView({
  payload,
  seasonOptions,
}: {
  payload: StandingsTrackerPayload;
  seasonOptions: string[];
}) {
  const chartTheme = useChartTheme();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [conference, setConference] = useState<"East" | "West" | "All">("All");
  const [window, setWindow] = useState<StandingsTrackerWindow>("all");
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<string>>(
    () => new Set()
  );

  const visibleTeams = useMemo(
    () => filterTrackerTeamsByConference(payload.teams, conference),
    [conference, payload.teams]
  );

  const chartRows = useMemo(
    () => buildStandingsTrackerChartRows(visibleTeams, window),
    [visibleTeams, window]
  );

  const yDomain = useMemo(
    () =>
      trackerYAxisDomain(
        chartRows,
        visibleTeams.map((team) => team.teamId)
      ),
    [chartRows, visibleTeams]
  );

  const toggleTeam = useCallback((teamId: string) => {
    setSelectedTeamIds((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedTeamIds(new Set());
  }, []);

  const setSeason = (season: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", "tracker");
    params.set("season", season);
    router.push(`/standings?${params.toString()}`);
  };

  if (payload.teams.every((team) => team.points.length === 0)) {
    return (
      <div className="sports-card px-4 py-10 text-center">
        <p className={cn(type.bodySm, "text-muted-foreground")}>
          {payload.warning ??
            `No completed regular-season games for ${payload.requestedSeason} yet.`}
        </p>
        {seasonOptions.length > 1 ? (
          <p className={cn(type.caption, "mt-2 text-muted-foreground")}>
            Try{" "}
            {seasonOptions
              .filter((season) => season !== payload.requestedSeason)
              .slice(0, 2)
              .map((season) => (
                <Link
                  key={season}
                  href={`/standings?view=tracker&season=${encodeURIComponent(season)}`}
                  className="font-semibold underline"
                >
                  {season}
                </Link>
              ))
              .reduce<React.ReactNode[]>(
                (acc, node, index) =>
                  index === 0 ? [node] : [...acc, " or ", node],
                []
              )}
            .
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className={cn(type.caption, "sr-only")} htmlFor="tracker-season">
            Season
          </label>
          <select
            id="tracker-season"
            value={payload.requestedSeason}
            onChange={(event) => setSeason(event.target.value)}
            className={cn(
              type.bodySm,
              "rounded-md border border-border/70 frost-surface px-3 py-1.5 font-semibold dark:bg-white/10"
            )}
          >
            {seasonOptions.map((season) => (
              <option key={season} value={season}>
                {season} season
              </option>
            ))}
          </select>
          <div
            className="flex flex-wrap gap-1.5"
            role="group"
            aria-label="Conference filter"
          >
            {CONFERENCE_OPTIONS.map((option) => (
              <Chip
                key={option.id}
                active={conference === option.id}
                onClick={() => setConference(option.id)}
              >
                {option.label}
              </Chip>
            ))}
          </div>
        </div>
        <p className={cn(type.caption, "text-muted-foreground")}>
          {payload.gameCount.toLocaleString()} regular-season games · higher =
          more games above .500
        </p>
      </div>

      {payload.season !== payload.requestedSeason ? (
        <p className={cn(type.caption, "text-muted-foreground")}>
          Showing {payload.season} tracker — {payload.requestedSeason} board
          data was unavailable.
        </p>
      ) : null}

      <div className="sports-card overflow-hidden p-3 sm:p-4">
        <div className="mb-3 flex min-h-9 flex-wrap items-center gap-2">
          {selectedTeamIds.size ? (
            <>
              <button
                type="button"
                onClick={clearSelection}
                className={cn(
                  type.caption,
                  "rounded-md border border-primary/40 px-2.5 py-1 font-semibold text-primary"
                )}
              >
                Clear
              </button>
              {[...selectedTeamIds].map((teamId) => {
                const team = payload.teams.find((row) => row.teamId === teamId);
                if (!team) return null;
                const { color } = chartTheme.teamColor(teamId);
                return (
                  <button
                    key={teamId}
                    type="button"
                    onClick={() => toggleTeam(teamId)}
                    className={cn(
                      type.caption,
                      "inline-flex items-center gap-1.5 rounded-md border frost-surface px-2 py-1 font-semibold dark:bg-white/10"
                    )}
                    style={{ borderColor: color }}
                  >
                    <TeamLogo teamKey={teamId} size="xs" />
                    {team.abbreviation} {diffLabel(team.currentDiff)}
                    <span aria-hidden className="text-muted-foreground">
                      ×
                    </span>
                  </button>
                );
              })}
            </>
          ) : (
            <p className={cn(type.caption, "text-muted-foreground")}>
              Click a line or use the picker below to highlight teams.
            </p>
          )}
        </div>

        <div className="rounded-lg bg-secondary/35 p-1 dark:bg-black/25">
          <StandingsTrackerChart
            rows={chartRows}
            teams={visibleTeams}
            selectedTeamIds={selectedTeamIds}
            onSelectTeam={toggleTeam}
            yDomain={yDomain}
          />
        </div>

        <div
          className="mx-auto mt-3 flex w-fit flex-wrap justify-center gap-1 rounded-full border border-border/70 bg-background/80 px-2 py-1 backdrop-blur-sm"
          role="group"
          aria-label="Chart time window"
        >
          {WINDOW_OPTIONS.map((option) => (
            <Chip
              key={String(option.id)}
              active={window === option.id}
              onClick={() => setWindow(option.id)}
            >
              {option.label}
            </Chip>
          ))}
        </div>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className={cn(type.bodySm, "font-bold")}>Quick pick</h2>
        <div className="flex flex-wrap gap-1.5">
          {visibleTeams.slice(0, 30).map((team) => {
            const selected = selectedTeamIds.has(team.teamId);
            return (
              <button
                key={team.teamId}
                type="button"
                aria-pressed={selected}
                onClick={() => toggleTeam(team.teamId)}
                className={cn(
                  type.caption,
                  "inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 font-semibold transition-colors",
                  selected
                    ? "bg-primary/10 text-primary"
                    : "frost-surface-soft text-foreground frost-surface-hover dark:bg-white/10"
                )}
              >
                <TeamLogo teamKey={team.teamId} size="xs" />
                {team.abbreviation}
                <span className="tabular-nums text-muted-foreground">
                  {diffLabel(team.currentDiff)}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
