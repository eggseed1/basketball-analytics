import type { PlayerRoleAssignment } from "@/lib/player-role";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

/**
 * Scout-phrase section for the player card column.
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
  const detailBits = [
    role.defenseLabel,
    role.dietLine.replace(/ shot diet$/i, "").replace(/ diet$/i, ""),
    evidenceInline,
  ].filter(Boolean);

  return (
    <section
      className={cn("flex flex-col gap-1.5", className)}
      aria-label="Playing style"
    >
      <p
        className={cn(
          type.caption,
          "font-semibold uppercase tracking-wide text-muted-foreground"
        )}
      >
        Style · {role.season}
      </p>
      <p className={cn(type.bodySm, "font-semibold tracking-tight")}>
        {role.phrase}
      </p>
      {detailBits.length ? (
        <p className={cn(type.caption, "tabular-nums text-muted-foreground")}>
          {detailBits.join(" · ")}
        </p>
      ) : null}
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
          <ul className={cn(type.caption, "mt-1.5 space-y-1 text-muted-foreground")}>
            {role.why.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
