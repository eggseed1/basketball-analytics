/** Shared segmented-control paint. Idle items stay clear so they don't sit on a gray slab. */
export const segmentedTrackClassName =
  "inline-flex w-fit max-w-full touch-scroll-x items-center self-start rounded-[6px] border border-border/25 bg-foreground/[0.03] p-0.5";

export const segmentedItemClassName =
  "shrink-0 rounded-[4px] font-semibold transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

export const segmentedItemActiveClassName =
  "bg-background text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.04)] ring-1 ring-border/30";

export const segmentedItemIdleClassName =
  "bg-transparent text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground";
