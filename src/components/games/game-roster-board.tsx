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

/** Mid-game, ESPN tags every unused bench player "coach's decision"; they can still check in. */
function notInYet(g: PlayerGame, live: boolean): boolean {
  if (!live || !g.didNotPlay) return false;
  const reason = g.statusReason?.trim() ?? "";
  return reason === "" || /coach|did not play|^dnp$/i.test(reason);
}

const COLUMNS = ["MIN", "PTS", "REB", "AST", "STL", "BLK", "TOV", "FG", "3P", "FT", "+/-", "TS%"];

function statCells(g: PlayerGame): string[] {
  const ts = tsOf(g);
  return [
    formatNumber(g.minutes, Number.isInteger(g.minutes) ? 0 : 1),
    String(g.points),
    String(g.rebounds),
    String(g.assists),
    String(g.steals),
    String(g.blocks),
    String(g.turnovers),
    `${g.fieldGoalsMade}-${g.fieldGoalsAttempted}`,
    `${g.threePointersMade}-${g.threePointersAttempted}`,
    `${g.freeThrowsMade}-${g.freeThrowsAttempted}`,
    g.plusMinus > 0 ? `+${g.plusMinus}` : String(g.plusMinus),
    ts != null ? formatPct(ts) : "—",
  ];
}

const NAME_SUFFIX = /^(jr\.?|sr\.?|ii|iii|iv|v)$/i;

/** "Karl-Anthony Towns" → "K. Towns", keeping suffixes and initial-style first names. */
function shortPlayerName(full: string): string {
  const parts = full.trim().split(/\s+/);
  if (parts.length < 2 || parts[0]!.includes(".")) return full;
  const rest = parts.slice(1);
  if (rest.every((p) => NAME_SUFFIX.test(p))) return full;
  return `${parts[0]![0]}. ${rest.join(" ")}`;
}

/** Player column width; the status note in out rows sticks just past it. */
const NAME_COL = "w-[10rem] min-w-[10rem] sm:w-[15rem] sm:min-w-[15rem]";
const NAME_STICKY =
  "sticky left-0 z-10 bg-background/95 backdrop-blur-md lg:bg-transparent lg:backdrop-blur-none";

function RosterTable({
  label,
  players,
  live,
  emptyText,
}: {
  label: string;
  players: PlayerGame[];
  live: boolean;
  emptyText?: string;
}) {
  const rows = sortRoster(players);
  if (!rows.length && !emptyText) {
    return (
      <p className={cn(type.bodySm, "text-muted-foreground")}>
        No {label} roster lines for this game.
      </p>
    );
  }

  return (
    <div className="board-scroll-host overflow-x-auto rounded-md">
      <table className="w-full min-w-[38rem] text-left sm:min-w-[46rem]">
        <thead
          className={cn(
            type.caption,
            "uppercase tracking-wide text-muted-foreground"
          )}
        >
          <tr className="border-b border-border/60">
            <th className={cn(NAME_COL, NAME_STICKY, "py-2 pl-2 pr-3 font-semibold")}>
              {label}
            </th>
            {COLUMNS.map((col) => (
              <th key={col} className="whitespace-nowrap px-2 py-2 text-right font-semibold">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {!rows.length ? (
            <tr className="border-b border-border/40">
              <td
                colSpan={COLUMNS.length + 1}
                className={cn(
                  type.caption,
                  "py-4 pl-2 pr-3 text-muted-foreground"
                )}
              >
                {emptyText}
              </td>
            </tr>
          ) : null}
          {rows.map((g) => {
            const pending = notInYet(g, live);
            const out = Boolean(g.didNotPlay);
            const reason =
              g.statusReason?.trim() ||
              (out ? "Did not play" : null);
            return (
              <tr key={g.id} className="border-b border-border/40">
                <td className={cn(NAME_COL, NAME_STICKY, "py-1 pl-2 pr-3")}>
                  <div className="flex min-w-0 max-w-[8.75rem] items-center gap-1.5 sm:max-w-[13.75rem]">
                    <PlayerIdentity
                      playerId={g.playerId}
                      name={g.playerName ?? g.playerId}
                      shortName={shortPlayerName(g.playerName ?? g.playerId)}
                      season={g.season}
                      variant="compact"
                      className={cn(
                        type.caption,
                        "min-w-0 font-semibold",
                        out && "text-muted-foreground"
                      )}
                    />
                    {g.startPosition?.trim() && !out ? (
                      <span
                        className={cn(
                          type.caption,
                          "shrink-0 font-semibold text-muted-foreground"
                        )}
                      >
                        {g.startPosition}
                      </span>
                    ) : null}
                  </div>
                </td>
                {out ? (
                  <td colSpan={COLUMNS.length} className="py-1 pl-2 pr-2">
                    <span
                      className={cn(
                        type.caption,
                        "sticky left-[10.5rem] inline-block max-w-[calc(100vw-15rem)] truncate rounded-md px-1.5 py-0.5 align-middle font-semibold sm:left-[15.5rem] sm:max-w-none",
                        pending
                          ? "bg-foreground/[0.06] text-muted-foreground"
                          : "bg-destructive/15 text-destructive"
                      )}
                      title={reason ?? "Out"}
                    >
                      {pending
                        ? "Not in yet"
                        : `${reason && /injur/i.test(reason) ? "Injured" : "OUT"}${
                            reason && !/did not play/i.test(reason) ? ` · ${reason}` : ""
                          }`}
                    </span>
                  </td>
                ) : (
                  statCells(g).map((value, i) => (
                    <td
                      key={COLUMNS[i]}
                      className={cn(type.caption, "whitespace-nowrap px-2 py-1 text-right tabular-nums")}
                    >
                      {value}
                    </td>
                  ))
                )}
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
  live = false,
  emptyText,
}: {
  awayLabel: string;
  homeLabel: string;
  awayPlayers: PlayerGame[];
  homePlayers: PlayerGame[];
  live?: boolean;
  /** Keeps the table frame with this note when a side has no lines yet. */
  emptyText?: string;
}) {
  return (
    <div className="flex flex-col gap-5">
      <RosterTable label={awayLabel} players={awayPlayers} live={live} emptyText={emptyText} />
      <RosterTable label={homeLabel} players={homePlayers} live={live} emptyText={emptyText} />
    </div>
  );
}
