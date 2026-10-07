import {
  LoadingStatus,
  LoadingTopBar,
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
      <LoadingTopBar />

      <div className="sports-card flex flex-col gap-5 px-4 py-5">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-4">
          <div className="flex min-w-0 flex-1 basis-[18rem] items-center gap-4 sm:items-start">
            <SkeletonBlock className="size-24 shrink-0 rounded-full" />
            <div className="flex min-w-0 flex-1 flex-col gap-2.5 pt-1">
              <SkeletonBlock className="h-3 w-40 max-w-full rounded-full" />
              <SkeletonBlock className="h-7 w-72 max-w-full rounded-lg" />
              <SkeletonBlock className="h-7 w-40 max-w-full rounded-lg sm:hidden" />
              <SkeletonBlock className="h-3 w-56 max-w-full rounded-full" />
              <SkeletonBlock className="h-3 w-44 max-w-full rounded-full sm:hidden" />
              <SkeletonBlock className="h-3 w-36 max-w-full rounded-full sm:hidden" />
            </div>
          </div>
          <div className="flex h-8 shrink-0 items-center">
            <LoadingStatus>Loading team</LoadingStatus>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:max-w-[24rem]">
          {Array.from({ length: 2 }, (_, i) => (
            <SkeletonBlock key={i} className="h-[82px] rounded-md" />
          ))}
        </div>
      </div>

      <div className="flex flex-nowrap items-center gap-x-2 overflow-hidden border-b-2 border-foreground/70 px-1 py-2">
        {TEAM_PAGE_TABS.map((tab) => (
          <span
            key={tab.id}
            className="shrink-0 px-2 py-1 text-[14px] leading-5 font-bold tracking-tight text-muted-foreground/60"
          >
            {tab.label}
          </span>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <SkeletonBlock className="h-56" />
        <SkeletonBlock className="h-56" />
      </div>
      <SkeletonBlock className="h-72" />
      <p className="sr-only">Loading team…</p>
    </main>
  );
}
