import {
  DestinationLoadingFrame,
  SkeletonBlock,
} from "@/components/continuity/destination-loading-frame";

export default function Loading() {
  return (
    <DestinationLoadingFrame title="Movement" context="movement">
      <div className="flex flex-col gap-2" aria-hidden>
        {Array.from({ length: 6 }, (_, i) => (
          <SkeletonBlock key={i} className="h-14" />
        ))}
      </div>
    </DestinationLoadingFrame>
  );
}
