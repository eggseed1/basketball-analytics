"use client";

import { PreviewCard } from "@base-ui/react/preview-card";
import { useId, useMemo, useState, type ReactNode } from "react";

import { TransitionLink } from "@/components/continuity/query-nav";
import { TeamLogo } from "@/components/brand/team-logo";
import { FrostFloatingSurface } from "@/components/brand/frost-floating-surface";
import { TextLink } from "@/components/ui/text-link";
import { stripFloatingTransform } from "@/lib/strip-floating-transform";
import { textLinkClassName, type } from "@/lib/design-system";
import { formatNumber } from "@/lib/format";
import { getCanonicalTeamOrUndefined, teamProfileHref } from "@/lib/team-identity";
import { lookupTeamStanding } from "@/lib/team-standing-lookup";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { cn } from "@/lib/utils";

export type TeamIdentityProps = {
  teamKey: string;
  /** Visible label; defaults to abbreviation. */
  label?: string | null;
  season?: string | null;
  href?: string;
  className?: string;
  nameClassName?: string;
  children?: ReactNode;
};

/**
 * Team mention: hover preview with standings context + click through to team page.
 */
export function TeamIdentity({
  teamKey,
  label,
  season,
  href,
  className,
  nameClassName,
  children,
}: TeamIdentityProps) {
  const brand = resolveTeamBrand(teamKey);
  const canonical = getCanonicalTeamOrUndefined(teamKey);
  const text =
    label?.trim() ||
    brand?.abbr ||
    canonical?.abbr ||
    teamKey.trim().toUpperCase();
  const displayName =
    canonical?.displayName || brand?.abbr || text;
  const target = href ?? teamProfileHref(teamKey, season);
  const panelId = `${useId()}-preview`;
  const [open, setOpen] = useState(false);

  const standing = useMemo(
    () => lookupTeamStanding(teamKey, season),
    [teamKey, season]
  );

  const nameIsText = children == null || typeof children === "string";

  return (
    <PreviewCard.Root open={open} onOpenChange={setOpen}>
      <span className={cn("inline-flex max-w-full items-center", className)}>
        <PreviewCard.Trigger
          render={<TransitionLink href={target} />}
          delay={140}
          closeDelay={160}
          className={cn(
            "inline-flex min-w-0 max-w-full items-center gap-1.5",
            !nameClassName && type.body,
            nameIsText && textLinkClassName,
            nameClassName
          )}
          aria-describedby={open ? panelId : undefined}
        >
          {children ?? <span className="truncate">{text}</span>}
        </PreviewCard.Trigger>
      </span>
      <PreviewCard.Portal>
        <PreviewCard.Positioner
          side="bottom"
          align="start"
          sideOffset={6}
          positionMethod="fixed"
          collisionPadding={8}
          className="z-50 outline-none"
          render={(positionerProps) => (
            <div
              {...positionerProps}
              style={stripFloatingTransform(positionerProps.style)}
            />
          )}
        >
          <PreviewCard.Popup
            id={panelId}
            role="tooltip"
            className="w-[min(15rem,calc(100vw-1rem))]"
            render={(popupProps) => <FrostFloatingSurface {...popupProps} />}
          >
            <TextLink
              href={target}
              className="flex flex-col gap-1.5 px-2.5 py-2 no-underline hover:bg-secondary/40"
              onClick={() => setOpen(false)}
            >
              <span className="flex items-center gap-2">
                <TeamLogo teamKey={teamKey} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-bold tracking-tight">
                    {displayName}
                  </span>
                  {standing ? (
                    <span className="mt-0.5 block text-[12px] tabular-nums text-muted-foreground">
                      #{standing.row.rank} · {standing.row.conference} ·{" "}
                      {standing.row.wins}-{standing.row.losses} ·{" "}
                      {formatNumber(standing.row.winPct, 3)}
                      {Number.isFinite(standing.row.differential)
                        ? ` · ${standing.row.differential > 0 ? "+" : ""}${formatNumber(standing.row.differential, 1)}`
                        : ""}
                    </span>
                  ) : (
                    <span className="mt-0.5 block text-[12px] text-muted-foreground">
                      {brand?.abbr ?? text}
                    </span>
                  )}
                </span>
              </span>
              {standing ? (
                <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">
                  {standing.season} standings
                </span>
              ) : null}
              <span className="text-[12px] font-semibold underline underline-offset-2">
                Open team
              </span>
            </TextLink>
          </PreviewCard.Popup>
        </PreviewCard.Positioner>
      </PreviewCard.Portal>
    </PreviewCard.Root>
  );
}
