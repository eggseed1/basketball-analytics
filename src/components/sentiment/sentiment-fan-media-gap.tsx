import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

function scorePct(score: number) {
  return `${Math.round(((score + 1) / 2) * 100)}%`;
}

function gapLabel(gap: number) {
  const pts = Math.round(Math.abs(gap) * 100);
  return gap >= 0 ? `Fans +${pts} vs media` : `Fans −${pts} vs media`;
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
          ? "border-emerald-600/25 bg-emerald-500/5"
          : "border-rose-600/25 bg-rose-500/5",
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
          : "Fans are cooler than media — a common setup for overrated-player discourse."}
      </p>
    </div>
  );
}
