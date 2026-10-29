import {
  DestinationLoadingFrame,
  SkeletonBlock,
} from "@/components/continuity/destination-loading-frame";

export default function Loading() {
  return (
    <DestinationLoadingFrame title="Player styles" context="explore-styles">
      <div className="grid gap-3 sm:grid-cols-2" aria-hidden>
        {Array.from({ length: 4 }, (_, i) => (
          <SkeletonBlock key={i} className="h-36" />
        ))}
      </div>
    </DestinationLoadingFrame>
  );
}
