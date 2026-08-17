/**
 * Shared destination loading frame — same visual language as query-updating.
 * Used by route-level loading.tsx files (not a full-page spinner).
 */

import { cn } from "@/lib/utils";

export function DestinationLoadingFrame({
  title,
  subtitle,
  className,
}: {
  title: string;
  subtitle?: string;
  className?: string;
}) {
  return (
    <main
      className={cn(
        "site-shell flex flex-1 flex-col gap-6 py-6 sm:py-8",
        className
      )}
      aria-busy="true"
      aria-live="polite"
    >
      <div className="query-updating-bar rounded-full" />
      <div className="flex flex-col gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          Loading
        </p>
        <h1 className="text-[22px] font-bold tracking-tight sm:text-[26px]">
          {title}
        </h1>
        {subtitle ? (
          <p className="text-[14px] text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      <div className="grid gap-3">
        <div className="h-24 animate-pulse rounded-xl bg-black/[0.06]" />
        <div className="h-40 animate-pulse rounded-xl bg-black/[0.05]" />
        <div className="h-32 animate-pulse rounded-xl bg-black/[0.04]" />
      </div>
      <p className="sr-only">Loading {title}…</p>
    </main>
  );
}

/** Compact in-route skeleton (Suspense island), not a full-page swap. */
export function DestinationSectionSkeleton({
  label = "Loading analysis…",
}: {
  label?: string;
}) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-live="polite">
      <div className="query-updating-bar rounded-full" />
      <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="h-36 animate-pulse rounded-xl bg-black/[0.06]" />
      <div className="h-48 animate-pulse rounded-xl bg-black/[0.05]" />
      <p className="sr-only">{label}</p>
    </div>
  );
}
