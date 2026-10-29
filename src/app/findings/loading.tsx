import {
  DestinationLoadingFrame,
  SkeletonBlock,
} from "@/components/continuity/destination-loading-frame";

export default function Loading() {
  return (
    <DestinationLoadingFrame title="Findings" context="findings">
      <div className="grid gap-4 sm:grid-cols-2" aria-hidden>
        {Array.from({ length: 4 }, (_, i) => (
          <SkeletonBlock key={i} className="h-40" />
        ))}
      </div>
    </DestinationLoadingFrame>
  );
}
