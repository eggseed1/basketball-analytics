import type { ReactNode } from "react";

import { GlassSurface } from "@/components/brand/glass-surface";

/**
 * Site header material — CSS glass (no liquid SVG).
 * Sticky chrome; overflow visible for mobile More menu.
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
