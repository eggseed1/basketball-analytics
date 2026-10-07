import { DestinationLoadingFrame } from "@/components/continuity/destination-loading-frame";
import { StandingsBodySkeleton } from "@/components/standings/standings-body-skeleton";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";

export default function Loading() {
  const season = canonicalSeasonFromStartYear(currentNbaStartYear());
  return (
    <DestinationLoadingFrame
      eyebrow="Standings"
      title="Standings"
      subtitle={`${season} conference race: W/L, games back, and scoring margin.`}
    >
      <StandingsBodySkeleton />
    </DestinationLoadingFrame>
  );
}
