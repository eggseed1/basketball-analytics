"use client";

import { TransitionLink } from "@/components/continuity/query-nav";
import { PreviewCard } from "@base-ui/react/preview-card";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { TeamLogo } from "@/components/brand/team-logo";
import {
  claimPlayerIdentityPreview,
  releasePlayerIdentityPreview,
  subscribePlayerIdentityPreview,
} from "@/components/players/player-identity-preview-lock";
import { cn } from "@/lib/utils";

/** Presentation density — same identity, different preview weight. */
export type PlayerIdentityVariant = "default" | "compact" | "chip";

export type PlayerIdentityProps = {
  playerId: string;
  name: string;
  teamKey?: string | null;
  teamLabel?: string | null;
  position?: string | null;
  season?: string | null;
  espnId?: string | null;
  nbaId?: string | null;
  /** Extra query on player page (e.g. season). */
  href?: string;
  className?: string;
  nameClassName?: string;
  /**
   * Preview density.
   * - `default` — rich card (spacious contexts)
   * - `compact` — small card for dense tables (prefers side placement)
   * - `chip` — name tooltip for avatar strips
   */
  variant?: PlayerIdentityVariant;
  /**
   * Shrinks default trigger headshot. Prefer `variant="compact"` for table
   * preview density; kept for existing call sites.
   */
  compact?: boolean;
  children?: ReactNode;
};

type VariantConfig = {
  openDelay: number;
  closeDelay: number;
  side: "bottom" | "top" | "right" | "left";
  align: "start" | "center" | "end";
  sideOffset: number;
  fallbackAxisSide: "start" | "end" | "none";
  popupWidth: string;
  triggerHeadshot: "xs" | "sm";
};

const VARIANT_CONFIG: Record<PlayerIdentityVariant, VariantConfig> = {
  default: {
    openDelay: 160,
    closeDelay: 200,
    side: "bottom",
    align: "start",
    sideOffset: 6,
    fallbackAxisSide: "end",
    popupWidth: "w-[min(16rem,calc(100vw-1rem))]",
    triggerHeadshot: "sm",
  },
  // Prefer beside the name so the next table row stays scannable.
  compact: {
    openDelay: 120,
    closeDelay: 160,
    side: "right",
    align: "start",
    sideOffset: 8,
    fallbackAxisSide: "start",
    popupWidth: "w-[min(13rem,calc(100vw-1rem))]",
    triggerHeadshot: "xs",
  },
  chip: {
    openDelay: 100,
    closeDelay: 120,
    side: "top",
    align: "center",
    sideOffset: 6,
    fallbackAxisSide: "end",
    popupWidth: "w-max max-w-[min(14rem,calc(100vw-1rem))]",
    triggerHeadshot: "xs",
  },
};

function resolveVariant(
  variant: PlayerIdentityVariant | undefined,
  compact: boolean | undefined
): PlayerIdentityVariant {
  if (variant) return variant;
  if (compact) return "compact";
  return "default";
}

/**
 * Consistent player identity: name remains a real link; hover/focus reveals a
 * portaled floating preview. Density follows `variant` so dense tables and
 * avatar chips stay scannable.
 */
