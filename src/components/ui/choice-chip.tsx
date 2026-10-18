import type { HTMLAttributes, ReactNode } from "react";

import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

/** Quiet track used by filter groups and search fields. */
export const choiceTrackClassName =
  "flex min-w-0 items-center gap-0.5 rounded-[6px] border border-border/25 bg-foreground/[0.035] p-0.5";

/** Borderless field that sits inside a choice track. */
export const searchFieldClassName =
  "h-7 w-full min-w-0 border-0 bg-transparent px-2 text-[12px] font-semibold text-foreground shadow-none outline-none placeholder:font-medium placeholder:text-muted-foreground focus-visible:border-transparent focus-visible:ring-0 md:text-[12px]";

export function ChoiceTrack({
  children,
  className,
  scrollable = false,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  scrollable?: boolean;
} & Omit<HTMLAttributes<HTMLDivElement>, "children" | "className">) {
  return (
    <div
      className={cn(
        choiceTrackClassName,
        scrollable &&
          "w-full max-w-full flex-nowrap touch-scroll-x overflow-x-auto overflow-y-hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function choiceChipClassName(active?: boolean, disabled?: boolean) {
  return cn(
    type.caption,
    "rounded-[4px] px-2.5 py-1.5 font-semibold transition-colors",
    active
      ? "bg-[var(--card)] text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.04)] ring-1 ring-border/30"
      : "text-muted-foreground hover:bg-foreground/8 hover:text-foreground",
    disabled && "pointer-events-none opacity-40"
  );
}

export function ChoiceChip({
  active,
  onClick,
  children,
  disabled,
  className,
  ...rest
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
} & Omit<HTMLAttributes<HTMLButtonElement>, "children" | "className" | "onClick">) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={active}
      onClick={onClick}
      className={cn(choiceChipClassName(active, disabled), className)}
      {...rest}
    >
      {children}
    </button>
  );
}
