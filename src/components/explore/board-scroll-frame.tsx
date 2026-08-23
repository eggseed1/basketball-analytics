"use client";

import {
  useEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils";

/**
 * Board chrome that can actually frost like SiteChrome / GlassSurface.
 *
 * Root cause of sticky-td frost failing: `overflow-x-auto` creates a backdrop
 * root. Descendants (sticky Player cells) can only sample content *inside* that
 * scroller — never the page atmosphere that makes the header look alive. Tuning
 * blur/alpha on `.board-sticky-frost` cannot fix that.
 *
 * Layout: frozen glass column (outside the scrollport) + stats scroller.
 * The frozen column samples the page wash; stats scroll beside it, not under a
 * sticky cell trapped in the overflow root.
 */
export function BoardScrollFrame({
  frozen,
  children,
  className,
}: {
  /** Player (or other) freeze column — rendered outside the horizontal scroller. */
  frozen: ReactNode;
  /** Horizontally scrolling board body (table without the frozen column). */
  children: ReactNode;
  className?: string;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const frozenRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const frame = frameRef.current;
    const frozenEl = frozenRef.current;
    if (!frame || !frozenEl) return;

    const sync = () => {
      const w = frozenEl.getBoundingClientRect().width;
      frame.style.setProperty("--board-frozen-w", `${Math.ceil(w)}px`);
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(frozenEl);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={frameRef}
      className={cn("board-scroll-frame", className)}
      style={{ "--board-frozen-w": "12rem" } as CSSProperties}
    >
      <div ref={frozenRef} className="board-frozen-col">
        {frozen}
      </div>
      <div className="board-scroll-host overflow-x-auto">{children}</div>
    </div>
  );
}