export function PlayerIdentity({
  playerId,
  name,
  teamKey,
  teamLabel,
  position,
  season,
  espnId,
  nbaId,
  href,
  className,
  nameClassName,
  variant,
  compact,
  children,
}: PlayerIdentityProps) {
  const resolved = resolveVariant(variant, compact);
  const cfg = VARIANT_CONFIG[resolved];
  const target =
    href ??
    `/players/${encodeURIComponent(playerId)}${
      season ? `?season=${encodeURIComponent(season)}` : ""
    }`;
  const instanceId = useId();
  const panelId = `${instanceId}-preview`;
  const [open, setOpen] = useState(false);
  const closingForHiddenRef = useRef(false);

  useEffect(() => {
    return subscribePlayerIdentityPreview((active) => {
      if (active !== null && active !== instanceId) {
        setOpen(false);
      }
    });
  }, [instanceId]);

  useEffect(() => {
    return () => releasePlayerIdentityPreview(instanceId);
  }, [instanceId]);

  const onOpenChange = useCallback(
    (next: boolean) => {
      if (next) {
        claimPlayerIdentityPreview(instanceId);
        setOpen(true);
        return;
      }
      releasePlayerIdentityPreview(instanceId);
      setOpen(false);
    },
    [instanceId]
  );

  const metaLine =
    [teamLabel, position, season].filter(Boolean).join(" · ") || null;
  const teamOnly = teamLabel || null;

  return (
    <PreviewCard.Root open={open} onOpenChange={onOpenChange}>
      <span className={cn("inline-flex max-w-full items-center", className)}>
        <PreviewCard.Trigger
          render={<TransitionLink href={target} />}
          delay={cfg.openDelay}
          closeDelay={cfg.closeDelay}
          className={cn(
            "inline-flex min-w-0 max-w-full items-center gap-2 font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            resolved === "chip" && "gap-0 no-underline hover:no-underline",
            nameClassName
          )}
          aria-describedby={open ? panelId : undefined}
        >
          {children ?? (
            <>
              <PlayerHeadshot
                playerId={playerId}
                espnId={espnId}
                nbaId={nbaId}
                name={name}
                teamKey={teamKey}
                size={
                  compact || resolved !== "default"
                    ? "xs"
                    : cfg.triggerHeadshot
                }
              />
              {resolved === "chip" ? null : (
                <span className="truncate">{name}</span>
              )}
            </>
          )}
        </PreviewCard.Trigger>
      </span>

      <PreviewCard.Portal>
        <PreviewCard.Positioner
          side={cfg.side}
          align={cfg.align}
          sideOffset={cfg.sideOffset}
          positionMethod="fixed"
          collisionBoundary="clipping-ancestors"
          collisionPadding={8}
          collisionAvoidance={{
            side: "flip",
            align: "shift",
            fallbackAxisSide: cfg.fallbackAxisSide,
          }}
          sticky={false}
          className={(state) => {
            if (state.anchorHidden && open && !closingForHiddenRef.current) {
              closingForHiddenRef.current = true;
              queueMicrotask(() => {
                onOpenChange(false);
                closingForHiddenRef.current = false;
              });
            }
            return "z-50 outline-none";
          }}
        >
          <PreviewCard.Popup
            id={panelId}
            role="tooltip"
            className={cn(
              cfg.popupWidth,
              "origin-(--transform-origin) rounded-lg border border-border bg-card text-card-foreground shadow-md outline-none",
              "motion-safe:data-open:animate-in motion-safe:data-open:fade-in-0 motion-safe:data-open:zoom-in-95",
              "motion-safe:data-closed:animate-out motion-safe:data-closed:fade-out-0 motion-safe:data-closed:zoom-out-95",
              resolved === "chip" && "rounded-md shadow-sm"
            )}
          >
            {resolved === "chip" ? (
              <TransitionLink
                href={target}
                className="block px-2.5 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => onOpenChange(false)}
              >
                <span className="block max-w-[12rem] truncate text-[12px] font-semibold tracking-tight">
                  {name}
                </span>
                {teamOnly ? (
                  <span className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                    {teamKey ? <TeamLogo teamKey={teamKey} size="2xs" /> : null}
                    <span className="truncate">{teamOnly}</span>
                  </span>
                ) : null}
              </TransitionLink>
            ) : resolved === "compact" ? (
              <TransitionLink
                href={target}
                className={cn(
                  "flex items-center gap-2 px-2 py-1.5",
                  "hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                )}
                onClick={() => onOpenChange(false)}
              >
                <PlayerHeadshot
                  playerId={playerId}
                  espnId={espnId}
                  nbaId={nbaId}
                  name={name}
                  teamKey={teamKey}
                  size="xs"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-bold tracking-tight">
                    {name}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                    {teamKey ? (
                      <TeamLogo teamKey={teamKey} size="2xs" />
                    ) : null}
                    <span className="truncate">
                      {metaLine ?? "View player →"}
                    </span>
                  </span>
                </span>
              </TransitionLink>
            ) : (
              <TransitionLink
                href={target}
                className={cn(
                  "flex items-center gap-3 p-2.5",
                  "hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                )}
                onClick={() => onOpenChange(false)}
              >
                <PlayerHeadshot
                  playerId={playerId}
                  espnId={espnId}
                  nbaId={nbaId}
                  name={name}
                  teamKey={teamKey}
                  size="md"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-bold tracking-tight">
                    {name}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    {teamKey ? (
                      <TeamLogo teamKey={teamKey} size="2xs" />
                    ) : null}
                    <span className="truncate">
                      {metaLine ?? "View player"}
                    </span>
                  </span>
                  <span className="mt-1 block text-[11px] font-semibold">
                    View player →
                  </span>
                </span>
              </TransitionLink>
            )}
          </PreviewCard.Popup>
        </PreviewCard.Positioner>
      </PreviewCard.Portal>
    </PreviewCard.Root>
  );
}
