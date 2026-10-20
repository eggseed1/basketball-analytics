"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useLocale } from "next-intl";

import { LocalTipTime } from "@/components/sports/local-tip-time";
import { useScoreDelaySeconds } from "@/components/sports/use-score-delay";
import { AppLink } from "@/components/ui/app-link";
import { formatGameCalendarDate } from "@/i18n/format-date";
import { needsScoreMask } from "@/lib/score-delay";
import {
  opponentText,
  resultText,
  watchlistHeadline,
  watchlistInsights,
  type WatchGame,
  type WatchInsight,
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

function shortDate(iso: string, locale: string): string {
  return formatGameCalendarDate(iso, locale, "monthDay") ?? iso;
}

const TONE_CLASS = {
  neutral: "text-muted-foreground",
  alert: "text-[#b42828] dark:text-[#ff8a8a]",
  positive: "text-[color:var(--accent-positive)]",
  caution: "text-[#8a5a00] dark:text-[#f5c451]",
} as const;

const WEEK_MS = 6 * 24 * 60 * 60 * 1000;

function InsightRow({
  insight,
  fetchedAt,
  nextGame,
}: {
  insight: WatchInsight;
  fetchedAt: number;
  nextGame?: WatchGame | null;
}) {
  const locale = useLocale();
  const tone = insight.tone ?? "neutral";
  const body =
    insight.id === "next" && nextGame ? (
      <>
        Up next {opponentText(nextGame)},{" "}
        <LocalTipTime
          tipOffAt={nextGame.tipOffAt}
          style={
            nextGame.tipOffAt &&
            Number.isFinite(Date.parse(nextGame.tipOffAt)) &&
            Date.parse(nextGame.tipOffAt) - fetchedAt < WEEK_MS
              ? "dayClockZone"
              : "date"
          }
          nbaDate={nextGame.date}
          fallback={shortDate(nextGame.date, locale)}
        />
        {nextGame.gameType === "preseason" ? " (preseason)" : ""}
      </>
    ) : (
      insight.text
    );

  const className = cn(
    "block min-w-0 truncate rounded-md px-1.5 py-1 text-[12px] leading-snug transition-colors",
    TONE_CLASS[tone],
    insight.href && "hover:bg-background/70 hover:underline"
  );

  if (insight.href) {
    return (
      <AppLink href={insight.href} className={className} data-motion="row">
        {body}
      </AppLink>
    );
  }

  return (
    <span className={className} data-motion="row">
      {body}
    </span>
  );
}

/**
 * Expandable status for one pin. Collapsed = headline; open = full insight list.
 */
export function WatchlistItemStatus({
  status,
  fetchedAt,
  open,
}: {
  status: WatchStatus | undefined;
  fetchedAt: number;
  open?: boolean;
}) {
  const delaySeconds = useScoreDelaySeconds();
  const endedAt = status?.last?.endedAt ?? null;
  const shownAt = endedAt != null && delaySeconds > 0 ? endedAt + delaySeconds * 1000 : null;
  const [revealed, setRevealed] = useState<number | null>(null);
  useEffect(() => {
    if (shownAt == null) return;
    const timer = window.setTimeout(() => setRevealed(shownAt), Math.max(0, shownAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [shownAt]);

  if (!status) {
    return (
      <p className="truncate text-[12px] text-muted-foreground">Checking the board…</p>
    );
  }

  const last = status.last;
  const stillLive = shownAt != null && revealed !== shownAt && fetchedAt < shownAt;
  const masked =
    last != null &&
    delaySeconds > 0 &&
    endedAt == null &&
    needsScoreMask({ status: "final", tipOffAt: last.tipOffAt ?? undefined }, fetchedAt);

  let display: WatchStatus = status;
  if (stillLive && last && !status.live) {
    display = { ...status, live: last };
  } else if (masked && last) {
    display = {
      ...status,
      last: { ...last, teamScore: null, opponentScore: null },
    };
  }

  const headline = masked && last
    ? `Final ${opponentText(last)}, score delayed`
    : watchlistHeadline(display);
  const insights = watchlistInsights(display);

  if (!open) {
    return (
      <p
        className={cn(
          "min-w-0 truncate text-[12px] leading-snug",
          display.live || (display.kind === "player" && display.injury?.status === "out")
            ? "font-medium text-foreground"
            : "text-muted-foreground"
        )}
      >
        {headline}
      </p>
    );
  }

  return (
    <ul className="flex min-w-0 flex-col gap-0.5 pt-1">
      {insights.map((insight) => (
        <li key={insight.id}>
          <InsightRow
            insight={insight}
            fetchedAt={fetchedAt}
            nextGame={insight.id === "next" ? display.next : null}
          />
        </li>
      ))}
      {display.last && resultText(display.last) && display.kind === "team" && display.last.record ? (
        <li>
          <span className="block px-1.5 py-1 text-[12px] text-muted-foreground" data-motion="row">
            Record {display.last.record}
          </span>
        </li>
      ) : null}
    </ul>
  );
}

/** Chevron used by the pin summary. */
export function WatchlistExpandCue({ open }: { open: boolean }) {
  return (
    <ChevronDown
      aria-hidden
      className={cn(
        "size-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
        open && "rotate-180"
      )}
    />
  );
}
