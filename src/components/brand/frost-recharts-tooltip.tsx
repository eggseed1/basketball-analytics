"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { FrostFloatingSurface } from "@/components/brand/frost-floating-surface";
import { cn } from "@/lib/utils";

/** Hide Recharts' transformed wrapper; we portal frost to `document.body`. */
export const rechartsFrostWrapperStyle = {
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
 * backdrop-filter. Portal a frost card to the same viewport point.
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
  const ghostRef = useRef<HTMLSpanElement>(null);
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
      <span ref={ghostRef} className="sr-only" />
      {pos
        ? createPortal(
            <FrostFloatingSurface
              role="tooltip"
              className={cn(
                "pointer-events-none z-[80] px-2.5 py-1.5",
                className
              )}
              style={{
                position: "fixed",
                left: pos.left,
                top: pos.top,
              }}
            >
              {children}
            </FrostFloatingSurface>,
            document.body
          )
        : null}
    </>
  );
}
