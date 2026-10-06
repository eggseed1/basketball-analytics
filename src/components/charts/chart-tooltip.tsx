import { forwardRef, type HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

/**
 * The one hover overlay for every chart: see-through liquid glass, compact,
 * 12px type (`.chart-tooltip` in globals.css). Callers only position it.
 */
export const ChartTooltipSurface = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function ChartTooltipSurface({ className, ...rest }, ref) {
    return <div ref={ref} role="tooltip" {...rest} className={cn("chart-tooltip", className)} />;
  }
);
