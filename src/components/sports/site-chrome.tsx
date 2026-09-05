"use client";

import type { ReactNode } from "react";

import { GlassSurface } from "@/components/brand/glass-surface";

/**
 * Site header material — CSS glass only.
 * Sticky liquid SVG displacement re-paints on every scroll/layout and made
 * every route feel sluggish; identity heroes can opt into liquid separately.
 */
export function SiteChrome({ children }: { children: ReactNode }) {
  return (
    <GlassSurface
      as="header"
      effect="css"
      backdropBlur={16}
      overflowVisible
      className="site-chrome rounded-none"
      style={{ position: "sticky", top: 0, zIndex: "var(--z-nav)" }}
    >
      {children}
    </GlassSurface>
  );
}
