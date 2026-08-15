"use client";

import { useEffect, useState } from "react";

import {
  freshnessBand,
  formatFreshnessLabel,
  type FreshnessBand,
} from "@/lib/live-refresh-policy";
import { cn } from "@/lib/utils";

/**
 * Subtle freshness line for live games — does not change canonical status.
 */
export function LiveFreshness({
  retrievedAt,
  className,
}: {
  retrievedAt?: string | null;
  className?: string;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 5_000);
    return () => window.clearInterval(id);
  }, []);

  const label = formatFreshnessLabel(retrievedAt, now);
  if (!label) return null;
  const band: FreshnessBand = freshnessBand(retrievedAt, now);

  return (
    <span
      className={cn(
        "text-[10px] tabular-nums text-muted-foreground",
        band === "stale" && "font-semibold",
        className
      )}
      title={
        band === "stale"
          ? "Provider feed has not updated recently — status still from last trusted snapshot"
          : undefined
      }
    >
      {band === "stale" ? `Updating… · ${label}` : label}
    </span>
  );
}
