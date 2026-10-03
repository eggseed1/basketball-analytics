import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { type } from "@/lib/design-system";

/**
 * Collapsed method and source notes. The caveats stay on the page, one click
 * away, so the data is the first thing a reader sees.
 */
export function MoreInfo({
  summary = "How this works",
  children,
  className,
  bodyClassName,
}: {
  summary?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <details data-slot="more-info" className={cn("group/more-info", className)}>
      <summary
        className={cn(
          type.caption,
          "inline-flex cursor-pointer list-none items-center gap-1 font-semibold text-muted-foreground underline-offset-2 hover:text-foreground hover:underline [&::-webkit-details-marker]:hidden",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        )}
      >
        <ChevronRight
          aria-hidden
          className="size-3 shrink-0 transition-transform group-open/more-info:rotate-90"
        />
        {summary}
      </summary>
      <div
        className={cn(
          type.caption,
          "mt-1.5 flex max-w-3xl flex-col gap-1.5 text-muted-foreground",
          bodyClassName
        )}
      >
        {children}
      </div>
    </details>
  );
}
