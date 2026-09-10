import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const surfaceVariants = cva("overflow-hidden", {
  variants: {
    variant: {
      flat: "bg-transparent",
      subtle: "material-subtle rounded-[var(--radius-md)]",
      glass: "sports-card",
      elevated: "material-elevated rounded-[var(--radius-lg)]",
      interactive:
        "sports-card transition-[background,box-shadow,border-color] duration-[var(--duration-standard)] ease-[var(--ease-standard)] hover:bg-[color-mix(in_oklab,var(--material-standard-bg),var(--foreground)_4%)]",
    },
    padding: {
      none: "p-0",
      sm: "p-3 sm:p-4",
      md: "p-4 sm:p-5",
      lg: "p-5 sm:p-6",
    },
  },
  defaultVariants: {
    variant: "glass",
    padding: "none",
  },
});

export type SurfaceProps = React.ComponentProps<"div"> &
  VariantProps<typeof surfaceVariants> & {
    as?: "div" | "section" | "article" | "aside";
  };

function Surface({
  className,
  variant,
  padding,
  as: Comp = "div",
  ...props
}: SurfaceProps) {
  return (
    <Comp
      data-slot="surface"
      data-variant={variant ?? "glass"}
      className={cn(surfaceVariants({ variant, padding }), className)}
      {...props}
    />
  );
}

export { Surface, surfaceVariants };
