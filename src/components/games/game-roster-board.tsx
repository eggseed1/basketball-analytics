"use client";

import { PlayerIdentity } from "@/components/players/player-identity";
import type { PlayerGame } from "@/data/types";
import { type } from "@/lib/design-system";
import { formatNumber, formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";

function tsOf(g: PlayerGame): number | null {
  if (g.trueShootingPct != null) return g.trueShootingPct;
  const denom = g.fieldGoalsAttempted + 0.44 * g.freeThrowsAttempted;
  if (g.points > 0 && denom > 0) return g.points / (2 * denom);
  return null;
}

function sortRoster(rows: PlayerGame[]) {
  return [...rows].sort((a, b) => {
    const aOut = a.didNotPlay ? 1 : 0;
    const bOut = b.didNotPlay ? 1 : 0;
    if (aOut !== bOut) return aOut - bOut;
    const aStart = a.startPosition?.trim() ? 0 : 1;
    const bStart = b.startPosition?.trim() ? 0 : 1;
    if (aStart !== bStart) return aStart - bStart;
    return (b.gameScore ?? b.points) - (a.gameScore ?? a.points);
  });
}

function RosterTable({
  label,
  players,
}: {
  label: string;
  players: PlayerGame[];
}) {
  const rows = sortRoster(players);
  if (!rows.length) {
    return (
      <p className={cn(type.bodySm, "text-muted-foreground")}>
        No {label} roster lines for this game.
      </p>
    );
  }

  return (
    <div className="board-scroll-host overflow-x-auto rounded-md">
      <table className="w-full min-w-[44rem] text-left">
        <thead
          className={cn(
            type.caption,
            "uppercase tracking-wide text-muted-foreground"
          )}
        >
          <tr className="border-b border-border/60">
            <th className="sticky left-0 z-10 bg-background/85 py-2 pr-3 font-semibold backdrop-blur-sm">
              {label}
            </th>
            <th className="px-2 py-2 text-right font-semibold">MIN</th>
            <th className="px-2 py-2 text-right font-semibold">PTS</th>
            <th className="px-2 py-2 text-right font-semibold">REB</th>
            <th className="px-2 py-2 text-right font-semibold">AST</th>
            <th className="px-2 py-2 text-right font-semibold">STL</th>
            <th className="px-2 py-2 text-right font-semibold">BLK</th>
            <th className="px-2 py-2 text-right font-semibold">TOV</th>
            <th className="px-2 py-2 text-right font-semibold">FG</th>
            <th className="px-2 py-2 text-right font-semibold">3P</th>
            <th className="px-2 py-2 text-right font-semibold">FT</th>
            <th className="px-2 py-2 text-right font-semibold">+/-</th>
            <th className="px-2 py-2 text-right font-semibold">TS%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((g) => {
            const out = Boolean(g.didNotPlay);
            const reason =
              g.statusReason?.trim() ||
              (out ? "Did not play" : null);
            return (
              <tr
                key={g.id}
                className={cn(
                  "border-b border-border/40",
                  out && "bg-destructive/[0.06]"
                )}
              >
                <td className="sticky left-0 z-10 bg-background/85 py-1.5 pr-3 backdrop-blur-sm">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <PlayerIdentity
                      playerId={g.playerId}
                      name={g.playerName ?? g.playerId}
                      season={g.season}
                      className={cn(
                        type.caption,
                        "font-semibold",
                        out && "text-muted-foreground"
                      )}
                    />
                    {g.startPosition?.trim() && !out ? (
                      <span
                        className={cn(
                          type.caption,
                          "rounded px-1 font-semibold text-muted-foreground"
                        )}
                      >
                        {g.startPosition}
                      </span>
                    ) : null}
                    {out ? (
                      <span
                        className={cn(
                          type.caption,
                          "rounded-md bg-destructive/15 px-1.5 py-0.5 font-bold uppercase tracking-wide text-destructive"
                        )}
                        title={reason ?? "Out"}
                      >
                        {reason && /injur/i.test(reason) ? "Injured" : "OUT"}
                        {reason && !/did not play/i.test(reason)
                          ? ` · ${reason}`
                          : ""}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td
                  className={cn(
                    type.caption,
                    "px-2 py-1.5 text-right tabular-nums",
                    out && "text-muted-foreground"
                  )}
                >
                  {out ? "—" : formatNumber(g.minutes, 1)}
                </td>
                <td className={cn(type.caption, "px-2 py-1.5 text-right tabular-nums")}>
                  {out ? "—" : g.points}
                </td>
                <td className={cn(type.caption, "px-2 py-1.5 text-right tabular-nums")}>
                  {out ? "—" : g.rebounds}
                </td>
                <td className={cn(type.caption, "px-2 py-1.5 text-right tabular-nums")}>
                  {out ? "—" : g.assists}
                </td>
                <td className={cn(type.caption, "px-2 py-1.5 text-right tabular-nums")}>
                  {out ? "—" : g.steals}
                </td>
                <td className={cn(type.caption, "px-2 py-1.5 text-right tabular-nums")}>
                  {out ? "—" : g.blocks}
                </td>
                <td className={cn(type.caption, "px-2 py-1.5 text-right tabular-nums")}>
                  {out ? "—" : g.turnovers}
                </td>
                <td className={cn(type.caption, "px-2 py-1.5 text-right tabular-nums")}>
                  {out
                    ? "—"
                    : `${g.fieldGoalsMade}-${g.fieldGoalsAttempted}`}
                </td>
                <td className={cn(type.caption, "px-2 py-1.5 text-right tabular-nums")}>
                  {out
                    ? "—"
                    : `${g.threePointersMade}-${g.threePointersAttempted}`}
                </td>
                <td className={cn(type.caption, "px-2 py-1.5 text-right tabular-nums")}>
                  {out
                    ? "—"
                    : `${g.freeThrowsMade}-${g.freeThrowsAttempted}`}
                </td>
                <td className={cn(type.caption, "px-2 py-1.5 text-right tabular-nums")}>
                  {out ? "—" : g.plusMinus}
                </td>
                <td className={cn(type.caption, "px-2 py-1.5 text-right tabular-nums")}>
                  {out ? "—" : (() => {
                    const ts = tsOf(g);
                    return ts != null ? formatPct(ts) : "—";
                  })()}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function GameRosterBoard({
  awayLabel,
  homeLabel,
  awayPlayers,
  homePlayers,
}: {
  awayLabel: string;
  homeLabel: string;
  awayPlayers: PlayerGame[];
  homePlayers: PlayerGame[];
}) {
  return (
    <div className="flex flex-col gap-5">
      <RosterTable label={awayLabel} players={awayPlayers} />
      <RosterTable label={homeLabel} players={homePlayers} />
    </div>
  );
}
