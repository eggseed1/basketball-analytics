import type { PlayerRoleAssignment } from "@/lib/player-role";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

/**
 * Compact scout-phrase strip for player overview — label, not a module.
 * Same-build peer comps belong on a deeper surface if we add them later.
 */
export function PlayerRoleLine({
  role,
  className,
}: {
  role: PlayerRoleAssignment;
  className?: string;
}) {
  const showExpand = role.why.length > 0;
  const evidenceInline = role.evidence
    .map((bit) => `${bit.label} ${bit.display}`)
    .join(" · ");

  return (
    <aside
      className={cn(
        "player-role-card flex flex-wrap items-baseline gap-x-3 gap-y-1 border-y border-border/50 py-2",
        className
      )}
      aria-label="Playing style"
    >
      <p
        className={cn(
          type.micro,
          "shrink-0 font-bold uppercase tracking-[0.12em] text-muted-foreground"
        )}
      >
        Style · {role.season}
      </p>

      <p className={cn(type.bodySm, "min-w-0 font-semibold tracking-tight")}>
        {role.phrase}
        {role.defenseLabel ? (
          <span className="font-normal text-muted-foreground">
            {" "}
            · {role.defenseLabel}
          </span>
        ) : null}
        <span className="font-normal text-muted-foreground">
          {" "}
          · {role.dietLine.replace(/ shot diet$/i, "").replace(/ diet$/i, "")}
        </span>
        {evidenceInline ? (
          <span className="font-normal tabular-nums text-muted-foreground">
            {" "}
            · {evidenceInline}
          </span>
        ) : null}
      </p>

      {showExpand ? (
        <details className="group ml-auto">
          <summary
            className={cn(
              type.caption,
              "cursor-pointer list-none font-semibold text-muted-foreground underline-offset-2 hover:underline [&::-webkit-details-marker]:hidden"
            )}
          >
            How we got this
          </summary>
          <ul
            className={cn(
              type.caption,
              "mt-1.5 max-w-xl space-y-1 text-muted-foreground"
            )}
          >
            {role.why.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </aside>
  );
}
