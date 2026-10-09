"use client";

import type { ReactNode } from "react";

import {
  SnapLayer,
  useHoverValue,
  useLingeringMark,
  type HoverMark,
  type HoverStore,
} from "@/components/charts/hover-layer";

export type PlotBox = { left: number; top: number; width: number; height: number };

/** One snapped line at one date: the line, the point on it and its neighbors. */
export type RaceHover = HoverMark & {
  id: string;
  label: string;
  color: string;
  /** The hovered line's path, copied from the chart so it can be redrawn on top. */
  d: string | null;
  plot: PlotBox;
  /** Pixel rows of the lines just above and below at this date. */
  guides: number[];
};

export const sameRaceHover = (a: RaceHover, b: RaceHover) => a.key === b.key;

/** Class for a Recharts `<Line>` so its path can be found by id. */
export function raceLineClass(id: string): string {
  return `race-line-${id.replace(/[^\w-]/g, "_")}`;
}

export function chartSvg(root: HTMLElement | null): SVGSVGElement | null {
  const svg = root?.querySelector("svg.recharts-surface");
  return svg instanceof SVGSVGElement ? svg : null;
}

export function plotBox(svg: SVGSVGElement): PlotBox | null {
  const rect = svg.querySelector("clipPath rect");
  if (!rect) return null;
  const box = {
    left: Number(rect.getAttribute("x")),
    top: Number(rect.getAttribute("y")),
    width: Number(rect.getAttribute("width")),
    height: Number(rect.getAttribute("height")),
  };
  return Object.values(box).every(Number.isFinite) && box.height > 0 ? box : null;
}

export function pointerSvgY(svg: SVGSVGElement, clientX: number, clientY: number): number | null {
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  return point.matrixTransform(ctm.inverse()).y;
}

/** Pixel row of `value` on a linear y axis that spans the plot with no padding. */
export function plotY(plot: PlotBox, domain: [number, number], value: number): number {
  const span = domain[1] - domain[0] || 1;
  return plot.top + ((domain[1] - value) / span) * plot.height;
}

export function linePath(svg: SVGSVGElement, id: string): string | null {
  return svg.querySelector(`.${raceLineClass(id)} path.recharts-line-curve`)?.getAttribute("d") ?? null;
}

/**
 * Hover for race charts. The hovered line is redrawn on top with a soft halo,
 * a guide follows the date, dashed guides mark the neighbors, and one label
 * rides the point. The lines underneath never re-render or dim.
 */
export function RaceHoverLayer({
  store,
  render,
}: {
  store: HoverStore<RaceHover>;
  render: (hover: RaceHover) => ReactNode;
}) {
  const hover = useHoverValue(store);
  const { at, open, glide } = useLingeringMark(hover);
  if (!at) return null;
  const state = { "data-open": open || undefined, "data-glide": glide || undefined };
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-[1]">
      <svg className="absolute inset-0 size-full overflow-visible">
        {at.d ? (
          <g key={at.id} className="chart-race-line" {...state}>
            <path
              d={at.d}
              fill="none"
              stroke={at.color}
              strokeOpacity={0.22}
              strokeWidth={9}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={at.d}
              fill="none"
              stroke={at.color}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        ) : null}
      </svg>
      <span
        {...state}
        className="chart-race-guide absolute w-px bg-foreground/25"
        style={{ left: at.x, top: at.plot.top, height: at.plot.height }}
      />
      {at.guides.map((y, i) => (
        <span
          key={i}
          {...state}
          className="chart-race-guide absolute h-0 border-t border-dashed border-foreground/30"
          style={{ left: at.plot.left, width: at.plot.width, top: y }}
        />
      ))}
      <SnapLayer mark={hover} color={(m) => m.color} marker="dot" render={render} />
    </div>
  );
}
