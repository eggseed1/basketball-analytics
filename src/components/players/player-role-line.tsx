import type { PlayerRoleAssignment } from "@/lib/player-role";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

/**
 * Scout-phrase role for the player overview — not in the identity header.
 */
export function PlayerRoleLine({
  role,
  className,
}: {
  role: PlayerRoleAssignment;
  className?: string;
}) {
  const showExpand = role.why.length > 0;

  return (
    <aside
      className={cn(
        "player-role-card sports-card flex flex-col gap-2 p-4 sm:p-[18px]",
        className
      )}
      aria-label="Playing style"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p
          className={cn(
            type.micro,
            "font-bold uppercase tracking-[0.12em] text-muted-foreground"
          )}
        >
          Playing style · {role.season}
        </p>
        {showExpand ? (
          <details className="group">
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
                "mt-2 max-w-xl space-y-1 text-muted-foreground"
              )}
            >
              {role.why.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>

      <p className={cn(type.heading, "tracking-tight")}>
        {role.phrase}
        {role.defenseLabel ? (
          <span className="font-normal text-muted-foreground">
            {" "}
            · {role.defenseLabel}
          </span>
        ) : null}
      </p>

      <p className={cn(type.bodySm, "text-muted-foreground")}>{role.dietLine}</p>

      {role.evidence.length ? (
        <dl className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
          {role.evidence.map((bit) => (
            <div key={bit.id} className="min-w-0">
              <dt
                className={cn(
                  type.micro,
                  "font-semibold uppercase tracking-wide text-muted-foreground"
                )}
              >
                {bit.label}
              </dt>
              <dd className={cn(type.bodySm, "font-semibold tabular-nums")}>
                {bit.display}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </aside>
  );
}
