/**
 * Player-page loading / Suspense placeholders sized to match the live layout
 * so hard refresh and streaming islands do not teleport the page.
 */

import type { ComponentPropsWithoutRef } from "react";

import {
  LoadingStatus,
  LoadingTopBar,
} from "@/components/continuity/destination-loading-frame";
import { LoadingPhrase } from "@/components/continuity/loading-phrase";
import { LoadingBarSignal } from "@/components/continuity/viewport-loading-bar";
import {
  initialLoadingPhrase,
  type LoadingContext,
} from "@/lib/loading-phrases";
import { cn } from "@/lib/utils";

function Pulse({
  className,
  ...rest
}: { className?: string } & ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cn("loading-shimmer rounded-xl", className)}
      aria-hidden
      {...rest}
    />
  );
}

/** Full-route `loading.tsx` — mirrors identity + percentile hero + board. */
export function PlayerPageLoadingFrame() {
  return (
    <div
      className="site-shell relative flex flex-1 flex-col gap-4 py-5 sm:gap-5 sm:py-7"
      aria-busy="true"
      aria-live="polite"
    >
      <LoadingTopBar />
      <LoadingStatus>
        <LoadingPhrase context="player" />
      </LoadingStatus>
      {/* The page's notice slot: empty most of the time, but its gap still offsets the grid. */}
      <div aria-hidden className="min-w-0" />
      <div className="grid items-start gap-4 min-[800px]:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)]">
        <div className="flex flex-col gap-3" aria-hidden>
          <Pulse className="h-[235px] rounded-md" />
          <Pulse className="h-[230px] rounded-md" />
          <Pulse className="h-[298px] rounded-md" />
        </div>
        <PlayerPercentileSkeleton label={initialLoadingPhrase("player")} showBar={false} />
      </div>
      <Pulse className="min-h-[22rem] rounded-md" aria-hidden />
      <p className="sr-only">{initialLoadingPhrase("player")}</p>
    </div>
  );
}

function SkeletonPhrase({
  context,
  label,
}: {
  context: LoadingContext;
  label?: string;
}) {
  return (
    <>
      <LoadingStatus>
        <LoadingPhrase context={context} />
      </LoadingStatus>
      <p className="sr-only">{label ?? initialLoadingPhrase(context)}</p>
    </>
  );
}

/** Percentile hero — tall enough to match the ranking panel. */
export function PlayerPercentileSkeleton({
  label,
  context = "player",
  showBar = true,
}: {
  label?: string;
  context?: LoadingContext;
  /** Off inside a full-page frame, which already shows a progress line. */
  showBar?: boolean;
}) {
  return (
    <div
      data-skeleton
      className="flex min-h-[28rem] flex-col gap-3"
      aria-busy="true"
      aria-live="polite"
    >
      {showBar ? <LoadingBarSignal /> : null}
      <SkeletonPhrase context={context} label={label} />
      <Pulse className="min-h-[26rem] flex-1 rounded-md" />
    </div>
  );
}

/** Statistics / Career / Games boards. */
export function PlayerBoardSkeleton({
  label,
  context = "section",
  minHeightClassName = "min-h-[22rem]",
}: {
  label?: string;
  context?: LoadingContext;
  /** Override when the live section is shorter (overview Style, etc.). */
  minHeightClassName?: string;
}) {
  return (
    <div
      data-skeleton
      className={cn("flex flex-col gap-3", minHeightClassName)}
      aria-busy="true"
      aria-live="polite"
    >
      <LoadingBarSignal />
      <SkeletonPhrase context={context} label={label} />
      <Pulse className="h-10 rounded-md" aria-hidden />
      <Pulse className="min-h-[12rem] flex-1 rounded-md" aria-hidden />
    </div>
  );
}

