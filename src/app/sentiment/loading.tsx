import {
  DestinationLoadingFrame,
  SkeletonBlock,
} from "@/components/continuity/destination-loading-frame";

export default function Loading() {
  return (
    <DestinationLoadingFrame title="Sentiment" context="sentiment">
      <div className="grid gap-3" aria-hidden>
        <div className="grid gap-3 sm:grid-cols-2">
          <SkeletonBlock className="h-48" />
          <SkeletonBlock className="h-48" />
        </div>
        <SkeletonBlock className="h-64" />
      </div>
    </DestinationLoadingFrame>
  );
}
