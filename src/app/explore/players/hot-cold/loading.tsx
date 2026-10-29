import {
  DestinationLoadingFrame,
  SkeletonBlock,
} from "@/components/continuity/destination-loading-frame";

export default function Loading() {
  return (
    <DestinationLoadingFrame title="Hot & Cold" context="explore-hot-cold">
      <div className="grid gap-3 sm:grid-cols-2" aria-hidden>
        <SkeletonBlock className="h-64" />
        <SkeletonBlock className="h-64" />
      </div>
    </DestinationLoadingFrame>
  );
}
