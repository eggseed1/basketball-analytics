/**
 * Site type scale - even pixel sizes only.
 * Prefer these names over one-off text-[NNpx] classes.
 * Do NOT use these for dense stats boards — use `boardType` instead.
 */
export const type = {
  caption: "text-[12px] leading-4",
  bodySm: "text-[14px] leading-5",
  body: "text-[16px] leading-6",
  title: "text-[18px] leading-6 font-semibold tracking-tight",
  heading: "text-[20px] leading-7 font-bold tracking-tight",
  page: "text-[24px] leading-8 font-bold tracking-tight",
  display: "text-[32px] leading-10 font-bold tracking-tight",
} as const;

/**
 * Dense stats-board type scale (BRef-like on mobile).
 * Separate from web `type` — boards stay compact on small screens and
 * only step up toward caption/body sizes from `sm` up.
 */
export const boardType = {
  /** Column headers / sort labels */
  head: "text-[9.5px] leading-[1.1] tracking-[0.04em] sm:text-[12px] sm:leading-4 sm:tracking-[0.06em]",
  /** Numeric cells, Tm, Pos */
  cell: "text-[10.5px] leading-[1.15] sm:text-[12px] sm:leading-4",
  /** Frozen player name column */
  name: "text-[11px] leading-tight font-semibold sm:text-[16px] sm:leading-6",
} as const;

/** Clickable text: underlined + semibold. Pair with TextLink. */
export const textLinkClassName =
  "font-semibold underline decoration-foreground/40 underline-offset-2 hover:decoration-foreground";

/** Hover-only (not a link) - never-played player mentions. */
export const textHintClassName =
  "cursor-help font-semibold underline decoration-dotted decoration-foreground/40 underline-offset-2";
