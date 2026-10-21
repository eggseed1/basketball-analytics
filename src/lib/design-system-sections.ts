import type { CSSProperties } from "react";

/**
 * Section surface system — when a block gets a background, where its title
 * sits, and how overview vs subtab pages compose.
 *
 * Agents: also read `.cursor/rules/section-surfaces.mdc`.
 * UI: `SectionFrame` in `@/components/layout/section-frame`.
 */

/** Why a block may receive glass / sports-card. */
export type SectionSurfaceReason =
  | "interactive"
  | "dense-board"
  | "sticky-chrome"
  | "identity-module"
  | "atomic-tile";

/**
 * Placement of the section title relative to any surface.
 * - `outside` — page sections (default). h2 on canvas, body below.
 * - `inside` — identity modules only. Caption label inside the card; no page h2.
 * - `none` — body-only blocks (rare); caller owns labeling.
 */
export type SectionTitlePlacement = "outside" | "inside" | "none";

/** How much chrome a destination page should carry. */
export type PageSectionDensity =
  /** Lean overview: summary + links, no full boards. */
  | "overview"
  /** Subtab destination: one primary board/chart owns the view. */
  | "subtab"
  /** Supporting block under a subtab primary. */
  | "supporting";

export type SectionSurfaceDecision = {
  /** Put GlassSurface / sports-card on the body (never around title+body). */
  useSurface: boolean;
  reason: SectionSurfaceReason | null;
  titlePlacement: SectionTitlePlacement;
  density: PageSectionDensity;
};

/**
 * Decide surface + title placement from intent.
 * Prefer calling this (or following the same rules) over inventing one-off chrome.
 */
export function decideSectionSurface(input: {
  density: PageSectionDensity;
  /** Interactive controls the user changes. */
  interactive?: boolean;
  /** Dense table, season board, or chart. */
  denseBoard?: boolean;
  /** Sticky floating chrome. */
  sticky?: boolean;
  /** Compact card in identity column (Arrival, upcoming slate). */
  identityModule?: boolean;
  /** Small metric cell inside an open section. */
  atomicTile?: boolean;
}): SectionSurfaceDecision {
  const {
    density,
    interactive = false,
    denseBoard = false,
    sticky = false,
    identityModule = false,
    atomicTile = false,
  } = input;

  if (identityModule) {
    return {
      useSurface: true,
      reason: "identity-module",
      titlePlacement: "inside",
      density,
    };
  }

  if (atomicTile) {
    return {
      useSurface: true,
      reason: "atomic-tile",
      titlePlacement: "outside",
      density,
    };
  }

  if (sticky) {
    return {
      useSurface: true,
      reason: "sticky-chrome",
      titlePlacement: "outside",
      density,
    };
  }

  if (denseBoard) {
    return {
      useSurface: true,
      reason: "dense-board",
      titlePlacement: "outside",
      density,
    };
  }

  if (interactive) {
    return {
      useSurface: true,
      reason: "interactive",
      titlePlacement: "outside",
      density,
    };
  }

  return {
    useSurface: false,
    reason: null,
    titlePlacement: "outside",
    density,
  };
}

/** Outer section shell — open canvas, scroll target, vertical rhythm. */
export const sectionShellClassName =
  "scroll-mt-16 flex flex-col gap-3 sm:gap-4";

/** Gap between major page sections (overview stack, subtab stack). */
export const pageSectionStackClassName = "flex flex-col gap-8";

/** Glass body under an outside header (Ask, compact boards). */
export const sectionBodySurfaceClassName =
  "sports-card sports-card-subtle glass-text-scrim";

/** Metric tile inside an open section (contract surplus cells). */
export const sectionAtomicTileClassName =
  "sports-card sports-card-subtle glass-text-scrim flex min-w-0 flex-col gap-1 p-3";

/** Open link row — no surface. */
export const sectionNavRowClassName =
  "flex flex-wrap items-center gap-x-4 gap-y-2";

/**
 * Blur for subtle body surfaces when CSS build drops backdrop-filter.
 * Prefer pairing with `sectionBodySurfaceClassName`.
 */
export const sectionBodySurfaceStyle: CSSProperties = {
  backdropFilter: "blur(12px) saturate(140%)",
  WebkitBackdropFilter: "blur(12px) saturate(140%)",
};

/**
 * Player overview bottom stack — what belongs and what must live on a subtab.
 * Keep this list honest when adding modules.
 */
export const playerOverviewBottomModules = [
  {
    id: "contract",
    density: "overview" as const,
    surface: "atomic-tiles" as const,
    titlePlacement: "outside" as const,
    note: "Money line + surplus tiles; no full value chart on overview.",
  },
  {
    id: "similar",
    density: "overview" as const,
    surface: "open-or-light-interactive" as const,
    titlePlacement: "outside" as const,
    note: "One lookalike strip (profile). Comps/futures charts stay off overview.",
  },
  {
    id: "ask",
    density: "overview" as const,
    surface: "interactive-body" as const,
    titlePlacement: "outside" as const,
    note: "Header on canvas; Ask chips inside sports-card.",
  },
  {
    id: "go-deeper",
    density: "overview" as const,
    surface: "none" as const,
    titlePlacement: "outside" as const,
    note: "Text links into Career, Games, Advanced, Shooting. No glass.",
  },
] as const;

/** Modules that must not reappear as full boards on overview. */
export const playerOverviewForbiddenFullModules = [
  "career-season-chart",
  "season-stats-board",
  "historical-career-table",
  "comps-futures-chart",
  "full-percentile-sheet",
] as const;
