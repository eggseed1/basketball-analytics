import { PlayerRoleAffinity } from "@/components/players/player-role-affinity";
import { PlayerStyleCreationMap } from "@/components/players/player-style-creation-map";
import { PlayerStyleDietAxis } from "@/components/players/player-style-diet-axis";
import { TextLink } from "@/components/ui/text-link";
import { sectionAtomicTileClassName } from "@/lib/design-system-sections";
import { type } from "@/lib/design-system";
import {
  playerRoleDietLabel,
  playerRoleShellLabel,
} from "@/lib/player-role";
import type { StyleStoryModel } from "@/lib/player-style-story";
import { formatOrdinal } from "@/lib/format";
import { cn } from "@/lib/utils";

function pctTile(percentile: number | null): string | null {
  if (percentile == null || !Number.isFinite(percentile)) return null;
  return `${formatOrdinal(Math.round(percentile))} among peers`;
}

/**
 * Full-width Style story: phrase, creation map, diet axis, mix, evidence.
 */
export function PlayerStyleStory({
  model,
  accent,
  className,
}: {
  model: StyleStoryModel;
  accent?: string;
  className?: string;
}) {
  const { role, peers, evidence, dietPosition, dietLabel, usagePct, assistPct } =
    model;
  const stylesHref = `/explore/players/styles?season=${encodeURIComponent(role.season)}&style=${encodeURIComponent(role.id)}`;
  const allStylesHref = `/explore/players/styles?season=${encodeURIComponent(role.season)}`;

  return (
    <div className={cn("flex flex-col gap-5", className)}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              type.display,
              "text-[1.75rem] font-bold tracking-tight sm:text-[2rem]"
            )}
          >
            {role.phrase}
          </p>
          <p className={cn(type.bodySm, "mt-1.5 max-w-2xl text-muted-foreground")}>
            {role.blurb}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <span
              className={cn(
                type.caption,
                "rounded-md border border-border/50 bg-foreground/[0.03] px-2 py-0.5 font-semibold text-foreground"
              )}
            >
              {playerRoleShellLabel(role.shell)}
            </span>
            <span
              className={cn(
                type.caption,
                "rounded-md border border-border/50 bg-foreground/[0.03] px-2 py-0.5 text-muted-foreground"
              )}
            >
              {playerRoleDietLabel(role.diet)}
            </span>
            {role.defenseLabel ? (
              <span
                className={cn(
                  type.caption,
                  "rounded-md border border-border/50 bg-foreground/[0.03] px-2 py-0.5 text-muted-foreground"
                )}
              >
                {role.defenseLabel}
              </span>
            ) : null}
          </div>
          {role.runnerUp ? (
            <p className={cn(type.caption, "mt-2 text-muted-foreground")}>
              Close second: {role.runnerUp}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col items-start gap-1 lg:items-end">
          <p
            className={cn(
              type.caption,
              "font-semibold uppercase tracking-wide text-muted-foreground"
            )}
          >
            Fit
          </p>
          <p className={cn(type.title, "font-bold tabular-nums tracking-tight")}>
            {Math.round(role.confidence * 100)}%
          </p>
          <p className={cn(type.caption, "max-w-[12rem] text-muted-foreground lg:text-right")}>
            How cleanly the top style separates from the mix.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
        <div className="min-w-0 lg:col-span-7">
          {usagePct != null && assistPct != null ? (
            <PlayerStyleCreationMap
              usagePct={usagePct}
              assistPct={assistPct}
              peers={peers}
              accent={accent}
            />
          ) : (
            <p className={cn(type.bodySm, "text-muted-foreground")}>
              Creation map needs usage and assist rate for this season.
            </p>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-5 lg:col-span-5">
          <PlayerStyleDietAxis position={dietPosition} label={dietLabel} />
          <div>
            <p className={cn(type.caption, "mb-2 font-semibold text-foreground")}>
              Style mix
            </p>
            <PlayerRoleAffinity mix={role.roleMix} activeId={role.id} />
          </div>
        </div>
      </div>

      {evidence.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {evidence.map((tile) => (
            <div key={tile.id} className={sectionAtomicTileClassName}>
              <p
                className={cn(
                  type.micro,
                  "font-semibold uppercase tracking-wide text-muted-foreground"
                )}
              >
                {tile.label}
              </p>
              <p className={cn(type.title, "font-bold tabular-nums")}>
                {tile.display}
              </p>
              {pctTile(tile.percentile) ? (
                <p className={cn(type.caption, "mt-0.5 text-muted-foreground")}>
                  {pctTile(tile.percentile)}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/40 pt-3">
        <TextLink href={stylesHref} className={cn(type.bodySm, "font-semibold")}>
          See other {role.phrase.toLowerCase()}s in {role.season}
        </TextLink>
        <TextLink
          href={allStylesHref}
          className={cn(type.bodySm, "text-muted-foreground")}
        >
          All styles
        </TextLink>
        {role.why.length ? (
          <details className="group w-full sm:ml-auto sm:w-auto">
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
    </div>
  );
}
