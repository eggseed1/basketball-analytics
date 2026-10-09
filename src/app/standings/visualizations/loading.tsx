import { DestinationLoadingFrame } from "@/components/continuity/destination-loading-frame";
import { StandingsMarginSkeleton } from "@/components/standings/standings-body-skeleton";

export default function Loading() {
  return (
    <DestinationLoadingFrame
      eyebrow="Teams"
      title="Visualizations"
      subtitle="Race tracker and scoring margin for every team."
    >
      <div className="flex flex-col gap-5">
        <div className="sports-card h-[480px] animate-pulse bg-secondary/40" />
        <StandingsMarginSkeleton />
      </div>
    </DestinationLoadingFrame>
  );
}
