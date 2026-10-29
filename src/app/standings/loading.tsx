import { DestinationLoadingFrame } from "@/components/continuity/destination-loading-frame";
import { StandingsBodySkeleton } from "@/components/standings/standings-body-skeleton";

export default function Loading() {
  return (
    <DestinationLoadingFrame title="Standings" context="standings">
      <StandingsBodySkeleton />
    </DestinationLoadingFrame>
  );
}
