"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Native scrolling only - no wheel hijacking.
 * Lenis was jittery on trackpads and broke sticky layout.
 * Keeps route-change scroll reset.
 */
export function SmoothScroll() {
  const pathname = usePathname();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
