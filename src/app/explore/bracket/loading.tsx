import {
  DestinationLoadingFrame,
  SkeletonBlock,
} from "@/components/continuity/destination-loading-frame";

export default function Loading() {
  return (
    <DestinationLoadingFrame title="Bracket" context="bracket">
      <div className="grid gap-3" aria-hidden>
        <SkeletonBlock className="h-16" />
        <SkeletonBlock className="h-72" />
        <SkeletonBlock className="h-40" />
      </div>
    </DestinationLoadingFrame>
  );
}
