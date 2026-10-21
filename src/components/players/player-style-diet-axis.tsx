import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

/**
 * Inside → perimeter continuum with the player's diet marked.
 */
export function PlayerStyleDietAxis({
  position,
  label,
  className,
}: {
  /** 0–1, inside to perimeter. */
  position: number;
  label: string;
  className?: string;
}) {
  const pct = Math.max(2, Math.min(98, position * 100));

  return (
    <figure className={cn("flex min-w-0 flex-col gap-2", className)}>
      <figcaption className={cn(type.caption, "font-semibold text-foreground")}>
        Shot diet
      </figcaption>
      <p className={cn(type.caption, "text-muted-foreground")}>{label}</p>
      <div className="relative mt-1 h-2.5 w-full overflow-hidden rounded-full bg-foreground/[0.06]">
        <div
          aria-hidden
          className="absolute inset-0 opacity-80"
          style={{
            background:
              "linear-gradient(90deg, color-mix(in oklab, var(--foreground) 35%, transparent), color-mix(in oklab, var(--foreground) 8%, transparent) 45%, color-mix(in oklab, var(--foreground) 40%, transparent))",
          }}
        />
        <div
          className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-foreground shadow-sm"
          style={{ left: `${pct}%` }}
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
