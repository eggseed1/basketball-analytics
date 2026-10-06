import {
  LoadingStatus,
  SkeletonBlock,
} from "@/components/continuity/destination-loading-frame";
import { TEAM_PAGE_TABS } from "@/lib/team-destination";

/** Full-route `loading.tsx` in the shape of the real page: identity card, tab row, then content. */
export function TeamPageLoadingFrame() {
  return (
    <main
      className="site-shell relative z-[1] flex flex-col gap-4 py-5 sm:gap-5 sm:py-7"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="query-updating-bar h-[3px] rounded-full" />

      <div className="sports-card flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex items-start gap-4">
          <SkeletonBlock className="size-16 shrink-0 rounded-full sm:size-20" />
          <div className="flex min-w-0 flex-1 flex-col gap-2.5 pt-1">
            <SkeletonBlock className="h-3 w-40 max-w-full rounded-full" />
            <SkeletonBlock className="h-7 w-72 max-w-full rounded-lg" />
            <SkeletonBlock className="h-3 w-56 max-w-full rounded-full" />
          </div>
          <SkeletonBlock className="hidden h-9 w-32 shrink-0 rounded-lg sm:block" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <SkeletonBlock key={i} className="h-[4.5rem] rounded-lg" />
          ))}
        </div>
      </div>

      <div className="flex flex-nowrap items-center gap-x-2 overflow-hidden border-b-2 border-foreground/70 px-1 py-2">
        {TEAM_PAGE_TABS.map((tab) => (
          <span
            key={tab.id}
            className="shrink-0 px-2 py-1 text-[14px] font-bold tracking-tight text-muted-foreground/60"
          >
            {tab.label}
          </span>
        ))}
      </div>

      <LoadingStatus>Loading team</LoadingStatus>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <SkeletonBlock className="h-56" />
        <SkeletonBlock className="h-56" />
      </div>
      <SkeletonBlock className="h-72" />
      <p className="sr-only">Loading team…</p>
    </main>
  );
}
