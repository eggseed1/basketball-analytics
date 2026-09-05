import { cn } from "@/lib/utils";

/**
 * Board player label — full name, nowrap.
 * (Compact last-name mode was removed: it fought the freeze-column width
 * measurement and made names unreadable on desktop.)
 */
export function boardCompactPlayerName(fullName: string): string {
  return fullName.trim() || "Player";
}

export function BoardPlayerName({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <span
      className={cn("board-name whitespace-nowrap", className)}
      title={name}
    >
      {name}
    </span>
  );
}
