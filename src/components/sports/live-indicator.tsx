"use client";

import { cn } from "@/lib/utils";

/**
 * Subtle live badge. Animation is presentation only - not freshness proof.
 */
export function LiveIndicator({
  label = "LIVE",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-foreground",
        className
      )}
      role="status"
      aria-label="Live"
    >
      <span
        className={cn(
          "relative inline-flex size-2 shrink-0 rounded-full bg-red-600",
          "motion-safe:after:absolute motion-safe:after:inset-0 motion-safe:after:animate-ping motion-safe:after:rounded-full motion-safe:after:bg-red-600/70",
          "motion-reduce:after:hidden"
        )}
        aria-hidden
      />
      {label}
    </span>
  );
}
