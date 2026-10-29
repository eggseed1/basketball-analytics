import {
  DestinationLoadingFrame,
  SkeletonBlock,
} from "@/components/continuity/destination-loading-frame";

export default function Loading() {
  return (
    <DestinationLoadingFrame title="Players" context="explore-players">
      <div className="flex flex-col gap-4" aria-hidden>
        <div className="flex flex-wrap gap-2">
          <SkeletonBlock className="h-9 w-20 rounded-full" />
          <SkeletonBlock className="h-9 w-24 rounded-full" />
          <SkeletonBlock className="h-9 w-16 rounded-full" />
          <SkeletonBlock className="h-9 w-28 rounded-full" />
        </div>
        <SkeletonBlock className="h-12 w-full max-w-xl rounded-xl" />
        <div className="overflow-hidden rounded-xl border border-border/50">
          <SkeletonBlock className="h-11 w-full rounded-none" />
          {Array.from({ length: 10 }, (_, i) => (
            <SkeletonBlock
              key={i}
              className="h-12 w-full rounded-none border-t border-border/40"
            />
          ))}
        </div>
      </div>
    </DestinationLoadingFrame>
  );
}
