"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { CLIENT_REFRESH_MS } from "@/data/providers/nba/cache-policy";

/**
 * Periodically refreshes the current RSC tree so season stats / games
 * pick up completed box scores without a manual reload.
 * Skips ticks while the tab is hidden to avoid wasted work.
 */
export function AutoRefresh({
  intervalMs = CLIENT_REFRESH_MS,
  label = "Auto-updating",
  /** When false, do not schedule refreshes (e.g. heavy explore pages). */
  enabled = true,
}: {
  intervalMs?: number;
  label?: string;
  enabled?: boolean;
}) {
  const router = useRouter();
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  useEffect(() => {
    if (!enabled || !(intervalMs > 0)) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      router.refresh();
      setLastRefresh(new Date());
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [enabled, intervalMs, router]);

  if (!enabled) return null;

  return (
    <p
      className="text-xs text-muted-foreground"
      aria-live="polite"
      title="Fetches fresh stats from stats.nba.com on a short interval"
    >
      {label}
      {lastRefresh
        ? ` · last refresh ${lastRefresh.toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          })}`
        : null}
      {" · "}
      every {Math.round(intervalMs / 60000)} min
    </p>
  );
}
