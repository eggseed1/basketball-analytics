"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { ReactNode } from "react";

import { MetricHelp } from "@/components/learn/metric-help";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * Full-cell sortable column header - large hit target, works inside
 * horizontally scrolled boards.
 * Optional MetricHelp sits beside the sort control (not nested in the button).
 */
export function SortableTableHead({
  children,
  active,
  dir,
  onClick,
  align = "right",
  sticky,
  title,
  className,
  helpConceptId,
  rowSpan,
  colSpan,
}: {
  children: ReactNode;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
  align?: "left" | "right";
  sticky?: boolean;
  title?: string;
  className?: string;
  /** Canonical Learn concept for header-level explanation. */
  helpConceptId?: string | null;
  rowSpan?: number;
  colSpan?: number;
}) {
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  const icon = (
    <Icon
      className={cn(
        "size-3.5 shrink-0",
        active
          ? "opacity-100"
          : "opacity-0 group-hover:opacity-45 group-focus-visible:opacity-45"
      )}
      aria-hidden
    />
  );
  const sortControl = (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "group flex h-10 items-center gap-1 text-[12px] font-semibold uppercase tracking-[0.06em] transition-colors",
        active
          ? "text-foreground"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {align === "right" ? icon : null}
      {!helpConceptId ? <span>{children}</span> : null}
      {align === "left" ? icon : null}
      <span className="sr-only">
        {active
          ? `Sorted ${dir === "asc" ? "ascending" : "descending"}`
          : "Sort"}
      </span>
    </button>
  );

  return (
    <TableHead
      rowSpan={rowSpan}
      colSpan={colSpan}
      className={cn(
        "h-auto p-0",
        sticky && "board-sticky-frost sticky left-0 z-30",
        className
      )}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <div
        className={cn(
          "flex h-10 w-full min-w-max items-center gap-1 px-2",
          align === "right" ? "justify-end" : "justify-start"
        )}
      >
        {align === "right" ? sortControl : null}
        {helpConceptId ? (
          <MetricHelp
            conceptId={helpConceptId}
            labelClassName="text-[12px] font-semibold uppercase tracking-[0.06em]"
          >
            {children}
          </MetricHelp>
        ) : null}
        {align === "left" ? sortControl : null}
      </div>
    </TableHead>
  );
}
