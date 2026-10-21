import type { PlayerRoleMixEntry } from "@/lib/player-role";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

function mixBarColor(
  index: number,
  active: boolean,
  accent?: string,
  accentB?: string
): string | undefined {
  if (!accent) return undefined;
  const base = index === 0 ? accent : (accentB ?? accent);
  // Winner stays vivid; runners fade so the ranking still reads.
  const strength = active
    ? index === 0
      ? 88
      : 55
    : Math.max(22, 48 - index * 10);
  return `color-mix(in oklab, ${base} ${strength}%, transparent)`;
}

/**
 * Horizontal affinity bars for the soft style mix.
 * Winner is emphasized; runners show how close the second/third looks.
 * Pass team accents for a colored read on Overview Comparisons.
 */
export function PlayerRoleAffinity({
  mix,
  activeId,
  accent,
  accentB,
  className,
}: {
  mix: PlayerRoleMixEntry[];
  activeId?: string | null;
  accent?: string;
  accentB?: string;
  className?: string;
}) {
  if (mix.length < 2) return null;
  const peak = Math.max(...mix.map((entry) => entry.weight), 0.01);
  const colored = Boolean(accent);

  return (
    <ul
      className={cn("flex flex-col gap-2", className)}
      aria-label="Style affinity"
      data-motion-list
    >
      {mix.map((entry, index) => {
        const active = entry.id === activeId || (!activeId && entry === mix[0]);
        const width = Math.max(6, (entry.weight / peak) * 100);
        const fill = mixBarColor(index, active, accent, accentB);
        return (
          <li
            key={entry.id}
            className="flex min-w-0 items-center gap-2.5"
            data-motion-item
          >
            <span
              className={cn(
                type.caption,
                "w-[7.5rem] shrink-0 truncate sm:w-40",
                active ? "font-semibold text-foreground" : "text-muted-foreground"
              )}
            >
              {entry.phrase}
            </span>
            <div className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-foreground/[0.06]">
              <div
                data-motion-bar="x"
                className={cn(
                  "h-full origin-left rounded-full transition-[width] duration-500 ease-out",
                  !colored &&
                    (active ? "bg-foreground/70" : "bg-foreground/25")
                )}
                style={{
                  width: `${width}%`,
                  ...(fill ? { background: fill } : null),
                }}
              />
            </div>
            <span
              className={cn(
                type.caption,
                "w-8 shrink-0 text-right tabular-nums",
                active ? "font-semibold text-foreground" : "text-muted-foreground"
              )}
            >
              {Math.round(entry.weight * 100)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Proportional stacked mix strip — one glance at how the style mass splits.
 */
export function PlayerRoleMixStack({
  mix,
  accent,
  accentB,
  className,
}: {
  mix: PlayerRoleMixEntry[];
  accent?: string;
  accentB?: string;
  className?: string;
}) {
  if (mix.length < 2) return null;
  const total = mix.reduce((sum, entry) => sum + entry.weight, 0) || 1;

  return (
    <div
      className={cn(
        "flex h-2.5 w-full overflow-hidden rounded-full bg-foreground/[0.06]",
        className
      )}
      aria-hidden
      data-motion-bar="x"
    >
      {mix.map((entry, index) => {
        const share = (entry.weight / total) * 100;
        const fill =
          mixBarColor(index, index === 0, accent, accentB) ??
          `color-mix(in oklab, var(--foreground) ${Math.max(18, 60 - index * 14)}%, transparent)`;
        return (
          <div
            key={entry.id}
            className="h-full min-w-[3px] transition-[width] duration-500 ease-out"
            style={{ width: `${share}%`, background: fill }}
            title={`${entry.phrase} · ${Math.round(entry.weight * 100)}%`}
          />
        );
      })}
    </div>
  );
}
