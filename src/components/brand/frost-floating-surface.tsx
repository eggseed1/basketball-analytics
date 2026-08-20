import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

import { GlassSurface } from "@/components/brand/glass-surface";
import { stripFloatingTransform } from "@/lib/strip-floating-transform";
import { cn } from "@/lib/utils";

/**
 * Frosted floating panel (hover cards / tooltips).
 * Strips transform/overflow so backdrop-filter can sample the page.
 * Server-compatible presentation primitive.
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
  next.transform = "none";
  next.filter = "none";
  next.willChange = "auto";
  next.overflow = "visible";

  return (
    <GlassSurface
      {...rest}
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
