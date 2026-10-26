import { SkeletonBlock } from "@/components/continuity/destination-loading-frame";
import { cn } from "@/lib/utils";

/** Scoreboard tile shape for route / strip loading states. */
export function ScoreTileSkeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "sports-card flex flex-col gap-3 p-3 sm:p-3.5",
        className
      )}
    >
      <SkeletonBlock className="h-3 w-24 rounded-md" />
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <SkeletonBlock className="size-7 shrink-0 rounded-full" />
          <SkeletonBlock className="h-4 flex-1 rounded-md" />
          <SkeletonBlock className="h-5 w-8 rounded-md" />
        </div>
        <div className="flex items-center gap-2">
          <SkeletonBlock className="size-7 shrink-0 rounded-full" />
          <SkeletonBlock className="h-4 flex-1 rounded-md" />
          <SkeletonBlock className="h-5 w-8 rounded-md" />
        </div>
      </div>
    </div>
  );
}

/** Grid of score tiles for /scores loading and week-strip placeholders. */
export function ScoreTileSkeletonGrid({
  count = 6,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3",
        className
      )}
    >
      {Array.from({ length: count }, (_, i) => (
        <ScoreTileSkeleton key={i} />
      ))}
    </div>
  );
}
