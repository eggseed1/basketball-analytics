/**
 * Site type scale — even pixel sizes only.
 * Prefer these names over one-off text-[NNpx] classes.
 *
 * Roles: display | page | heading | title | body | bodySm | caption
 * Data: use `.tabular-nums` / `.score-num` with mono or sans.
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

/** Hover-only (not a link) — never-played player mentions. */
export const textHintClassName =
  "cursor-help font-semibold underline decoration-dotted decoration-foreground/40 underline-offset-2";

/**
 * Glass nesting policy (MERGE.1):
 * - Page background → base/raised panel → at most one glass layer → optional frost float
 * - Never nest glass inside glass inside glass
 * - Dense lists/tables: solid or `.board-scroll-host` (no liquid / no stacked blur)
 */
export const GLASS_NESTING_POLICY =
  "PAGE > BASE|RAISED > GLASS(max1) > FROST_FLOAT(optional); no glass-in-glass-in-glass; lists use solid/css only";
