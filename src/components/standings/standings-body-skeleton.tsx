import { SkeletonBlock } from "@/components/continuity/destination-loading-frame";

/** Both conference tables at their rendered height for 15 teams each. */
export function StandingsBodySkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-2" aria-hidden>
      <SkeletonBlock className="h-[773px]" />
      <SkeletonBlock className="h-[773px]" />
    </div>
  );
}

/** Scoring-margin card at its rendered height for 30 teams. */
export function StandingsMarginSkeleton() {
  return <SkeletonBlock className="h-[658px] sm:h-[650px]" />;
}
