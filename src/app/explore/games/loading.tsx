import {
  DestinationLoadingFrame,
  SkeletonBlock,
} from "@/components/continuity/destination-loading-frame";
import { ScoreTileSkeletonGrid } from "@/components/sports/score-tile-skeleton";

export default function Loading() {
  return (
    <DestinationLoadingFrame title="Explore games" context="explore-games">
      <div className="flex flex-col gap-4" aria-hidden>
        <div className="flex flex-wrap gap-2">
          <SkeletonBlock className="h-9 w-16 rounded-full" />
          <SkeletonBlock className="h-9 w-16 rounded-full" />
          <SkeletonBlock className="h-9 w-20 rounded-full" />
          <SkeletonBlock className="h-9 w-24 rounded-full" />
        </div>
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 7 }, (_, i) => (
            <SkeletonBlock
              key={i}
              className="h-9 w-[4.25rem] shrink-0 rounded-full"
            />
          ))}
        </div>
        <ScoreTileSkeletonGrid count={6} />
      </div>
    </DestinationLoadingFrame>
  );
}
