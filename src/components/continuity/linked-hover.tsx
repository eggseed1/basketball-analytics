"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

/** Grace period before clearing, so crossing the gap between two items doesn't flash. */
const CLEAR_DELAY_MS = 90;

/**
 * Hovering any `[data-link-key]` inside marks every element that shares a key
 * with `data-linked`, so the same player or bucket lights up in each list,
 * table and chart of the scope at once. Keys are space-separated, so one element
 * can stand for several (a season-to-season change links both seasons). Plain DOM
 * attributes keep server-rendered children free of client state.
 */
export function LinkedHover({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const current = useRef<string | null>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (clearTimer.current) clearTimeout(clearTimer.current);
  }, []);

  const apply = (key: string | null) => {
    if (clearTimer.current) {
      clearTimeout(clearTimer.current);
      clearTimer.current = null;
    }
    if (key === current.current) return;
    current.current = key;
    const root = ref.current;
    if (!root) return;
    const active = new Set(key?.split(/\s+/) ?? []);
    for (const el of root.querySelectorAll("[data-link-key]")) {
      const keys = el.getAttribute("data-link-key")?.split(/\s+/) ?? [];
      el.toggleAttribute("data-linked", keys.some((k) => active.has(k)));
    }
  };

  const clearSoon = () => {
    if (current.current === null || clearTimer.current) return;
    clearTimer.current = setTimeout(() => apply(null), CLEAR_DELAY_MS);
  };

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      onPointerOver={(event) => {
        const target = event.target instanceof Element ? event.target : null;
        const key = target?.closest("[data-link-key]")?.getAttribute("data-link-key") ?? null;
        if (key) apply(key);
        else clearSoon();
      }}
      onPointerLeave={clearSoon}
      onFocus={(event) => {
        apply(event.target.closest("[data-link-key]")?.getAttribute("data-link-key") ?? null);
      }}
      onBlur={() => apply(null)}
    >
      {children}
    </div>
  );
}
