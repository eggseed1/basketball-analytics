import {
  DestinationLoadingFrame,
  SkeletonBlock,
} from "@/components/continuity/destination-loading-frame";

export default function Loading() {
  return (
    // Keep the loading boundary inside the same desk surface as all /gm
    // pages. When the previous route unmounts this covers the viewport while
    // native fullscreen stays attached to the persistent document root.
    <div data-gm data-gm-route-loading className="gm-route-loading">
      <DestinationLoadingFrame title="Franchise Lab" context="gm">
        <div className="grid gap-3" aria-hidden>
          <SkeletonBlock className="h-16" />
          <div className="grid gap-3 sm:grid-cols-3">
            <SkeletonBlock className="h-32" />
            <SkeletonBlock className="h-32" />
            <SkeletonBlock className="h-32" />
          </div>
          <SkeletonBlock className="h-56" />
        </div>
      </DestinationLoadingFrame>
    </div>
  );
}
