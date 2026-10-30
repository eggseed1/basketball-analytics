/**
 * Shared destination loading frame - same visual language as query-updating.
 * Used by route-level loading.tsx files (not a full-page spinner).
 */

import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

import { LoadingPhrase } from "@/components/continuity/loading-phrase";
import { LoadingBarSignal } from "@/components/continuity/viewport-loading-bar";
import { PageHeader } from "@/components/layout/page-header";
import {
  initialLoadingPhrase,
  type LoadingContext,
} from "@/lib/loading-phrases";
import { cn } from "@/lib/utils";

/** Theme-aware skeleton block with a sweeping highlight. */
export function SkeletonBlock({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("loading-shimmer block rounded-xl", className)} />
  );
}

/** Spinner plus label, so a skeleton reads as loading rather than empty. */
export function LoadingStatus({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex max-w-full items-center gap-2 text-[14px] font-semibold text-muted-foreground">
      <Loader2
        aria-hidden
        className="size-4 shrink-0 animate-spin motion-reduce:animate-none"
      />
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}

/** Lights the viewport-wide progress line while this loading frame is up. */
export function LoadingTopBar() {
  return <LoadingBarSignal />;
}

export function DestinationLoadingFrame({
  title,
  context = "generic",
  className,
  children,
}: {
  title: string;
  /** Picks the rotating fun lines for this destination. */
  context?: LoadingContext;
  className?: string;
  /** Body placeholder shaped like the page; defaults to three generic blocks. */
  children?: ReactNode;
}) {
  const sr = initialLoadingPhrase(context);

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
        title={title}
        subtitle={
          <LoadingStatus>
            <LoadingPhrase context={context} />
          </LoadingStatus>
        }
      />
      {children ?? (
        <div className="grid gap-3" aria-hidden>
          <SkeletonBlock className="h-24" />
          <SkeletonBlock className="h-40" />
          <SkeletonBlock className="h-32" />
        </div>
      )}
      <p className="sr-only">
        {title}: {sr}
      </p>
    </main>
  );
}

/** Compact in-route skeleton (Suspense island), not a full-page swap. */
export function DestinationSectionSkeleton({
  context = "section",
  label,
}: {
  context?: LoadingContext;
  /** Optional a11y hint; visible copy always comes from LoadingPhrase. */
  label?: string;
}) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-live="polite">
      <LoadingBarSignal />
      <LoadingStatus>
        <LoadingPhrase context={context} />
      </LoadingStatus>
      <div aria-hidden className="grid gap-3">
        <SkeletonBlock className="h-36" />
        <SkeletonBlock className="h-48" />
      </div>
      <p className="sr-only">{label ?? initialLoadingPhrase(context)}</p>
    </div>
  );
}

