import { DestinationLoadingFrame } from "@/components/continuity/destination-loading-frame";

export default function Loading() {
  return (
    <DestinationLoadingFrame
      eyebrow="Teams"
      title="Visualizations"
      subtitle="Race tracker, ratings, luck, splits, and more for every team."
    >
      <div className="sports-card h-[480px] animate-pulse bg-secondary/40" />
    </DestinationLoadingFrame>
  );
}
