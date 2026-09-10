"use client";

import { type ReactNode } from "react";

import { MetricHelp } from "@/components/learn/metric-help";
import { conceptIdForStatLabel } from "@/lib/learn-glossary-bridge";

/**
 * Hover help for stat labels. Routes through the Learn registry when possible.
 */
export function StatTooltip({
  stat,
  children,
  className,
  side: _side = "bottom",
  nestable = false,
}: {
  /** Short label or metric key, e.g. "USG%" or "usagePct". */
  stat: string;
  children: ReactNode;
  className?: string;
  side?: "top" | "bottom";
  nestable?: boolean;
}) {
  const conceptId = conceptIdForStatLabel(stat);
  if (!conceptId) {
    return <>{children}</>;
  }

  return (
    <MetricHelp
      conceptId={conceptId}
      className={className}
      nestable={nestable}
    >
      {children}
    </MetricHelp>
  );
}
