import type { MovementEvidenceClass, MovementClaimState } from "@/movement-center/types";
import { movementStateLabel } from "@/movement-center/cluster-state";
import { evidenceClassLabel } from "@/movement-center/scoring";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

const CLASS_STYLES: Record<MovementEvidenceClass, string> = {
  reported:
    "border-emerald-600/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
  rumored:
    "border-amber-600/40 bg-amber-500/10 text-amber-900 dark:text-amber-300",
  speculative:
    "border-border bg-muted/50 text-muted-foreground",
};

const STATE_STYLES: Partial<Record<MovementClaimState, string>> = {
  completed:
    "border-sky-600/45 bg-sky-500/12 text-sky-900 dark:text-sky-200",
  official:
    "border-emerald-600/45 bg-emerald-500/12 text-emerald-900 dark:text-emerald-200",
  denied:
    "border-rose-600/40 bg-rose-500/10 text-rose-900 dark:text-rose-300",
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
          "border-border/70 bg-white/40 text-muted-foreground",
        className
      )}
    >
      {label}
    </span>
  );
}
