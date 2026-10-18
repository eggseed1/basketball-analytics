import { DestinationLoadingFrame } from "@/components/continuity/destination-loading-frame";

export default function Loading() {
  return (
    <DestinationLoadingFrame
      title="NBA transactions"
      className="py-5 sm:py-7"
      subtitle="Loading the transaction log."
    />
  );
}
