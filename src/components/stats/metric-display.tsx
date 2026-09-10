import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { type } from "@/lib/design-system";
import { Badge } from "@/components/ui/badge";
import { Surface } from "@/components/ui/surface";

export function StatLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        type.caption,
        "font-semibold uppercase tracking-wide text-muted-foreground",
        className
      )}
    >
      {children}
    </p>
  );
}

export function StatValue({
  children,
  size = "md",
  className,
}: {
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  return (
    <p
      className={cn(
        "tabular-nums tracking-tight text-foreground",
        size === "sm" && type.body,
        size === "md" && type.title2,
        size === "lg" && type.title1,
        size === "xl" && type.displayLg,
        "font-semibold",
        className
      )}
    >
      {children}
    </p>
  );
}

export function StatDelta({
  value,
  label,
  className,
}: {
  value: number | string;
  label?: string;
  className?: string;
}) {
  const numeric =
    typeof value === "number"
      ? value
      : Number(String(value).replace(/[^0-9.+-]/g, ""));
  const tone =
    Number.isFinite(numeric) && numeric > 0
      ? "text-positive"
      : Number.isFinite(numeric) && numeric < 0
        ? "text-negative"
        : "text-muted-foreground";
  const prefix =
    typeof value === "number"
      ? value > 0
        ? "+"
        : ""
      : "";

  return (
    <p className={cn(type.caption, "tabular-nums font-medium", tone, className)}>
      {prefix}
      {value}
      {label ? <span className="ml-1 font-normal text-muted-foreground">{label}</span> : null}
    </p>
  );
}

export function StatRank({
  rank,
  of,
  className,
}: {
  rank: number | string;
  of?: number | string;
  className?: string;
}) {
  return (
    <p className={cn(type.caption, "tabular-nums text-muted-foreground", className)}>
      {typeof rank === "number" ? `${rank}${ordinal(rank)}` : rank}
      {of != null ? ` of ${of}` : ""}
    </p>
  );
}

function ordinal(n: number) {
  const v = n % 100;
  if (v >= 11 && v <= 13) return "th";
  switch (n % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

export function PercentileBadge({
  percentile,
  className,
}: {
  percentile: number;
  className?: string;
}) {
  const p = Math.max(0, Math.min(100, Math.round(percentile)));
  const variant =
    p >= 90 ? "elite" : p >= 70 ? "positive" : p >= 40 ? "neutral" : "info";
  return (
    <Badge variant={variant} size="sm" className={cn("tabular-nums", className)}>
      {p}th %ile
    </Badge>
  );
}

export function MetricCard({
  label,
  value,
  rank,
  percentile,
  delta,
  className,
}: {
  label: string;
  value: ReactNode;
  rank?: number | string;
  percentile?: number;
  delta?: number | string;
  className?: string;
}) {
  return (
    <Surface
      variant="subtle"
      padding="sm"
      className={cn("flex min-w-0 flex-col gap-1", className)}
    >
      <StatLabel>{label}</StatLabel>
      <StatValue size="md">{value}</StatValue>
      <div className="flex flex-wrap items-center gap-2">
        {rank != null ? <StatRank rank={rank} /> : null}
        {percentile != null ? <PercentileBadge percentile={percentile} /> : null}
        {delta != null ? <StatDelta value={delta} /> : null}
      </div>
    </Surface>
  );
}

export function StatGroup({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6",
        className
      )}
    >
      {children}
    </div>
  );
}
