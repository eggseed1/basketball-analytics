"use client";

import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

import { GlassSurface } from "@/components/brand/glass-surface";
import { stripFloatingTransform } from "@/lib/strip-floating-transform";
import { cn } from "@/lib/utils";

/**
 * Frosted floating panel (hover cards). Same CSS blur as select menus.
 * Strips transform/overflow so backdrop-filter can sample the page.
 */
export function FrostFloatingSurface({
  className,
  style,
  children,
  accentColor,
  accentColorB,
  ...rest
}: HTMLAttributes<HTMLDivElement> & {
  children?: ReactNode;
  accentColor?: string | null;
  accentColorB?: string | null;
}) {
  const next: CSSProperties = { ...stripFloatingTransform(style) };
  delete next.overflow;
  delete next.overflowX;
  delete next.overflowY;
  // Transform/filter on this node would flatten the backdrop so blur
  // cannot sample the page - pin with top/left only.
  next.transform = "none";
  next.filter = "none";
  next.willChange = "auto";
  next.overflow = "visible";
  next.backdropFilter = "saturate(190%) blur(24px)";
  next.WebkitBackdropFilter = "saturate(190%) blur(24px)";
  return (
    <GlassSurface
      {...rest}
      effect="css"
      overflowVisible
      backdropBlur={24}
      accentColor={accentColor}
      accentColorB={accentColorB}
      className={cn(
        "hover-frost rounded-lg text-popover-foreground outline-none",
        className
      )}
      style={next}
    >
      {children}
    </GlassSurface>
  );
}
