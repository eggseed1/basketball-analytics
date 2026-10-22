import type { ReactNode } from "react";

import { SectionHeader } from "@/components/layout/page-header";
import {
  sectionBodySurfaceClassName,
  sectionBodySurfaceStyle,
  sectionShellClassName,
  type PageSectionDensity,
} from "@/lib/design-system-sections";
import { cn } from "@/lib/utils";

export type SectionFrameProps = {
  id?: string;
  /** Accessible name when title is not a string. */
  "aria-label"?: string;
  title?: ReactNode;
  description?: ReactNode;
  about?: ReactNode;
  aboutLabel?: ReactNode;
  actions?: ReactNode;
  /**
   * `outside` — title on canvas (default).
   * `none` — no SectionHeader; caller labeled the body (identity modules).
   */
  titlePlacement?: "outside" | "none";
  /**
   * When true, children sit in a subtle sports-card under the header.
   * Never wraps the header. Use for interactive clusters only.
   */
  bodySurface?: boolean;
  density?: PageSectionDensity;
  /**
   * Hold entry motion until the section intersects the viewport (no eager
   * first-paint band). Use for Overview blocks that should wait for scroll.
   */
  holdUntilScroll?: boolean;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
};

/**
 * Page section: open shell, optional outside header, optional glass body.
 * Follows `decideSectionSurface` / section-surfaces rule.
 */
export function SectionFrame({
  id,
  "aria-label": ariaLabel,
  title,
  description,
  about,
  aboutLabel,
  actions,
  titlePlacement = "outside",
  bodySurface = false,
  density = "supporting",
  holdUntilScroll = false,
  className,
  bodyClassName,
  children,
}: SectionFrameProps) {
  const label =
    ariaLabel ?? (typeof title === "string" ? title : undefined);

  const body = bodySurface ? (
    <div
      data-slot="section-body-surface"
      data-density={density}
      className={cn(sectionBodySurfaceClassName, "p-4 sm:p-5", bodyClassName)}
      style={sectionBodySurfaceStyle}
    >
      {children}
    </div>
  ) : (
    <div
      data-slot="section-body"
      data-density={density}
      className={cn("flex flex-col gap-3 sm:gap-4", bodyClassName)}
    >
      {children}
    </div>
  );

  return (
    <section
      id={id}
      data-slot="section-frame"
      data-density={density}
      data-title-placement={titlePlacement}
      data-body-surface={bodySurface ? "true" : "false"}
      data-motion-scroll={holdUntilScroll ? "" : undefined}
      className={cn(sectionShellClassName, className)}
      aria-label={label}
    >
      {titlePlacement === "outside" && title != null ? (
        <SectionHeader
          title={title}
          description={description}
          about={about}
          aboutLabel={aboutLabel}
          actions={actions}
        />
      ) : null}
      {body}
    </section>
  );
}
