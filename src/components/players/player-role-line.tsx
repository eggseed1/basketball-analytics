import type { PlayerRoleAssignment } from "@/lib/player-role";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

function Dot() {
  return (
    <span className="text-border" aria-hidden>
      ·
    </span>
  );
}

/**
 * Scout-phrase role under the player name — quiet identity copy, not a badge.
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
    <div
      className={cn(
        "player-role-line mt-1 flex w-full flex-col items-center gap-0.5 text-center",
        className
      )}
    >
      <p className={cn(type.bodySm, "font-semibold tracking-tight text-foreground")}>
        {role.phrase}
        {role.defenseLabel ? (
          <span className="font-normal text-muted-foreground">
            {" "}
            · {role.defenseLabel}
          </span>
        ) : null}
      </p>
      <p className={cn(type.caption, "text-muted-foreground")}>
        {role.dietLine}
        <span className="text-border"> · </span>
        {role.season}
      </p>
      {role.evidence.length ? (
        <p
          className={cn(
            type.caption,
            "flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 tabular-nums text-muted-foreground"
          )}
        >
          {role.evidence.map((bit, i) => (
            <span key={bit.id} className="inline-flex items-center gap-2">
              {i > 0 ? <Dot /> : null}
              <span>
                <span className="text-muted-foreground/80">{bit.label}</span>{" "}
                {bit.display}
              </span>
            </span>
          ))}
        </p>
      ) : null}
      {showExpand ? (
        <details className="mt-0.5 max-w-[18rem] text-left">
          <summary
            className={cn(
              type.caption,
              "cursor-pointer list-none text-center font-semibold text-muted-foreground underline-offset-2 hover:underline [&::-webkit-details-marker]:hidden"
            )}
          >
            How we got this
          </summary>
          <ul className={cn(type.caption, "mt-1 space-y-1 text-muted-foreground")}>
            {role.why.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