/** Overview Career stats board (chart + category table). */
export function PlayerOverviewCareerSkeleton({
  label,
  context = "section-chart",
}: {
  label?: string;
  context?: LoadingContext;
}) {
  return (
    <div
      data-skeleton
      className="flex min-h-[32rem] flex-col gap-3"
      aria-busy="true"
      aria-live="polite"
    >
      <LoadingBarSignal />
      <SkeletonPhrase context={context} label={label} />
      <div aria-hidden className="flex flex-col gap-3">
        <Pulse className="h-7 w-36 rounded-md" />
        <Pulse className="h-8 w-full max-w-sm rounded-md" />
        <Pulse className="h-10 w-full max-w-md rounded-md" />
        <Pulse className="h-[16rem] rounded-md" />
        <Pulse className="h-8 w-full max-w-lg rounded-md" />
        <Pulse className="h-48 w-full rounded-md" />
      </div>
    </div>
  );
}

/** Overview Style (compact). */
export function PlayerOverviewStyleSkeleton({
  label,
  context = "explore-styles",
}: {
  label?: string;
  context?: LoadingContext;
}) {
  return (
    <div
      data-skeleton
      className="flex min-h-[14rem] flex-col gap-3"
      aria-busy="true"
      aria-live="polite"
    >
      <SkeletonPhrase context={context} label={label} />
      <div aria-hidden className="flex flex-col gap-3">
        <Pulse className="h-7 w-24 rounded-md" />
        <Pulse className="h-4 w-64 max-w-full rounded-md opacity-70" />
        <Pulse className="h-8 w-48 rounded-md" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Pulse className="h-20 rounded-md" />
          <Pulse className="h-20 rounded-md" />
        </div>
      </div>
    </div>
  );
}

/** Overview contract summary, or Salary tab body while streaming. */
export function PlayerOverviewContractSkeleton({
  label,
  context = "section-salary",
  compact = false,
}: {
  label?: string;
  context?: LoadingContext;
  /** Compact overview slot vs full Salary tab. */
  compact?: boolean;
}) {
  const salaryTab = !compact && (label == null || /salary/i.test(label));
  return (
    <div
      data-skeleton
      className={cn(
        "flex flex-col gap-3",
        salaryTab ? "min-h-[32rem]" : "min-h-[12rem]"
      )}
      aria-busy="true"
      aria-live="polite"
    >
      <SkeletonPhrase context={context} label={label} />
      <div aria-hidden className="flex flex-col gap-3">
        <Pulse className="h-7 w-36 rounded-md" />
        <Pulse className="h-4 w-56 max-w-full rounded-md opacity-70" />
        <Pulse className={cn("rounded-md", salaryTab ? "h-40" : "h-28")} />
        {salaryTab ? <Pulse className="h-56 rounded-md" /> : null}
      </div>
    </div>
  );
}

/** Single Comparisons block (Style / Impact / Trajectory). */
export function PlayerOverviewSimilarSkeleton({
  label,
  context = "compare",
}: {
  label?: string;
  context?: LoadingContext;
}) {
  return (
    <div
      data-skeleton
      className="flex min-h-[18rem] flex-col gap-3"
      aria-busy="true"
      aria-live="polite"
    >
      <SkeletonPhrase context={context} label={label} />
      <div aria-hidden className="flex flex-col gap-3">
        <Pulse className="h-7 w-40 rounded-md" />
        <Pulse className="h-4 w-80 max-w-full rounded-md opacity-70" />
        <Pulse className="h-8 w-64 max-w-full rounded-md" />
        <Pulse className="h-48 rounded-md" />
      </div>
    </div>
  );
}

/** Compact slot for streamed identity extras (accolades / schedule / FO). */
export function PlayerIdentitySlotSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <Pulse
      data-skeleton
      className={cn("h-12 w-full rounded-md", className)}
    />
  );
}

/**
 * Honest server-island failure state. Optional data must never take down the
 * player identity shell or leave a permanent loading skeleton behind.
 */
export function PlayerPanelUnavailable({
  label,
  detail = "This section is temporarily unavailable. The rest of the player page is still usable.",
  compact = false,
  className,
}: {
  label: string;
  detail?: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <section
      role="status"
      className={cn(
        "rounded-md border border-border/70 bg-background/45 px-4 py-4",
        compact ? "min-h-12" : "min-h-32",
        className
      )}
    >
      <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
        {detail}
      </p>
    </section>
  );
}
