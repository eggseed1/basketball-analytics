import {
  DestinationLoadingFrame,
  SkeletonBlock,
} from "@/components/continuity/destination-loading-frame";

export default function Loading() {
  return (
    <DestinationLoadingFrame title="Injuries" context="injuries">
      <div className="flex flex-col gap-2" aria-hidden>
        {Array.from({ length: 8 }, (_, i) => (
          <SkeletonBlock key={i} className="h-12" />
        ))}
      </div>
    </DestinationLoadingFrame>
  );
}
