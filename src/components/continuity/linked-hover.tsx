"use client";

import { useRef, type ReactNode } from "react";

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
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const current = useRef<string | null>(null);

  const apply = (key: string | null) => {
    if (key === current.current) return;
    current.current = key;
    const root = ref.current;
    if (!root) return;
    root.toggleAttribute("data-linking", key != null);
    const active = new Set(key?.split(/\s+/) ?? []);
    for (const el of root.querySelectorAll("[data-link-key]")) {
      const keys = el.getAttribute("data-link-key")?.split(/\s+/) ?? [];
      el.toggleAttribute("data-linked", keys.some((k) => active.has(k)));
    }
  };

  return (
    <div
      ref={ref}
      className={className}
      onPointerOver={(event) => {
        const target = event.target instanceof Element ? event.target : null;
        apply(target?.closest("[data-link-key]")?.getAttribute("data-link-key") ?? null);
      }}
      onPointerLeave={() => apply(null)}
      onFocus={(event) => {
        apply(event.target.closest("[data-link-key]")?.getAttribute("data-link-key") ?? null);
      }}
      onBlur={() => apply(null)}
    >
      {children}
    </div>
  );
}
