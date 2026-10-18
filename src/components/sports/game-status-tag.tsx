import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Status chip on a game card. Always small caps, never a full pill. */
export function GameStatusTag({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "live";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[4px] px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-[0.06em]",
        tone === "live"
          ? "bg-[#22703d] text-white"
          : "bg-foreground/[0.06] text-foreground/75",
        className
      )}
    >
      {children}
    </span>
  );
}
