import {
  DestinationLoadingFrame,
  SkeletonBlock,
} from "@/components/continuity/destination-loading-frame";

export default function Loading() {
  return (
    <DestinationLoadingFrame title="Race tracker" context="race">
      <div className="grid gap-3" aria-hidden>
        <SkeletonBlock className="h-12" />
        <SkeletonBlock className="h-80" />
      </div>
    </DestinationLoadingFrame>
  );
}