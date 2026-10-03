import Link from "next/link";

import { cn } from "@/lib/utils";

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
      className={cn(
        "inline-flex max-w-full touch-scroll-x rounded-[var(--radius-lg)] bg-secondary p-1",
        size === "sm" && "p-0.5",
        className
      )}
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
              "shrink-0 rounded-[var(--radius-md)] font-semibold transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              size === "sm" ? "px-2.5 py-1 type-caption" : "px-3 py-1.5 type-body-sm",
              active
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {opt.label}
          </Link>
        );
      })}
    </div>
  );
}
