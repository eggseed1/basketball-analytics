"use client";

import { cn } from "@/lib/utils";
import {
  segmentedItemActiveClassName,
  segmentedItemClassName,
  segmentedItemIdleClassName,
  segmentedTrackClassName,
} from "@/components/ui/segmented-style";

type Option<T extends string> = { id: T; label: string; disabled?: boolean };

export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  size = "md",
  className,
}: {
  label?: string;
  value: T;
  options: Array<Option<T>>;
  onChange: (id: T) => void;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {label ? (
        <p className="type-caption font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
      ) : null}
      <div
        role="tablist"
        aria-label={label}
        className={cn(segmentedTrackClassName, size === "sm" && "p-0.5")}
      >
        {options.map((opt) => {
          const active = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="tab"
              aria-selected={active}
              disabled={opt.disabled}
              onClick={() => onChange(opt.id)}
              className={cn(
                segmentedItemClassName,
                "disabled:pointer-events-none disabled:opacity-40",
                size === "sm"
                  ? "px-2.5 py-1 type-caption"
                  : "px-3 py-1.5 type-body-sm",
                active ? segmentedItemActiveClassName : segmentedItemIdleClassName
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
