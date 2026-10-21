import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

/**
 * Inside → perimeter continuum with the player's diet marked.
 * Optional team accents tint the track and marker.
 */
export function PlayerStyleDietAxis({
  position,
  label,
  accent,
  accentB,
  className,
}: {
  /** 0–1, inside to perimeter. */
  position: number;
  label: string;
  accent?: string;
  accentB?: string;
  className?: string;
}) {
  const pct = Math.max(2, Math.min(98, position * 100));
  const a = accent ?? "var(--foreground)";
  const b = accentB ?? accent ?? "var(--foreground)";

  return (
    <figure className={cn("flex min-w-0 flex-col gap-2", className)}>
      <figcaption className={cn(type.caption, "font-semibold text-foreground")}>
        Shot diet
      </figcaption>
      <p className={cn(type.caption, "text-muted-foreground")}>{label}</p>
      <div className="relative mt-1 h-2.5 w-full overflow-hidden rounded-full bg-foreground/[0.06]">
        <div
          aria-hidden
          className="absolute inset-0 opacity-90"
          style={{
            background: `linear-gradient(90deg, color-mix(in oklab, ${a} 55%, transparent), color-mix(in oklab, ${b} 18%, transparent) 48%, color-mix(in oklab, ${b} 60%, transparent))`,
          }}
        />
        <div
          data-motion-mark
          className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background shadow-sm"
          style={{
            left: `${pct}%`,
            background: a,
            ["--mark-from" as string]: "0%",
          }}
        />
      </div>
      <div
        className={cn(
          type.caption,
          "flex justify-between text-muted-foreground"
        )}
      >
        <span>Inside</span>
        <span>Mid</span>
        <span>Perimeter</span>
      </div>
    </figure>
  );
}
