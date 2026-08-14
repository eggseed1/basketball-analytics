"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { ReactNode } from "react";

import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * Full-cell sortable column header - large hit target, works inside
 * horizontally scrolled boards.
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
}: {
  children: ReactNode;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
  align?: "left" | "right";
  sticky?: boolean;
  title?: string;
  className?: string;
}) {
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;

  return (
    <TableHead
      className={cn(
        "h-auto p-0",
        sticky && "sticky left-0 z-30 bg-card",
        className
      )}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        title={title}
        onClick={onClick}
        className={cn(
          "flex h-10 w-full min-w-max items-center gap-1 px-2 text-[11px] font-semibold uppercase tracking-[0.06em] transition-colors",
          align === "right" ? "justify-end" : "justify-start",
          active
            ? "text-foreground"
            : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
        )}
      >
        <span>{children}</span>
        <Icon
          className={cn(
            "size-3.5 shrink-0",
            active ? "opacity-100" : "opacity-45"
          )}
          aria-hidden
        />
      </button>
    </TableHead>
  );
}
