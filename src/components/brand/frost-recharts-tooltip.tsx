"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { ChartTooltipSurface } from "@/components/charts/chart-tooltip";
import { cn } from "@/lib/utils";

/**
 * Hide Recharts' transformed wrapper; we portal frost to `document.body`.
 * The wrapper must snap (no transform transition): the portal follows it with
 * its own easing, and two easings stacked leave the tip trailing the cursor.
 */
export const rechartsFrostWrapperStyle = {
  transition: "none",
  outline: "none",
  pointerEvents: "none",
  padding: 0,
  background: "transparent",
  border: "none",
  boxShadow: "none",
  filter: "none",
} as const;

/** Follow time constant: ~95% of the way to the cursor in 3τ. */
const FOLLOW_TAU_MS = 45;

/**
 * Recharts positions tooltips with CSS transform, which cancels
 * backdrop-filter. Portal the shared chart tooltip to the same viewport point.
 * An invisible copy stays in Recharts' wrapper: Recharts only moves the wrapper
 * to the cursor (and flips it at the edges) once it measures a non-zero box.
 * Until then the wrapper sits at the chart's top-left, so the portal waits for
 * a real translate before it appears, then eases toward each new position on
 * the compositor (transform only, no per-frame React renders).
 */
export function FrostRechartsTooltip({
  active,
  children,
  className,
}: {
  active?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const ghostRef = useRef<HTMLDivElement>(null);
  const floatRef = useRef<HTMLDivElement>(null);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    if (!active) {
      setStart(null);
      return;
    }
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    let cur: { x: number; y: number } | null = null;
    let last = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      const wrap = ghostRef.current?.closest(
        ".recharts-tooltip-wrapper"
      ) as HTMLElement | null;
      if (wrap && wrap.style.transform.includes("translate")) {
        const rect = wrap.getBoundingClientRect();
        const target = { x: rect.left, y: rect.top };
        if (!cur) {
          cur = target;
          setStart(target);
        } else {
          const k = reduceMotion ? 1 : 1 - Math.exp(-dt / FOLLOW_TAU_MS);
          cur = {
            x: cur.x + (target.x - cur.x) * k,
            y: cur.y + (target.y - cur.y) * k,
          };
          if (Math.abs(target.x - cur.x) < 0.3) cur.x = target.x;
          if (Math.abs(target.y - cur.y) < 0.3) cur.y = target.y;
          const el = floatRef.current;
          if (el) {
            el.style.transform = `translate3d(${cur.x}px, ${cur.y}px, 0)`;
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  if (!active) return null;

  return (
    <>
      <ChartTooltipSurface
        ref={ghostRef}
        role="presentation"
        aria-hidden
        className={cn("invisible", className)}
      >
        {children}
      </ChartTooltipSurface>
      {start
        ? createPortal(
            <ChartTooltipSurface
              ref={floatRef}
              className={cn(
                "chart-tip-follow pointer-events-none z-[80]",
                className
              )}
              style={{
                position: "fixed",
                left: 0,
                top: 0,
                transform: `translate3d(${start.x}px, ${start.y}px, 0)`,
              }}
            >
              {children}
            </ChartTooltipSurface>,
            document.body
          )
        : null}
    </>
  );
}
