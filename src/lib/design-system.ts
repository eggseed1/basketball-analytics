/**
 * Site type scale - even pixel sizes only.
 * Prefer these names over one-off text-[NNpx] classes.
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

/** Clickable text: underlined + semibold. Pair with TextLink. */
export const textLinkClassName =
  "font-semibold underline decoration-foreground/40 underline-offset-2 hover:decoration-foreground";

/** Hover-only (not a link) - never-played player mentions. */
export const textHintClassName =
  "cursor-help font-semibold underline decoration-dotted decoration-foreground/40 underline-offset-2";
