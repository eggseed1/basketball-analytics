"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useDeferredValue, useMemo, useState } from "react";

import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { TeamLogo } from "@/components/brand/team-logo";
import type { PlayerRaceTrackerPayload } from "@/data/queries/player-race-tracker";
import { useChartTheme } from "@/lib/chart-theme";
import { BoardPlayerName } from "@/lib/board-compact-name";
import { type } from "@/lib/design-system";
import {
  buildPlayerRaceChartRows,
  formatPlayerRaceValue,
  getPlayerRaceMetricDef,
  playerRaceModeLabel,
  playerRaceYAxisDomain,
  type PlayerRaceRankEnd,
  type PlayerRaceWindow,
} from "@/lib/player-race-tracker";
import { playerMatchesAnyVizTeam } from "@/lib/viz-team-highlight";
import { cn } from "@/lib/utils";

const WINDOW_OPTIONS: { id: PlayerRaceWindow; label: string }[] = [
  { id: 7, label: "7" },
  { id: 14, label: "14" },
  { id: 30, label: "30" },
  { id: 60, label: "60" },
  { id: "all", label: "All" },
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

const PlayerRaceTrackerChart = dynamic(
  () =>
    import("@/components/explore/player-race-tracker-chart").then((m) => ({
      default: m.PlayerRaceTrackerChart,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="h-[min(420px,58vw)] min-h-[280px] animate-pulse rounded-lg bg-secondary/40" />
    ),
  }
);

function parsePinIds(raw: string | null): string[] {
  if (!raw) return [];
  return [
    ...new Set(
      raw
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
    ),
  ].slice(0, 20);
}

export function PlayerRaceTrackerView({
  payload,
  seasonOptions,
}: {
  payload: PlayerRaceTrackerPayload;
  seasonOptions: string[];
}) {
  const chartTheme = useChartTheme();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [chartWindow, setChartWindow] = useState<PlayerRaceWindow>("all");
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(
    () => new Set()
  );
  const [leaderFilter, setLeaderFilter] = useState("");

  const pinIds = useMemo(
    () => parsePinIds(searchParams.get("pin")),
    [searchParams]
  );

  const teamKeys = payload.teamKeys ?? [];

  const deferredPlayers = useDeferredValue(payload.players);

  const teamPlayerIds = useMemo(() => {
    if (!teamKeys.length) return new Set<string>();
    return new Set(
      deferredPlayers
        .filter((player) => playerMatchesAnyVizTeam(player, teamKeys))
        .map((player) => player.playerId)
    );
  }, [deferredPlayers, teamKeys]);

  const effectiveSelectedIds = useMemo(() => {
    if (!teamPlayerIds.size) return selectedPlayerIds;
    const next = new Set(selectedPlayerIds);
    for (const id of teamPlayerIds) next.add(id);
    return next;
  }, [selectedPlayerIds, teamPlayerIds]);

  const chartRows = useMemo(
    () => buildPlayerRaceChartRows(deferredPlayers, chartWindow),
    [deferredPlayers, chartWindow]
  );

  const yDomain = useMemo(
    () =>
      playerRaceYAxisDomain(
        chartRows,
        deferredPlayers.map((player) => player.playerId),
        payload.metric
      ),
    [chartRows, payload.metric, deferredPlayers]
  );

  const filteredLeaders = useMemo(() => {
    const q = leaderFilter.trim().toLowerCase();
    if (!q) return deferredPlayers;
    return deferredPlayers.filter(
      (player) =>
        player.displayName.toLowerCase().includes(q) ||
        player.teamAbbr.toLowerCase().includes(q) ||
        player.shortName.toLowerCase().includes(q)
    );
  }, [leaderFilter, deferredPlayers]);

  const togglePlayer = useCallback((playerId: string) => {
    setSelectedPlayerIds((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedPlayerIds(new Set());
  }, []);

  const unpinPlayer = (playerId: string) => {
    const player = payload.players.find((row) => row.playerId === playerId);
    const next = pinIds.filter(
      (id) =>
        id !== playerId &&
        id !== player?.nbaId &&
        id !== player?.espnId
    );
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", "race");
    if (next.length) params.set("pin", next.join(","));
    else params.delete("pin");
    router.push(`/explore/players/visualizations?${params.toString()}`);
  };

  const rankEnd: PlayerRaceRankEnd = payload.rankEnd;

  if (payload.players.every((player) => player.points.length === 0)) {
    return (
      <div className="sports-card px-4 py-10 text-center">
        <p className={cn(type.bodySm, "text-muted-foreground")}>
          {payload.warning ??
            `No baked game logs for ${payload.metricLabel.toLowerCase()} leaders in ${payload.requestedSeason}.`}
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
                  href={`/explore/players/visualizations?view=race&season=${encodeURIComponent(season)}&metric=${encodeURIComponent(payload.metric)}`}
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
      <p className={cn(type.caption, "text-muted-foreground")}>
        {payload.players.length} players ·{" "}
        {playerRaceModeLabel(payload.metric)}{" "}
        {payload.metricLabel.toLowerCase()}
        {getPlayerRaceMetricDef(payload.metric).description
          ? ` · ${getPlayerRaceMetricDef(payload.metric).description}`
          : ""}
      </p>

      {payload.warning ? (
        <p className={cn(type.caption, "text-muted-foreground")}>
          {payload.warning}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
        <div className="sports-card overflow-hidden p-3 sm:p-4">
          <div className="mb-3 flex min-h-9 flex-wrap items-center gap-2">
            {effectiveSelectedIds.size ? (
              <>
                {selectedPlayerIds.size ? (
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
                ) : null}
                {teamKeys.length ? (
                  <span
                    className={cn(
                      type.caption,
                      "inline-flex items-center gap-1.5 rounded-md border frost-surface px-2 py-1 font-semibold"
                    )}
                  >
                    {teamKeys.length === 1 ? (
                      <TeamLogo teamKey={teamKeys[0]} size="xs" />
                    ) : null}
                    {teamKeys.length === 1
                      ? `${teamKeys[0]} roster`
                      : `${teamKeys.join(" · ")}`}{" "}
                    · {teamPlayerIds.size}
                  </span>
                ) : null}
                {[...effectiveSelectedIds]
                  .filter((playerId) => !teamPlayerIds.has(playerId))
                  .map((playerId) => {
                  const player = deferredPlayers.find(
                    (row) => row.playerId === playerId
                  );
                  if (!player) return null;
                  const { color } = chartTheme.teamColor(player.teamId);
                  return (
                    <button
                      key={playerId}
                      type="button"
                      onClick={() => togglePlayer(playerId)}
                      className={cn(
                        type.caption,
                        "inline-flex items-center gap-1.5 rounded-md border frost-surface px-2 py-1 font-semibold"
                      )}
                      style={{ borderColor: color }}
                    >
                      <TeamLogo teamKey={player.teamId} size="xs" />
                      {player.shortName}{" "}
                      {formatPlayerRaceValue(player.currentValue, payload.metric)}
                      <span aria-hidden className="text-muted-foreground">
                        ×
                      </span>
                    </button>
                  );
                })}
              </>
            ) : (
              <p className={cn(type.caption, "text-muted-foreground")}>
                Click a line or the side list to highlight players. Use the team
                dropdown or Pin above to focus a roster.
              </p>
            )}
          </div>

          <div className="rounded-lg bg-secondary/35 p-1 dark:bg-black/25">
            <PlayerRaceTrackerChart
              rows={chartRows}
              players={deferredPlayers}
              selectedPlayerIds={effectiveSelectedIds}
              onSelectPlayer={togglePlayer}
              yDomain={yDomain}
              metric={payload.metric}
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
                active={chartWindow === option.id}
                onClick={() => setChartWindow(option.id)}
              >
                {option.label}
              </Chip>
            ))}
          </div>
        </div>

        <aside className="sports-card flex max-h-[min(560px,70vh)] flex-col overflow-hidden p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className={cn(type.bodySm, "font-bold")}>
              {rankEnd === "low"
                ? "Lowest"
                : rankEnd === "both"
                  ? "Both ends"
                  : "Leaders"}
            </h2>
            <span className={cn(type.caption, "text-muted-foreground")}>
              {filteredLeaders.length}
            </span>
          </div>
          <input
            value={leaderFilter}
            onChange={(event) => setLeaderFilter(event.target.value)}
            placeholder="Filter list…"
            className={cn(
              type.caption,
              "mb-2 w-full rounded-md border border-border/70 frost-surface px-2 py-1.5 font-semibold"
            )}
          />
          <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-1">
            {filteredLeaders.map((player, index) => {
              const selected = effectiveSelectedIds.has(player.playerId);
              const onTeam = teamPlayerIds.has(player.playerId);
              const pinned =
                pinIds.includes(player.playerId) ||
                (player.nbaId != null && pinIds.includes(player.nbaId)) ||
                (player.espnId != null && pinIds.includes(player.espnId));
              const { color } = chartTheme.teamColor(player.teamId);
              const hrefId =
                player.espnId ?? player.nbaId ?? player.playerId;
              return (
                <li key={player.playerId}>
                  <div
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md border px-2 py-1.5 transition-colors",
                      selected
                        ? "border-primary/40 bg-primary/10"
                        : "border-transparent hover:bg-secondary/60"
                    )}
                    style={selected ? { borderColor: color } : undefined}
                  >
                    <button
                      type="button"
                      aria-pressed={selected}
                      onClick={() => togglePlayer(player.playerId)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: color }}
                        aria-hidden
                      />
                      <span
                        className={cn(
                          type.caption,
                          "w-5 shrink-0 tabular-nums text-muted-foreground"
                        )}
                      >
                        {index + 1}
                      </span>
                      <PlayerHeadshot
                        playerId={player.playerId}
                        espnId={player.espnId}
                        nbaId={player.nbaId}
                        name={player.displayName}
                        teamKey={player.teamId}
                        size="xs"
                      />
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            type.caption,
                            "block font-semibold"
                          )}
                        >
                          <BoardPlayerName name={player.displayName} />
                          {pinned ? (
                            <span className="ml-1 text-primary">· pin</span>
                          ) : null}
                          {onTeam ? (
                            <span className="ml-1 text-primary">· team</span>
                          ) : null}
                        </span>
                        <span
                          className={cn(
                            type.caption,
                            "text-muted-foreground"
                          )}
                        >
                          {player.teamAbbr}
                        </span>
                      </span>
                      <span
                        className={cn(
                          type.caption,
                          "shrink-0 tabular-nums font-bold"
                        )}
                      >
                        {formatPlayerRaceValue(
                          player.currentValue,
                          payload.metric
                        )}
                      </span>
                    </button>
                    <Link
                      href={`/players/${encodeURIComponent(hrefId)}`}
                      className={cn(
                        type.caption,
                        "shrink-0 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                      )}
                      title={`Open ${player.displayName}`}
                    >
                      →
                    </Link>
                    {pinned ? (
                      <button
                        type="button"
                        onClick={() => unpinPlayer(player.playerId)}
                        className={cn(
                          type.caption,
                          "shrink-0 text-muted-foreground hover:text-foreground"
                        )}
                        aria-label={`Unpin ${player.displayName}`}
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </aside>
      </div>
    </div>
  );
}
