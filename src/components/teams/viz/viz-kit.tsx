import type { CSSProperties, ReactNode } from "react";

import { type } from "@/lib/design-system";
import { formatNumber } from "@/lib/format";
import { teamChartColor } from "@/lib/nba-brand";
import { cn } from "@/lib/utils";

export const WIN = "var(--data-positive)";
export const LOSS = "var(--data-negative)";

/** Team color for both surfaces; `[data-viz]` picks the one for the theme. */
export function vizAccentStyle(teamKey?: string | null): CSSProperties {
  if (!teamKey) return {};
  return {
    "--viz-accent-light": teamChartColor(teamKey, { surface: "light" }).color,
    "--viz-accent-dark": teamChartColor(teamKey, { surface: "dark" }).color,
  } as CSSProperties;
}

export function signed(value: number, digits = 1): string {
  if (value === 0) return formatNumber(0, digits);
  return `${value > 0 ? "+" : "−"}${formatNumber(Math.abs(value), digits)}`;
}

export function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

export function lastName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  const tail = parts[parts.length - 1]!;
  return /^(jr\.?|sr\.?|ii|iii|iv)$/i.test(tail) && parts.length > 2
    ? `${parts[parts.length - 2]} ${tail}`
    : tail;
}

/** A tick step near `span / target` that lands on 1, 2, 2.5 or 5 × 10^n. */
export function niceStep(span: number, target = 5): number {
  const raw = span / Math.max(1, target);
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const norm = raw / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return step * mag;
}

export function ticks(lo: number, hi: number, target = 5): number[] {
  const step = niceStep(hi - lo, target);
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) {
    out.push(Number(v.toFixed(6)));
  }
  return out;
}

export function VizCard({
  title,
  subtitle,
  aside,
  footnote,
  accentKey,
  className,
  label,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  aside?: ReactNode;
  footnote?: ReactNode;
  accentKey?: string | null;
  className?: string;
  label?: string;
  children: ReactNode;
}) {
  return (
    <section
      data-viz
      aria-label={label ?? title}
      style={vizAccentStyle(accentKey)}
      className={cn("sports-card flex flex-col gap-4 p-4 sm:p-5", className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className={type.heading}>{title}</h3>
          {subtitle ? (
            <p className={cn(type.bodySm, "mt-1 max-w-prose text-muted-foreground")}>
              {subtitle}
            </p>
          ) : null}
        </div>
        {aside}
      </div>
      {children}
      {footnote ? (
        <p className={cn(type.caption, "text-muted-foreground")}>{footnote}</p>
      ) : null}
    </section>
  );
}

/** Small legend chip: a swatch and its label. */
export function LegendSwatch({
  color,
  label,
  shape = "square",
  outline,
}: {
  color: string;
  label: string;
  shape?: "square" | "dot" | "line";
  outline?: boolean;
}) {
  return (
    <span className={cn(type.caption, "inline-flex items-center gap-1.5 text-muted-foreground")}>
      <span
        aria-hidden
        className={cn(
          "inline-block shrink-0",
          shape === "dot" && "h-2.5 w-2.5 rounded-full",
          shape === "square" && "h-2.5 w-2.5 rounded-[3px]",
          shape === "line" && "h-0.5 w-4 rounded-full"
        )}
        style={
          outline
            ? { boxShadow: `inset 0 0 0 1.5px ${color}` }
            : { background: color }
        }
      />
      {label}
    </span>
  );
}
