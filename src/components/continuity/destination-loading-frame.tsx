/**
 * Shared destination loading frame - same visual language as query-updating.
 * Used by route-level loading.tsx files (not a full-page spinner).
 */

import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

import { LoadingBarSignal } from "@/components/continuity/viewport-loading-bar";
import { PageHeader } from "@/components/layout/page-header";
import { cn } from "@/lib/utils";

/** Theme-aware skeleton block with a sweeping highlight. */
export function SkeletonBlock({ className }: { className?: string }) {
  return <span aria-hidden className={cn("loading-shimmer block rounded-xl", className)} />;
}

/** Spinner plus label, so a skeleton reads as loading rather than empty. */
export function LoadingStatus({ children }: { children: ReactNode }) {
  return (
    <p className="inline-flex items-center gap-2 text-[14px] font-semibold text-muted-foreground">
      <Loader2 aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
      {children}
    </p>
  );
}

/** Lights the viewport-wide progress line while this loading frame is up. */
export function LoadingTopBar() {
  return <LoadingBarSignal />;
}

export function DestinationLoadingFrame({
  eyebrow,
  title,
  subtitle,
  className,
  children,
}: {
  /** Match the real page header's eyebrow so the title lands in the same place. */
  eyebrow?: string;
  title: string;
  subtitle?: string;
  className?: string;
  /** Body placeholder shaped like the page; defaults to three generic blocks. */
  children?: ReactNode;
}) {
  return (
    <main
      className={cn(
        "site-shell relative flex flex-1 flex-col gap-5 py-6 sm:py-8",
        className
      )}
      aria-busy="true"
      aria-live="polite"
    >
      <LoadingTopBar />
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        subtitle={subtitle}
        actions={<LoadingStatus>Loading</LoadingStatus>}
      />
      {children ?? (
        <div className="grid gap-3">
          <SkeletonBlock className="h-24" />
          <SkeletonBlock className="h-40" />
          <SkeletonBlock className="h-32" />
        </div>
      )}
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
      <LoadingBarSignal />
      <LoadingStatus>{label}</LoadingStatus>
      <SkeletonBlock className="h-36" />
      <SkeletonBlock className="h-48" />
    </div>
  );
}
