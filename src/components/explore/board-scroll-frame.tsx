"use client";

import {
  useEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";

import { useOwnerTheme } from "@/components/design-system/theme-provider";
import { cn } from "@/lib/utils";

const FROZEN_MAX_DESKTOP_PX = 24 * 16;
/** Longest board names (e.g. Gilgeous-Alexander) need ~18rem at body size. */
const FROZEN_MAX_MOBILE_PX = 18 * 16;

function frozenWidthCap(viewportW: number): number {
  if (viewportW < 640) {
    return Math.min(FROZEN_MAX_MOBILE_PX, Math.floor(viewportW * 0.72));
  }
  return Math.min(FROZEN_MAX_DESKTOP_PX, Math.floor(viewportW * 0.55));
}

/**
 * Width-bounded board: frame never grows the page; only the inner host scrolls.
 * Frost rail overlays the left strip (SiteChrome model).
 *
 * Frozen width is measured from intrinsic content (`w-max`) so names stay
 * readable; CSS max-width caps the rail on small viewports.
 */
export function BoardScrollFrame({
  frozen,
  children,
  className,
}: {
  frozen: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const { resolvedDark, surface } = useOwnerTheme();
  const frameRef = useRef<HTMLDivElement>(null);
  const frozenRef = useRef<HTMLDivElement>(null);
  const solid = surface === "solid";

  useEffect(() => {
    const frame = frameRef.current;
    const frozenEl = frozenRef.current;
    if (!frame || !frozenEl) return;

    const sync = () => {
      // Measure intrinsic name column width (ignore CSS max-width clamps).
      const raw = Math.ceil(frozenEl.scrollWidth);
      const cap = frozenWidthCap(window.innerWidth);
      frame.style.setProperty(
        "--board-frozen-w",
        `${Math.max(Math.min(raw, cap), 1)}px`
      );
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(frozenEl);
    window.addEventListener("resize", sync);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, []);

  return (
    <div
      ref={frameRef}
      className={cn("board-scroll-frame", className)}
      style={{ "--board-frozen-w": "9rem" } as CSSProperties}
    >
      <div className="board-scroll-host">{children}</div>
      <div
        className="board-frozen-col pointer-events-none absolute inset-y-0 left-0 z-20"
        style={{
          width: "var(--board-frozen-w)",
          background: solid
            ? "var(--card)"
            : resolvedDark
              ? "rgba(28, 28, 30, 0.22)"
              : "rgba(255, 255, 255, 0.22)",
          backdropFilter: solid ? undefined : "saturate(160%) blur(10px)",
          WebkitBackdropFilter: solid ? undefined : "saturate(160%) blur(10px)",
          borderRight: solid
            ? "1px solid color-mix(in oklab, var(--foreground) 8%, transparent)"
            : resolvedDark
              ? "1px solid rgba(255,255,255,0.12)"
              : "1px solid rgba(255,255,255,0.40)",
          boxShadow: solid
            ? "10px 0 18px -12px rgb(0 0 0 / 12%)"
            : resolvedDark
              ? "inset 0 1px 0 rgba(255,255,255,0.08)"
              : "inset 0 1px 0 rgba(255,255,255,0.45)",
        }}
      >
        <div ref={frozenRef} className="pointer-events-auto h-full w-max">
          {frozen}
        </div>
      </div>
    </div>
  );
}
