import type { MovementEvidenceClass, MovementClaimState } from "@/movement-center/types";
import { movementStateLabel } from "@/movement-center/cluster-state";
import { evidenceClassLabel } from "@/movement-center/scoring";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

const CLASS_STYLES: Record<MovementEvidenceClass, string> = {
  reported:
    "border-positive/40 bg-positive/10 text-positive",
  rumored:
    "border-amber-600/40 bg-amber-500/10 text-amber-900 dark:text-amber-300",
  speculative:
    "border-border bg-muted/50 text-muted-foreground",
};

const STATE_STYLES: Partial<Record<MovementClaimState, string>> = {
  completed:
    "border-sky-600/45 bg-sky-500/12 text-sky-900 dark:text-sky-200",
  official:
    "border-positive/45 bg-positive/12 text-positive",
  fell_through:
    "border-orange-600/40 bg-orange-500/10 text-orange-900 dark:text-orange-200",
  denied:
    "border-negative/40 bg-negative/10 text-negative",
  retracted:
    "border-border bg-muted/60 text-muted-foreground",
  expired:
    "border-border bg-muted/50 text-muted-foreground",
};

export function MovementEvidenceBadge({
  evidenceClass,
  className,
}: {
  evidenceClass: MovementEvidenceClass;
  className?: string;
}) {
  return (
    <span
      className={cn(
        type.caption,
        "inline-flex rounded-md border px-1.5 py-0.5 font-semibold uppercase tracking-wide",
        CLASS_STYLES[evidenceClass],
        className
      )}
    >
      {evidenceClassLabel(evidenceClass)}
    </span>
  );
}

export function MovementStateBadge({
  state,
  className,
}: {
  state: MovementClaimState;
  className?: string;
}) {
  const label = movementStateLabel(state);
  if (!label) return null;
  return (
    <span
      className={cn(
        type.caption,
        "inline-flex rounded-md border px-1.5 py-0.5 font-semibold uppercase tracking-wide",
        STATE_STYLES[state] ??
          "border-border/70 frost-surface text-muted-foreground",
        className
      )}
    >
      {label}
    </span>
  );
}
