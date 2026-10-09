"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FocusEvent,
  type ReactNode,
} from "react";

import { ChartTooltipSurface } from "@/components/charts/chart-tooltip";
import { cn } from "@/lib/utils";

/**
 * Hover state that lives outside React state, so a pointer move re-renders
 * only the layer that subscribes to it. Recharts trees with hundreds of marks
 * never re-render while the pointer moves across them.
 */
export type HoverStore<T> = {
  get(): T | null;
  set(next: T | null): void;
  subscribe(listener: () => void): () => void;
};

export function createHoverStore<T>(same: (a: T, b: T) => boolean = Object.is): HoverStore<T> {
  let value: T | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next) {
      if (next === value || (next != null && value != null && same(next, value))) return;
      value = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function useHoverStore<T>(same?: (a: T, b: T) => boolean): HoverStore<T> {
  const [store] = useState(() => createHoverStore<T>(same));
  return store;
}

export function useHoverValue<T>(store: HoverStore<T>): T | null {
  return useSyncExternalStore(store.subscribe, store.get, () => null);
}

/** A mark inside the chart box, in CSS px from the box's top-left corner. */
export type HoverMark = { key: string; x: number; y: number; width: number; height: number };

export const sameMarkKey = (a: HoverMark, b: HoverMark) => a.key === b.key;

/** Pointer distance (px) that still snaps to the nearest dot. */
const SNAP_PX = 36;

function markOf(dot: SVGCircleElement, svgRect: DOMRect, box: HTMLElement): HoverMark {
  const boxRect = box.getBoundingClientRect();
  return {
    key: dot.dataset.dotKey ?? "",
    x: dot.cx.baseVal.value + svgRect.left - boxRect.left,
    y: dot.cy.baseVal.value + svgRect.top - boxRect.top,
    width: boxRect.width,
    height: boxRect.height,
  };
}

/** Closest `circle[data-dot-key]` to the pointer, so a near miss still lands. */
export function nearestDotMark(box: HTMLElement, clientX: number, clientY: number): HoverMark | null {
  const svg = box.querySelector<SVGSVGElement>("svg.recharts-surface");
  if (!svg) return null;
  const svgRect = svg.getBoundingClientRect();
  const mx = clientX - svgRect.left;
  const my = clientY - svgRect.top;
  let best: SVGCircleElement | null = null;
  let bestDistance = SNAP_PX * SNAP_PX;
  for (const dot of svg.querySelectorAll<SVGCircleElement>("circle[data-dot-key]")) {
    const distance = (dot.cx.baseVal.value - mx) ** 2 + (dot.cy.baseVal.value - my) ** 2;
    // Ties go to the later dot, which paints on top.
    if (distance <= bestDistance) {
      bestDistance = distance;
      best = dot;
    }
  }
  return best ? markOf(best, svgRect, box) : null;
}

/** The dot drawn for `key`, for hovers that start outside the chart. */
export function dotMarkByKey(box: HTMLElement, keys: string[]): HoverMark | null {
  const svg = box.querySelector<SVGSVGElement>("svg.recharts-surface");
  if (!svg) return null;
  for (const key of keys) {
    const dot = svg.querySelector<SVGCircleElement>(`circle[data-dot-key="${CSS.escape(key)}"]`);
    if (dot) return markOf(dot, svg.getBoundingClientRect(), box);
  }
  return null;
}

/**
 * Lets a list beside a chart light up the chart's mark for a row. The chart
 * attaches a target; rows call `show(id)` and `clear()`.
 */
export type HoverLinkTarget = { show(id: string): void; clear(): void };

export type HoverLink = {
  attach(target: HoverLinkTarget | null): void;
  show(id: string): void;
  clear(): void;
};

export function createHoverLink(): HoverLink {
  let target: HoverLinkTarget | null = null;
  return {
    attach(next) {
      target = next;
    },
    show: (id) => target?.show(id),
    clear: () => target?.clear(),
  };
}

export function useHoverLink(): HoverLink {
  const [link] = useState(createHoverLink);
  return link;
}

export const HoverLinkContext = createContext<HoverLink | null>(null);

/** Attach a chart to `link` (or the nearest provided one) for as long as it is mounted. */
export function useHoverLinkTarget(link: HoverLink | null | undefined, target: HoverLinkTarget) {
  const fromContext = useContext(HoverLinkContext);
  const resolved = link ?? fromContext;
  const latest = useRef(target);
  useEffect(() => {
    latest.current = target;
  });
  useEffect(() => {
    if (!resolved) return;
    resolved.attach({
      show: (id) => latest.current.show(id),
      clear: () => latest.current.clear(),
    });
    return () => resolved.attach(null);
  }, [resolved]);
}

/** Pointer and focus handlers for a list row that mirrors a chart mark. */
export function hoverLinkRowProps(link: HoverLink | null | undefined, id: string) {
  if (!link) return {};
  return {
    onPointerEnter: () => link.show(id),
    onPointerLeave: () => link.clear(),
    onFocus: () => link.show(id),
    onBlur: (event: FocusEvent<HTMLElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) link.clear();
    },
  };
}

