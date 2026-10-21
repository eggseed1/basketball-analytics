import { PlayerRoleAffinity } from "@/components/players/player-role-affinity";
import { TextLink } from "@/components/ui/text-link";
import type { PlayerRoleAssignment } from "@/lib/player-role";
import {
  playerRoleDietLabel,
  playerRoleShellLabel,
} from "@/lib/player-role";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

/**
 * Scout-phrase style card: phrase, shell/diet chips, affinity mix, evidence.
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
  const stylesHref = `/explore/players/styles?season=${encodeURIComponent(role.season)}&style=${encodeURIComponent(role.id)}`;

  return (
    <section
      className={cn("flex flex-col gap-2.5", className)}
      aria-label="Playing style"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <p
          className={cn(
            type.caption,
            "font-semibold uppercase tracking-wide text-muted-foreground"
          )}
        >
          Style · {role.season}
        </p>
        <span
          className={cn(
            type.caption,
            "tabular-nums text-muted-foreground"
          )}
          title="How cleanly the top style separates from the rest"
        >
          Fit {Math.round(role.confidence * 100)}%
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <p className={cn(type.bodySm, "font-semibold tracking-tight")}>
          {role.phrase}
        </p>
        <p className={cn(type.caption, "text-muted-foreground")}>
          {role.blurb}
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span
          className={cn(
            type.caption,
            "rounded-md border border-border/50 bg-foreground/[0.03] px-1.5 py-0.5 font-semibold text-foreground"
          )}
        >
          {playerRoleShellLabel(role.shell)}
        </span>
        <span
          className={cn(
            type.caption,
            "rounded-md border border-border/50 bg-foreground/[0.03] px-1.5 py-0.5 text-muted-foreground"
          )}
        >
          {playerRoleDietLabel(role.diet)}
        </span>
        {role.defenseLabel ? (
          <span
            className={cn(
              type.caption,
              "rounded-md border border-border/50 bg-foreground/[0.03] px-1.5 py-0.5 text-muted-foreground"
            )}
          >
            {role.defenseLabel}
          </span>
        ) : null}
      </div>

      <PlayerRoleAffinity mix={role.roleMix} activeId={role.id} />

      {evidenceInline ? (
        <p className={cn(type.caption, "tabular-nums text-muted-foreground")}>
          {evidenceInline}
        </p>
      ) : null}

      {role.runnerUp ? (
        <p className={cn(type.caption, "text-muted-foreground")}>
          Close second: {role.runnerUp}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <TextLink
          href={stylesHref}
          className={cn(type.caption, "font-semibold")}
        >
          See league {role.phrase.toLowerCase()}s
        </TextLink>
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
                "mt-1.5 space-y-1 text-muted-foreground"
              )}
            >
              {role.why.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </section>
  );
}
