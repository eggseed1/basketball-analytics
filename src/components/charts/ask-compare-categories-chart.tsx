"use client";

import { useId } from "react";

import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

export type AskCompareCategoryBar = {
  label: string;
  edge: "a" | "b" | "even" | "unavailable";
};

/**
 * Category-edge board for Ask season compare answers.
 */
export function AskCompareCategoriesChart({
  title,
  labelA,
  labelB,
  categories,
  className,
}: {
  title: string;
  labelA: string;
  labelB: string;
  categories: AskCompareCategoryBar[];
  className?: string;
}) {
  const chartId = useId();
  const rows = categories.filter((c) => c.edge !== "unavailable");
  if (rows.length < 2) return null;

  return (
    <figure
      aria-labelledby={`${chartId}-title`}
      className={cn("flex flex-col gap-2", className)}
    >
      <p
        id={`${chartId}-title`}
        className={cn(type.caption, "font-semibold text-muted-foreground")}
      >
        {title}
      </p>
      <ul className="flex flex-col gap-1.5">
        {rows.map((row) => {
          const winner =
            row.edge === "a"
              ? labelA
              : row.edge === "b"
                ? labelB
                : "Even";
          const tone =
            row.edge === "even"
              ? "border-border bg-secondary/40 text-muted-foreground"
              : row.edge === "a"
                ? "border-[color-mix(in_oklab,var(--accent-positive)_35%,transparent)] bg-[color-mix(in_oklab,var(--accent-positive)_12%,transparent)] text-foreground"
                : "border-[color-mix(in_oklab,var(--accent-info)_35%,transparent)] bg-[color-mix(in_oklab,var(--accent-info)_12%,transparent)] text-foreground";
          return (
            <li
              key={row.label}
              className={cn(
                "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border px-3 py-2",
                tone
              )}
            >
              <span className={cn(type.bodySm, "min-w-0 font-semibold")}>
                {row.label}
              </span>
              <span
                className={cn(
                  type.caption,
                  "shrink-0 font-bold tabular-nums tracking-tight"
                )}
              >
                {winner}
              </span>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}
