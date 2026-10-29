import {
  DestinationLoadingFrame,
  SkeletonBlock,
} from "@/components/continuity/destination-loading-frame";

export default function Loading() {
  return (
    <DestinationLoadingFrame title="Franchises" context="franchises">
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-5" aria-hidden>
        {Array.from({ length: 15 }, (_, i) => (
          <SkeletonBlock key={i} className="aspect-square rounded-full" />
        ))}
      </div>
    </DestinationLoadingFrame>
  );
}
