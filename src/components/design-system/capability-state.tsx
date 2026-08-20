import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Product capability presentation — design-owned chrome, product-owned semantics.
 * Distinguishes Supported / Partial / Unavailable (and empty vs unavailable).
 */
export type CapabilityKind = "supported" | "partial" | "unavailable" | "empty";

const LABELS: Record<CapabilityKind, string> = {
  supported: "Supported",
  partial: "Partial",
  unavailable: "Unavailable",
  empty: "No records",
};

export function CapabilityStateBadge({
  kind,
  label,
  className,
}: {
  kind: CapabilityKind;
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "capability-badge inline-flex items-center rounded-md px-2 py-0.5 text-[12px] font-semibold",
        kind === "supported" && "capability-badge--supported",
        kind === "partial" && "capability-badge--partial",
        kind === "unavailable" && "capability-badge--unavailable",
        kind === "empty" && "capability-badge--empty",
        className
      )}
      data-capability={kind}
    >
      {label ?? LABELS[kind]}
    </span>
  );
}

export function CapabilityStatePanel({
  kind,
  title,
  description,
  className,
  children,
}: {
  kind: Exclude<CapabilityKind, "supported">;
  title: string;
  description?: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "capability-panel sports-card p-4",
        kind === "partial" && "capability-panel--partial",
        kind === "unavailable" && "capability-panel--unavailable",
        kind === "empty" && "capability-panel--empty",
        className
      )}
      data-capability={kind}
      role="status"
    >
      <div className="flex flex-wrap items-center gap-2">
        <CapabilityStateBadge kind={kind} />
        <h3 className="type-title text-foreground">{title}</h3>
      </div>
      {description ? (
        <p className="mt-2 type-body-sm text-muted-foreground">{description}</p>
      ) : null}
      {children}
    </div>
  );
}

/** Null / unavailable cell language — never conflate 0 with unavailable. */
export type NullDisplayKind = "zero" | "dash" | "unavailable" | "unknown";

export function NullDisplay({
  kind,
  className,
}: {
  kind: NullDisplayKind;
  className?: string;
}) {
  const text =
    kind === "zero"
      ? "0"
      : kind === "dash"
        ? "—"
        : kind === "unavailable"
          ? "Unavailable"
          : "Unknown";
  return (
    <span
      className={cn(
        "null-display tabular-nums",
        kind !== "zero" && "text-muted-foreground",
        kind === "unavailable" && "null-display--unavailable",
        kind === "unknown" && "null-display--unknown",
        className
      )}
      data-null-kind={kind}
    >
      {text}
    </span>
  );
}