/**
 * Keeps the last mark while the layer fades out, and reports whether the
 * layer should glide (it was already open) or appear in place.
 */
export function useLingeringMark<M extends HoverMark>(mark: M | null) {
  const [state, setState] = useState<{ mark: M | null; last: M | null; glide: boolean }>({
    mark,
    last: mark,
    glide: false,
  });
  if (state.mark !== mark) {
    setState({ mark, last: mark ?? state.last, glide: mark != null && state.mark != null });
  }
  return { at: mark ?? state.last, open: mark != null, glide: state.glide };
}

function tipTranslate(m: HoverMark, gap: number): string {
  const x = m.x < 130 ? `${gap}px` : m.x > m.width - 130 ? `calc(-100% - ${gap}px)` : "-50%";
  const y = m.y < 110 ? `${gap + 2}px` : `calc(-100% - ${gap + 2}px)`;
  return `${x} ${y}`;
}

/**
 * The marker and label for one snapped mark. It glides from mark to mark
 * while open and fades in place when it opens or closes. Nothing else in the
 * chart changes, so the marks around it keep full color.
 */
export function SnapLayer<M extends HoverMark>({
  mark,
  color,
  marker = "ring",
  size,
  render,
}: {
  mark: M | null;
  color: (m: M) => string;
  marker?: "ring" | "dot" | "none";
  /** Marker diameter in px; rings default to 20, dots to 12. */
  size?: number;
  render: (m: M) => ReactNode;
}) {
  const { at, open, glide } = useLingeringMark(mark);
  if (!at) return null;
  const fill = color(at);
  const diameter = size ?? (marker === "ring" ? 20 : 12);
  const state = { "data-open": open || undefined, "data-glide": glide || undefined };
  return (
    <>
      {marker !== "none" ? (
        <span
          aria-hidden
          {...state}
          className={cn(
            "chart-snap-mark pointer-events-none absolute z-[2] rounded-full border-2",
            marker === "dot" && "border-background"
          )}
          style={{
            left: at.x,
            top: at.y,
            width: diameter,
            height: diameter,
            ...(marker === "ring"
              ? { borderColor: fill, boxShadow: `0 0 0 3px color-mix(in oklab, ${fill} 24%, transparent)` }
              : { background: fill, boxShadow: `0 0 0 4px color-mix(in oklab, ${fill} 26%, transparent)` }),
          }}
        />
      ) : null}
      <ChartTooltipSurface
        aria-hidden
        {...state}
        className="chart-snap-tip pointer-events-none absolute z-[3]"
        style={{ left: at.x, top: at.y, translate: tipTranslate(at, diameter / 2 + 6) }}
      >
        {render(at)}
      </ChartTooltipSurface>
    </>
  );
}

/** SnapLayer driven by a store, so only this layer re-renders on pointer moves. */
export function StoreSnapLayer<M extends HoverMark>({
  store,
  ...rest
}: {
  store: HoverStore<M>;
  color: (m: M) => string;
  marker?: "ring" | "dot" | "none";
  size?: number;
  render: (m: M) => ReactNode;
}) {
  return <SnapLayer mark={useHoverValue(store)} {...rest} />;
}
