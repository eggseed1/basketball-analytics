import {
  DestinationLoadingFrame,
  SkeletonBlock,
} from "@/components/continuity/destination-loading-frame";

export default function Loading() {
  return (
    <DestinationLoadingFrame title="Visualizations" context="standings-viz">
      <div className="grid gap-3" aria-hidden>
        <div className="flex flex-wrap gap-2">
          <SkeletonBlock className="h-9 w-24 rounded-full" />
          <SkeletonBlock className="h-9 w-20 rounded-full" />
          <SkeletonBlock className="h-9 w-28 rounded-full" />
        </div>
        <SkeletonBlock className="h-[28rem]" />
      </div>
    </DestinationLoadingFrame>
  );
}
