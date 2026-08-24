/**
 * Player-page loading / Suspense placeholders sized to match the live layout
 * so hard refresh and streaming islands do not teleport the page.
 */

import { cn } from "@/lib/utils";

function Pulse({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-pulse rounded-xl bg-black/[0.06]", className)}
      aria-hidden
    />
  );
}

/** Full-route `loading.tsx` — mirrors identity + percentile hero + board. */
export function PlayerPageLoadingFrame() {
  return (
    <div
      className="site-shell flex flex-1 flex-col gap-4 py-5 sm:gap-5 sm:py-7"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="query-updating-bar rounded-full" />
      <div className="grid items-start gap-4 min-[800px]:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)]">
        <div className="flex flex-col gap-3">
          <Pulse className="h-[7.5rem] rounded-md" />
          <Pulse className="h-12 rounded-md" />
          <Pulse className="h-36 rounded-md" />
        </div>
        <Pulse className="min-h-[28rem] rounded-md" />
      </div>
      <Pulse className="min-h-[22rem] rounded-md" />
      <p className="sr-only">Loading player…</p>
    </div>
  );
}

/** Percentile hero — tall enough to match the ranking panel. */
export function PlayerPercentileSkeleton({
  label = "Loading percentile ranking…",
}: {
  label?: string;
}) {
  return (
    <div
      className="flex min-h-[28rem] flex-col gap-3"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="query-updating-bar rounded-full" />
      <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <Pulse className="min-h-[26rem] flex-1 rounded-md" />
      <p className="sr-only">{label}</p>
    </div>
  );
}

/** Statistics / Career / Games boards. */
export function PlayerBoardSkeleton({
  label = "Loading…",
}: {
  label?: string;
}) {
  return (
    <div
      className="flex min-h-[22rem] flex-col gap-3"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="query-updating-bar rounded-full" />
      <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <Pulse className="h-10 rounded-md" />
      <Pulse className="min-h-[18rem] flex-1 rounded-md" />
      <p className="sr-only">{label}</p>
    </div>
  );
}

/** Compact slot for streamed identity extras (accolades / schedule / FO). */
export function PlayerIdentitySlotSkeleton({
  className,
}: {
  className?: string;
}) {
  return <Pulse className={cn("h-12 w-full rounded-md", className)} />;
}
