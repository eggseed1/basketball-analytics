"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { PlayerHeadshot } from "@/components/brand/player-headshot";
import {
  HoverLinkContext,
  hoverLinkRowProps,
  useHoverLink,
} from "@/components/charts/hover-layer";
import { BoardPlayerName } from "@/lib/board-compact-name";
import { useChartTheme } from "@/lib/chart-theme";
import { type } from "@/lib/design-system";
import type { PlayerRaceRankEnd } from "@/lib/player-race-tracker";
import { cn } from "@/lib/utils";

export type VizLeaderRow = {
  playerId: string;
  displayName: string;
  teamId?: string;
  teamAbbr?: string;
  valueLabel: string;
  pinned?: boolean;
  onTeam?: boolean;
};

function leadersTitle(rankEnd: PlayerRaceRankEnd): string {
  if (rankEnd === "low") return "Lowest";
  if (rankEnd === "both") return "Both ends";
  return "Leaders";
}

export function VizChartWithLeaders({
  rankEnd,
  leaders,
  children,
  onTogglePin,
  hint = "Use the team dropdown or Pin above to highlight players, or click a name in the list.",
}: {
  rankEnd: PlayerRaceRankEnd;
  leaders: VizLeaderRow[];
  children: React.ReactNode;
  /** Toggle URL pin for this player. */
  onTogglePin?: (playerId: string) => void;
  hint?: string;
}) {
  const chartTheme = useChartTheme();
  const [leaderFilter, setLeaderFilter] = useState("");
  const hoverLink = useHoverLink();

  const filtered = useMemo(() => {
    const q = leaderFilter.trim().toLowerCase();
    if (!q) return leaders;
    return leaders.filter(
      (row) =>
        row.displayName.toLowerCase().includes(q) ||
        (row.teamAbbr ?? "").toLowerCase().includes(q) ||
        (row.teamId ?? "").toLowerCase().includes(q)
    );
  }, [leaderFilter, leaders]);

  const highlightedCount = leaders.filter(
    (row) => row.pinned || row.onTeam
  ).length;

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(200px,240px)]">
      <div className="min-w-0">
        <div className="mb-3 flex min-h-9 flex-wrap items-center gap-2">
          {highlightedCount ? (
            <p className={cn(type.caption, "text-muted-foreground")}>
              {highlightedCount} highlighted · click a list row to pin or unpin
            </p>
          ) : (
            <p className={cn(type.caption, "text-muted-foreground")}>{hint}</p>
          )}
        </div>
        <HoverLinkContext.Provider value={hoverLink}>{children}</HoverLinkContext.Provider>
      </div>

      <aside className="sports-card flex max-h-[min(560px,70vh)] flex-col overflow-hidden p-3 md:sticky md:top-20">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className={cn(type.bodySm, "font-bold")}>
            {leadersTitle(rankEnd)}
          </h2>
          <span className={cn(type.caption, "text-muted-foreground")}>
            {filtered.length}
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
          {filtered.map((player, index) => {
            const selected = Boolean(player.pinned || player.onTeam);
            const { color } = chartTheme.leagueTeamColor(
              player.teamId ?? player.teamAbbr
            );
            return (
              <li key={player.playerId} {...hoverLinkRowProps(hoverLink, player.playerId)}>
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
                    onClick={() => onTogglePin?.(player.playerId)}
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
                      name={player.displayName}
                      teamKey={player.teamId ?? player.teamAbbr}
                      size="xs"
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(type.caption, "block font-semibold")}
                      >
                        <BoardPlayerName name={player.displayName} />
                        {player.pinned ? (
                          <span className="ml-1 text-primary">· pin</span>
                        ) : null}
                        {player.onTeam ? (
                          <span className="ml-1 text-primary">· team</span>
                        ) : null}
                      </span>
                      <span
                        className={cn(type.caption, "text-muted-foreground")}
                      >
                        {player.teamAbbr ?? player.teamId ?? "—"}
                      </span>
                    </span>
                    <span
                      className={cn(
                        type.caption,
                        "shrink-0 tabular-nums font-bold"
                      )}
                    >
                      {player.valueLabel}
                    </span>
                  </button>
                  <Link
                    href={`/players/${encodeURIComponent(player.playerId)}`}
                    className={cn(
                      type.caption,
                      "shrink-0 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    )}
                    title={`Open ${player.displayName}`}
                  >
                    →
                  </Link>
                  {player.pinned && onTogglePin ? (
                    <button
                      type="button"
                      onClick={() => onTogglePin(player.playerId)}
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
  );
}
