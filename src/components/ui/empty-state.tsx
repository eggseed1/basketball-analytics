import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";
import { type } from "@/lib/design-system";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  compact = false,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
  className?: string;
}) {
  return (
    <Surface
      variant={compact ? "flat" : "subtle"}
      padding={compact ? "sm" : "md"}
      className={cn(
        "flex flex-col items-center justify-center gap-2 text-center",
        compact ? "py-6" : "py-10",
        className
      )}
    >
      {icon ? (
        <div className="text-muted-foreground [&_svg]:size-5">{icon}</div>
      ) : null}
      <p className={cn(compact ? type.bodySm : type.title, "font-semibold")}>
        {title}
      </p>
      {description ? (
        <p className={cn(type.bodySm, "max-w-md text-muted-foreground")}>
          {description}
        </p>
      ) : null}
      {actionLabel && onAction ? (
        <Button size="sm" variant="secondary" onClick={onAction} className="mt-1">
          {actionLabel}
        </Button>
      ) : null}
    </Surface>
  );
}

export function Skeleton({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "animate-pulse rounded-[var(--radius-md)] bg-[color-mix(in_oklab,var(--foreground)_8%,transparent)]",
        className
      )}
      {...props}
    />
  );
}

export function InlineError({
  title = "Something went wrong",
  description,
  className,
}: {
  title?: string;
  description?: string;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-[var(--radius-md)] border border-[color-mix(in_oklab,var(--accent-negative)_28%,transparent)] bg-[color-mix(in_oklab,var(--accent-negative)_8%,transparent)] px-3 py-2",
        className
      )}
    >
      <p className={cn(type.bodySm, "font-semibold text-[var(--accent-negative)]")}>
        {title}
      </p>
      {description ? (
        <p className={cn(type.caption, "mt-0.5 text-muted-foreground")}>
          {description}
        </p>
      ) : null}
    </div>
  );
}
