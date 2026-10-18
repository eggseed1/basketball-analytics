import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

/** Trailing mark on a text link. Nudges on hover. Not a text arrow. */
export function LinkCue({
  direction = "forward",
  className,
  strokeWidth = 2.25,
}: {
  direction?: "forward" | "back";
  className?: string;
  strokeWidth?: number;
}) {
  const Icon = direction === "back" ? ChevronLeft : ChevronRight;
  return (
    <Icon
      data-motion-arrow={direction === "back" ? "back" : ""}
      aria-hidden
      strokeWidth={strokeWidth}
      className={cn("size-3.5 shrink-0", className)}
    />
  );
}
