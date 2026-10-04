import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

function scorePct(score: number) {
  return `${Math.round(((score + 1) / 2) * 100)}%`;
}

/** Scores are −1..1 but shown as 0–100%, so one score unit is 50 percentage points. */
function gapLabel(gap: number) {
  const pts = Math.round(Math.abs(gap) * 50);
  return gap >= 0 ? `Fans +${pts} pts vs media` : `Fans −${pts} pts vs media`;
}

/**
 * Per-player fan − media gap callout. Lanes stay separate — never blended.
 */
export function SentimentFanMediaGap({
  fanScore,
  mediaScore,
  minAbsGap = 0.08,
  className,
}: {
  fanScore: number;
  mediaScore: number;
  minAbsGap?: number;
  className?: string;
}) {
  const gap = Math.round((fanScore - mediaScore) * 100) / 100;
  const absGap = Math.abs(gap);
  if (absGap < minAbsGap) return null;

  const fansWarmer = gap >= 0;

  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2",
        fansWarmer
          ? "border-positive/25 bg-positive/5"
          : "border-negative/25 bg-negative/5",
        className
      )}
    >
      <p className={cn(type.bodySm, "font-semibold")}>
        Fan vs media gap · {gapLabel(gap)}
      </p>
      <p className={cn(type.caption, "mt-0.5 text-muted-foreground")}>
        Fan lane {scorePct(fanScore)} · Media lane {scorePct(mediaScore)}.{" "}
        {fansWarmer
          ? "Fans are warmer than media on this player right now."
          : "Fans are cooler than media, a common setup for overrated-player discourse."}
      </p>
    </div>
  );
}
