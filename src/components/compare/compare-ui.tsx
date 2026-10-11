"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import type { ComparisonDimension } from "@/analytics";
import { MetricHelp } from "@/components/learn/metric-help";
import { type } from "@/lib/design-system";
import { conceptIdForColumnLabel } from "@/lib/learn-column-concepts";
import { cn } from "@/lib/utils";

export const SECTION_LABEL = cn(
  type.micro,
  "font-bold uppercase tracking-[0.12em] text-muted-foreground"
);

/** Nested tile inside the glass card: translucent fill, no second blur layer. */
export const FROST_TILE =
  "frost-surface rounded-lg shadow-[inset_0_1px_0_rgb(255_255_255/0.55)] dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.07)]";

/** Quiet capsule track shared by every compare bar. */
export const BAR_TRACK = "overflow-hidden rounded-full bg-foreground/[0.08]";

export function metricLabel(label: string) {
  const conceptId = conceptIdForColumnLabel(label);
  return conceptId ? (
    <MetricHelp conceptId={conceptId}>{label}</MetricHelp>
  ) : (
    label
  );
}

export type DimensionMap = Map<string, ComparisonDimension>;

export function sideValue(
  dims: DimensionMap,
  id: string,
  side: "a" | "b"
): number | null {
  const d = dims.get(id);
  const v = side === "a" ? d?.aValue : d?.bValue;
  return v != null && Number.isFinite(v) ? v : null;
}

export function sideDisplay(
  dims: DimensionMap,
  id: string,
  side: "a" | "b"
): string {
  const d = dims.get(id);
  if (!d) return "—";
  const shown = side === "a" ? d.aDisplay : d.bDisplay;
  return shown && shown !== "-" ? shown : "—";
}

/** Rendered width of a box, so SVG charts can lay text out at real pixel size. */
export function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(Math.round(el.getBoundingClientRect().width));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Round tick values covering [min, max] in about `count` steps. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  const span = max - min;
  if (!(span > 0)) return [min];
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step =
    [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const ticks: number[] = [];
  for (let t = Math.ceil(min / step) * step; t <= max + 1e-9; t += step) {
    ticks.push(Math.round(t * 1e6) / 1e6 + 0);
  }
  return ticks;
}

export function SectionHeading({
  title,
  caption,
  className,
}: {
  title: string;
  caption?: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className={SECTION_LABEL}>{title}</p>
      {caption ? (
        <p className={cn(type.caption, "mt-0.5 text-muted-foreground")}>
          {caption}
        </p>
      ) : null}
    </div>
  );
}
