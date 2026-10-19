"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { GlassSurface } from "@/components/brand/glass-surface";

/**
 * Site header material — CSS glass only.
 * Sticky liquid SVG displacement re-paints on every scroll/layout and made
 * every route feel sluggish; identity heroes can opt into liquid separately.
 *
 * On /gm the front-office nav is the desk chrome. A sticky site header sits
 * on top of those links when you scroll and eats the clicks.
 */
export function SiteChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const inFranchiseLab = pathname === "/gm" || pathname.startsWith("/gm/");
  return (
    <GlassSurface
      as="header"
      effect="css"
      backdropBlur={16}
      overflowVisible
      className="site-chrome rounded-none"
      style={{
        position: inFranchiseLab ? "relative" : "sticky",
        top: 0,
        zIndex: "var(--z-nav)",
      }}
    >
      {children}
    </GlassSurface>
  );
}
