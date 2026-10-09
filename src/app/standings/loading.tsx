import { DestinationLoadingFrame } from "@/components/continuity/destination-loading-frame";
import { StandingsBodySkeleton } from "@/components/standings/standings-body-skeleton";

export default function Loading() {
  return (
    <DestinationLoadingFrame
      eyebrow="Teams"
      title="Standings"
      subtitle="Conference standings, playoff bracket, and team efficiency."
    >
      <StandingsBodySkeleton />
    </DestinationLoadingFrame>
  );
}
