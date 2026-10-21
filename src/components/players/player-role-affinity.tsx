import type { PlayerRoleMixEntry } from "@/lib/player-role";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

/**
 * Horizontal affinity bars for the soft style mix.
 * Winner is emphasized; runners show how close the second/third looks.
 */
export function PlayerRoleAffinity({
  mix,
  activeId,
  className,
}: {
  mix: PlayerRoleMixEntry[];
  activeId?: string | null;
  className?: string;
}) {
  if (mix.length < 2) return null;
  const peak = Math.max(...mix.map((entry) => entry.weight), 0.01);

  return (
    <ul
      className={cn("flex flex-col gap-1.5", className)}
      aria-label="Style affinity"
    >
      {mix.map((entry) => {
        const active = entry.id === activeId || (!activeId && entry === mix[0]);
        const width = Math.max(6, (entry.weight / peak) * 100);
        return (
          <li key={entry.id} className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                type.caption,
                "w-[7.5rem] shrink-0 truncate sm:w-36",
                active ? "font-semibold text-foreground" : "text-muted-foreground"
              )}
            >
              {entry.phrase}
            </span>
            <div className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-foreground/[0.06]">
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-500 ease-out",
                  active ? "bg-foreground/70" : "bg-foreground/25"
                )}
                style={{ width: `${width}%` }}
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
