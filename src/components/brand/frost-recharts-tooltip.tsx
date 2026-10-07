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
 * The wrapper must snap (no transform transition): the portal copies its
 * position every frame and eases on its own, and two easings stacked leave the
 * tooltip trailing the cursor line by ~400ms.
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

/**
 * Recharts positions tooltips with CSS transform, which cancels
 * backdrop-filter. Portal the shared chart tooltip to the same viewport point.
 * An invisible copy stays in Recharts' wrapper: Recharts only moves the wrapper
 * to the cursor (and flips it at the edges) once it measures a non-zero box.
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
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!active) {
      setPos(null);
      return;
    }
    let raf = 0;
    const tick = () => {
      const wrap = ghostRef.current?.closest(
        ".recharts-tooltip-wrapper"
      ) as HTMLElement | null;
      if (wrap) {
        const rect = wrap.getBoundingClientRect();
        const left = Math.round(rect.left);
        const top = Math.round(rect.top);
        setPos((prev) =>
          prev && prev.left === left && prev.top === top
            ? prev
            : { left, top }
        );
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
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
      {pos
        ? createPortal(
            <ChartTooltipSurface
              className={cn("chart-tip-float pointer-events-none z-[80]", className)}
              style={{
                position: "fixed",
                left: pos.left,
                top: pos.top,
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
