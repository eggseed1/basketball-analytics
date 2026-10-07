import { DestinationLoadingFrame } from "@/components/continuity/destination-loading-frame";

export default function Loading() {
  return (
    <DestinationLoadingFrame
      eyebrow="Transactions"
      title="Offseason"
      className="py-5 sm:py-7"
      subtitle="Loading the transaction tracker."
    />
  );
}
