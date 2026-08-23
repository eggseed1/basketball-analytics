"use client";

import {
  useEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";

import { useOwnerTheme } from "@/components/design-system/theme-provider";
import { cn } from "@/lib/utils";

const FROZEN_MAX_DESKTOP_PX = 22 * 16;
const FROZEN_MAX_MOBILE_PX = 10 * 16;

function frozenWidthCap(viewportW: number): number {
  if (viewportW < 640) {
    return Math.min(FROZEN_MAX_MOBILE_PX, Math.floor(viewportW * 0.42));
  }
  return Math.min(FROZEN_MAX_DESKTOP_PX, Math.floor(viewportW * 0.5));
}

/**
 * Board chrome: absolute frost rail over a full-width scroller (SiteChrome model).
 * Veil/blur stay lighter than header chrome so names stay readable.
 * On small screens the rail is capped tighter so stats remain reachable.
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
      const raw = Math.ceil(frozenEl.getBoundingClientRect().width);
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
      className={cn(
        "board-scroll-frame max-sm:-mx-4 max-sm:rounded-none max-sm:border-x-0",
        className
      )}
      style={{ "--board-frozen-w": "9rem" } as CSSProperties}
    >
      <div className="board-scroll-host overflow-x-auto overscroll-x-contain">
        {children}
      </div>
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
        <div
          ref={frozenRef}
          className="pointer-events-auto h-full w-max max-w-[min(42vw,10rem)] sm:max-w-[min(50vw,22rem)]"
        >
          {frozen}
        </div>
      </div>
    </div>
  );
}
