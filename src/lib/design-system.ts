/**
 * Site type scale + layout tokens.
 * Prefer these names over one-off text-[NNpx] classes.
 * Do NOT use `type` for dense stats boards — use `boardType` instead.
 */
export const type = {
  micro: "type-micro",
  caption: "type-caption",
  bodySm: "type-body-sm",
  body: "type-body",
  bodyLg: "type-body font-medium",
  title: "type-title",
  title3: "type-title-3",
  heading: "type-heading",
  title2: "type-title-2",
  /** @deprecated Prefer title2 — kept for existing call sites */
  page: "type-page",
  title1: "type-title-1",
  display: "type-display",
  displayLg: "type-display-lg",
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

/** 4px-derived spacing class helpers */
export const space = {
  1: "gap-1",
  1_5: "gap-1.5",
  2: "gap-2",
  3: "gap-3",
  4: "gap-4",
  5: "gap-5",
  6: "gap-6",
  8: "gap-8",
  component: "gap-3",
  section: "gap-8",
} as const;

export const radius = {
  xs: "rounded-[var(--radius-xs)]",
  sm: "rounded-[var(--radius-sm)]",
  md: "rounded-[var(--radius-md)]",
  lg: "rounded-[var(--radius-lg)]",
  xl: "rounded-[var(--radius-xl)]",
  "2xl": "rounded-[var(--radius-2xl)]",
  pill: "rounded-[var(--radius-pill)]",
} as const;

export const material = {
  canvas: "material-canvas",
  subtle: "material-subtle",
  standard: "material-standard",
  elevated: "material-elevated",
  /** Production default card — prefers existing sports-card for solid-mode fallbacks */
  card: "sports-card",
} as const;

export const density = {
  comfortable: "density-comfortable",
  compact: "density-compact",
  dense: "density-dense",
} as const;

export const shell = {
  standard: "site-shell",
  wide: "site-shell-wide",
  full: "site-shell-full",
  prose: "site-prose",
} as const;

export const duration = {
  fast: "duration-[var(--duration-fast)]",
  standard: "duration-[var(--duration-standard)]",
  slow: "duration-[var(--duration-slow)]",
} as const;

export const zIndex = {
  base: "z-[var(--z-base)]",
  sticky: "z-[var(--z-sticky)]",
  nav: "z-[var(--z-nav)]",
  dropdown: "z-[var(--z-dropdown)]",
  popover: "z-[var(--z-popover)]",
  modal: "z-[var(--z-modal)]",
  toast: "z-[var(--z-toast)]",
  command: "z-[var(--z-command)]",
} as const;
