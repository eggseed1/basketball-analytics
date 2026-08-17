"use client";

import { useEffect, useState } from "react";

import {
  formatGameCountdown,
  type CountdownResult,
} from "@/lib/game-countdown";
import { cn } from "@/lib/utils";

/**
 * Exact countdown to a trusted tipOffAt timestamp.
 * Does not simulate the in-game basketball clock.
 */
export function GameCountdown({
  tipOffAt,
  className,
  absoluteClassName,
}: {
  tipOffAt?: string | null;
  className?: string;
  absoluteClassName?: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  const result: CountdownResult = formatGameCountdown(tipOffAt, now);

  useEffect(() => {
    if (!tipOffAt || result.phase === "invalid") return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [tipOffAt, result.phase]);

  if (result.phase === "invalid") {
    return (
      <span className={cn("text-[12px] text-muted-foreground", className)}>
        Tip-off TBD
      </span>
    );
  }

  return (
    <span className={cn("flex flex-col items-end gap-0.5 text-right", className)}>
      <span className="text-[12px] font-semibold tabular-nums tracking-tight">
        {result.primary}
      </span>
      {result.absoluteLocal && result.phase !== "tomorrow" ? (
        <span
          className={cn(
            "text-[11px] text-muted-foreground",
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
