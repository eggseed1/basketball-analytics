"use client";

import { useEffect, useMemo, useState } from "react";

import { LocalTipTime } from "@/components/sports/local-tip-time";
import { useScoreDelaySeconds } from "@/components/sports/use-score-delay";
import { AppLink } from "@/components/ui/app-link";
import { needsScoreMask } from "@/lib/score-delay";
import {
  drblText,
  opponentText,
  playerLineText,
  resultText,
  trendText,
  type WatchGame,
  type WatchStatus,
} from "@/lib/watchlist-status";
import { cn } from "@/lib/utils";

const REFRESH_MS = 2 * 60 * 1000;

type Pinned = { kind: "player" | "team"; id: string };

export type WatchStatusState = {
  byKey: Map<string, WatchStatus>;
  fetchedAt: number;
};

/** Live status for pinned items, refreshed every two minutes while the tab is visible. */
export function useWatchlistStatus(items: readonly Pinned[], ready: boolean): WatchStatusState | null {
  const query = useMemo(() => {
    const players = items.filter((i) => i.kind === "player").map((i) => i.id);
    const teams = items.filter((i) => i.kind === "team").map((i) => i.id);
    if (!players.length && !teams.length) return null;
    const params = new URLSearchParams();
    if (players.length) params.set("players", players.join(","));
    if (teams.length) params.set("teams", teams.join(","));
    return params.toString();
  }, [items]);
  const [state, setState] = useState<WatchStatusState | null>(null);

  useEffect(() => {
    if (!ready || !query) return;
    let ctrl: AbortController | null = null;
    const load = async () => {
      if (document.visibilityState !== "visible") return;
      ctrl?.abort();
      ctrl = new AbortController();
      try {
        const res = await fetch(`/api/watchlist?${query}`, { signal: ctrl.signal });
        if (!res.ok) return;
        const json = (await res.json()) as { items?: WatchStatus[] };
        const byKey = new Map((json.items ?? []).map((s) => [`${s.kind}:${s.id}`, s] as const));
        setState({ byKey, fetchedAt: Date.now() });
      } catch {
        // Keep the last good status; the next tick retries.
      }
    };
    void load();
    const timer = window.setInterval(load, REFRESH_MS);
    document.addEventListener("visibilitychange", load);
    return () => {
      ctrl?.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
    };
  }, [ready, query]);

  return state;
}

function shortDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

const INJURY_STYLE = {
  out: "bg-[color-mix(in_oklab,#d93f3f_14%,transparent)] text-[#b42828] dark:text-[#ff8a8a]",
  "day-to-day": "bg-[color-mix(in_oklab,#e3a008_16%,transparent)] text-[#8a5a00] dark:text-[#f5c451]",
  other: "bg-secondary text-muted-foreground",
} as const;

const WEEK_MS = 6 * 24 * 60 * 60 * 1000;

function GameLink({ game, children }: { game: WatchGame; children: React.ReactNode }) {
  return (
    <AppLink href={`/games/${game.gameId}`} className="min-w-0 truncate underline-offset-2 hover:text-foreground hover:underline">
      {children}
    </AppLink>
  );
}

function LastLine({
  game,
  line,
  masked,
}: {
  game: WatchGame;
  line: string | null;
  masked: boolean;
}) {
  const result = masked ? `Final ${opponentText(game)}, score delayed` : resultText(game);
  const when = `${shortDate(game.date)}${game.gameType === "preseason" ? " preseason" : ""}`;
  return (
    <GameLink game={game}>
      {when}: {line && !masked ? `${line} · ` : ""}
      {result}
    </GameLink>
  );
}

function NextLine({ game, fetchedAt }: { game: WatchGame; fetchedAt: number }) {
  const tip = game.tipOffAt ? Date.parse(game.tipOffAt) : Number.NaN;
  const soon = Number.isFinite(tip) && tip - fetchedAt < WEEK_MS;
  return (
    <GameLink game={game}>
      Next {opponentText(game)},{" "}
      <LocalTipTime
        tipOffAt={game.tipOffAt}
        style={soon ? "dayClockZone" : "date"}
        nbaDate={soon ? game.date : null}
        fallback={shortDate(game.date)}
      />
      {game.gameType === "preseason" ? " (preseason)" : ""}
    </GameLink>
  );
}

export function WatchlistItemStatus({
  status,
  fetchedAt,
}: {
  status: WatchStatus | undefined;
  fetchedAt: number;
}) {
  const delaySeconds = useScoreDelaySeconds();
  if (!status) return null;
  const player = status.kind === "player" ? status : null;
  const last = status.last;
  const masked =
    last != null &&
    delaySeconds > 0 &&
    needsScoreMask({ status: "final", tipOffAt: last.tipOffAt ?? undefined }, fetchedAt);
  const line = player?.line && player.line.gameId === last?.gameId ? playerLineText(player.line) : null;
  const notes = [player?.trend ? trendText(player.trend) : null, player?.drbl ? drblText(player.drbl) : null].filter(
    (n): n is string => n != null
  );
  const empty = !status.live && !last && !status.next;

  return (
    <div className="flex min-w-0 flex-col gap-0.5 text-[12px] leading-snug text-muted-foreground">
      {player?.injury ? (
        <span className="flex min-w-0 items-center gap-1.5">
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none",
              INJURY_STYLE[player.injury.status]
            )}
          >
            {player.injury.status === "day-to-day" ? "Day-to-day" : player.injury.statusLabel}
          </span>
          {player.injury.injury ? <span className="truncate">{player.injury.injury}</span> : null}
        </span>
      ) : null}
      {status.live ? (
        <GameLink game={status.live}>
          <span className="font-semibold text-foreground">Live</span> {opponentText(status.live)}
        </GameLink>
      ) : last ? (
        <LastLine game={last} line={line} masked={masked} />
      ) : null}
      {status.next && !status.live ? <NextLine game={status.next} fetchedAt={fetchedAt} /> : null}
      {empty ? <span>No games on the schedule yet.</span> : null}
      {notes.map((n) => (
        <span key={n} className="truncate">
          {n}
        </span>
      ))}
    </div>
  );
}
