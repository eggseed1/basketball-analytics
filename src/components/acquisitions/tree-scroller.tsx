"use client";

import { type ReactNode, useEffect, useRef } from "react";

/** Horizontal scroller that starts with the `[data-primary]` card in view. */
export function TreeScroller({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = ref.current;
    const primary = box?.querySelector<HTMLElement>("[data-primary]");
    if (!box || !primary || box.scrollWidth <= box.clientWidth) return;
    const boxLeft = box.getBoundingClientRect().left;
    const { left, width } = primary.getBoundingClientRect();
    box.scrollLeft = Math.max(0, left - boxLeft + box.scrollLeft - (box.clientWidth - width) / 2);
  }, []);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
