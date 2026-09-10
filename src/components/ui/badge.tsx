import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-[var(--radius-pill)] border px-2 py-0.5 type-caption font-medium whitespace-nowrap transition-colors",
  {
    variants: {
      variant: {
        neutral:
          "border-border/60 bg-secondary/80 text-secondary-foreground",
        positive:
          "border-[color-mix(in_oklab,var(--accent-positive)_28%,transparent)] bg-[color-mix(in_oklab,var(--accent-positive)_12%,transparent)] text-[var(--accent-positive)]",
        negative:
          "border-[color-mix(in_oklab,var(--accent-negative)_28%,transparent)] bg-[color-mix(in_oklab,var(--accent-negative)_12%,transparent)] text-[var(--accent-negative)]",
        warning:
          "border-[color-mix(in_oklab,var(--accent-warning)_28%,transparent)] bg-[color-mix(in_oklab,var(--accent-warning)_12%,transparent)] text-[var(--accent-warning)]",
        info: "border-[color-mix(in_oklab,var(--accent-info)_28%,transparent)] bg-[color-mix(in_oklab,var(--accent-info)_12%,transparent)] text-[var(--accent-info)]",
        elite:
          "border-[color-mix(in_oklab,var(--accent-elite)_32%,transparent)] bg-[color-mix(in_oklab,var(--accent-elite)_14%,transparent)] text-[var(--accent-elite)]",
        team: "border-[color-mix(in_oklab,var(--team-primary)_35%,transparent)] bg-[var(--team-accent-soft)] text-foreground",
        live: "border-[color-mix(in_oklab,var(--accent-negative)_40%,transparent)] bg-[color-mix(in_oklab,var(--accent-negative)_16%,transparent)] text-[var(--accent-negative)]",
        injury:
          "border-[color-mix(in_oklab,var(--accent-warning)_32%,transparent)] bg-[color-mix(in_oklab,var(--accent-warning)_14%,transparent)] text-[var(--accent-warning)]",
        transaction:
          "border-border/70 bg-muted/70 text-muted-foreground",
        glass: "glass-pill border text-foreground",
      },
      size: {
        sm: "px-1.5 py-0 type-micro",
        md: "px-2 py-0.5 type-caption",
        lg: "px-2.5 py-1 type-body-sm",
      },
    },
    defaultVariants: {
      variant: "neutral",
      size: "md",
    },
  }
);

function Badge({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
