"use client";

import { useEffect, useRef, useState } from "react";

import {
  formatGameCountdown,
  type CountdownResult,
} from "@/lib/game-countdown";
import { cn } from "@/lib/utils";
import { useViewerTimeZone } from "@/components/sports/local-tip-time";

const HOUR_MS = 60 * 60 * 1000;

/**
 * Exact countdown to a trusted tipOffAt timestamp.
 * Does not simulate the in-game basketball clock.
 */
export function GameCountdown({
  tipOffAt,
  className,
  absoluteClassName,
  variant = "stack",
}: {
  tipOffAt?: string | null;
  className?: string;
  absoluteClassName?: string;
  variant?: "stack" | "line";
}) {
  const rootRef = useRef<HTMLSpanElement>(null);
  // null until mount so SSR HTML matches the first client pass (no clock skew).
  const [now, setNow] = useState<number | null>(null);
  const [visible, setVisible] = useState(true);
  const timeZone = useViewerTimeZone();

  useEffect(() => {
    setNow(Date.now());
  }, []);

  const result: CountdownResult | null =
    now == null ? null : formatGameCountdown(tipOffAt, now, timeZone);
  const needsTick =
    Boolean(tipOffAt) &&
    result != null &&
    result.phase !== "invalid" &&
    result.msRemaining > 0 &&
    result.msRemaining <= 24 * HOUR_MS;

  useEffect(() => {
    const el = rootRef.current;
    if (!el || !needsTick) return;
    const io = new IntersectionObserver(
      ([entry]) => setVisible(Boolean(entry?.isIntersecting)),
      { rootMargin: "160px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [needsTick]);

  const tickFast = Boolean(needsTick && result && result.msRemaining < HOUR_MS);

  useEffect(() => {
    if (!needsTick || !visible) return;
    const intervalMs = tickFast ? 1000 : 30_000;
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [needsTick, visible, tickFast]);

  if (now == null || result == null) {
    return (
      <span
        ref={rootRef}
        className={cn("text-[12px] text-muted-foreground", className)}
        aria-hidden
      />
    );
  }

  if (result.phase === "invalid") {
    return (
      <span
        ref={rootRef}
        className={cn("text-[12px] text-muted-foreground", className)}
      >
        Tip-off TBD
      </span>
    );
  }

  if (variant === "line") {
    return (
      <span
        ref={rootRef}
        className={cn("text-[12px] text-muted-foreground", className)}
      >
        {result.primary}
      </span>
    );
  }

  return (
    <span
      ref={rootRef}
      className={cn("flex flex-col items-end gap-0.5 text-right", className)}
    >
      <span className="text-[12px] font-semibold tabular-nums tracking-tight">
        {result.primary}
      </span>
      {result.absoluteLocal && result.phase !== "tomorrow" ? (
        <span
          className={cn(
            "text-[12px] text-muted-foreground",
            absoluteClassName
          )}
        >
          {result.absoluteLocal}
        </span>
      ) : null}
      {result.phase === "start_passed" ? (
        <span className="text-[10px] text-muted-foreground">
          Waiting for provider live status
        </span>
      ) : null}
    </span>
  );
}
