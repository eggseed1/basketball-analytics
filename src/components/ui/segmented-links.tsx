import Link from "next/link";

import { cn } from "@/lib/utils";
import {
  segmentedItemActiveClassName,
  segmentedItemClassName,
  segmentedItemIdleClassName,
  segmentedTrackClassName,
} from "@/components/ui/segmented-style";

type LinkOption = { id: string; label: string; href: string };

/** URL-driven twin of SegmentedControl for server-rendered filters. */
export function SegmentedLinks({
  label,
  value,
  options,
  size = "md",
  className,
}: {
  label: string;
  value: string;
  options: LinkOption[];
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(segmentedTrackClassName, size === "sm" && "p-0.5", className)}
    >
      {options.map((opt) => {
        const active = value === opt.id;
        return (
          <Link
            key={opt.id}
            href={opt.href}
            scroll={false}
            role="tab"
            aria-selected={active}
            className={cn(
              segmentedItemClassName,
              size === "sm" ? "px-2.5 py-1 type-caption" : "px-3 py-1.5 type-body-sm",
              active ? segmentedItemActiveClassName : segmentedItemIdleClassName
            )}
          >
            {opt.label}
          </Link>
        );
      })}
    </div>
  );
}
