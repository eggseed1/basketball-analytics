"use client";

import { useSyncExternalStore, type ReactNode } from "react";

import { formatTipTime, LEAGUE_TIME_ZONE, tipCalendarDate, type TipTimeStyle } from "@/lib/tip-time";

const subscribe = () => () => {};
const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || LEAGUE_TIME_ZONE;
const leagueZone = () => LEAGUE_TIME_ZONE;

/**
 * The viewer's time zone after hydration, league time before it. Server HTML
 * and the hydration pass agree, then React re-renders with the browser zone.
 */
export function useViewerTimeZone(): string {
  return useSyncExternalStore(subscribe, browserZone, leagueZone);
}

export function LocalTipTime({
  tipOffAt,
  style,
  fallback = null,
  nbaDate,
  className,
}: {
  tipOffAt: string | null | undefined;
  style: TipTimeStyle;
  fallback?: ReactNode;
  /** The game's NBA (Eastern) day; a clock that lands on another local day names it. */
  nbaDate?: string | null;
  className?: string;
}) {
  const timeZone = useViewerTimeZone();
  const clock = formatTipTime(tipOffAt, style, timeZone);
  if (!clock) return <>{fallback}</>;
  const localDay = nbaDate ? tipCalendarDate(tipOffAt, timeZone) : null;
  const text =
    localDay && localDay !== nbaDate!.slice(0, 10)
      ? `${clock} (${formatTipTime(tipOffAt, "date", timeZone)!.split(",")[0]})`
      : clock;
  return (
    <time dateTime={tipOffAt ?? undefined} className={className}>
      {text}
    </time>
  );
}
