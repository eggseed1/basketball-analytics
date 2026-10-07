import { SkeletonBlock } from "@/components/continuity/destination-loading-frame";

/** Scoring-margin card and both conference tables, at their rendered heights for 30 teams. */
export function StandingsBodySkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      <SkeletonBlock className="h-[666px] sm:h-[658px]" />
      <div className="grid gap-4 lg:grid-cols-2">
        <SkeletonBlock className="h-[773px]" />
        <SkeletonBlock className="h-[773px]" />
      </div>
    </div>
  );
}
