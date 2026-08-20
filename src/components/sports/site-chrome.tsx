"use client";

import type { ReactNode } from "react";

import { GlassSurface } from "@/components/brand/glass-surface";

/**
 * Site header material - same liquid-glass surface as page cards.
 */
export function SiteChrome({ children }: { children: ReactNode }) {
  return (
    <GlassSurface
      as="header"
      overflowVisible
      className="site-chrome rounded-none"
      style={{ position: "sticky", top: 0, zIndex: 40 }}
    >
      {children}
    </GlassSurface>
  );
}
