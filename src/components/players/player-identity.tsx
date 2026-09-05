"use client";

import { TransitionLink } from "@/components/continuity/query-nav";
import { PreviewCard } from "@base-ui/react/preview-card";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { FrostFloatingSurface } from "@/components/brand/frost-floating-surface";
import { TeamLogo } from "@/components/brand/team-logo";
import {
  claimPlayerIdentityPreview,
  releasePlayerIdentityPreview,
  subscribePlayerIdentityPreview,
} from "@/components/players/player-identity-preview-lock";
import {
  textHintClassName,
  textLinkClassName,
  type,
} from "@/lib/design-system";
import {
  careerSpanLabel,
  lookupPlayerPreviewAccolades,
  lookupPlayerSearchRow,
} from "@/lib/player-identity-preview-data";
import { stripFloatingTransform } from "@/lib/strip-floating-transform";
import { resolveTeamBrand } from "@/lib/nba-brand";
import type { PlayerCardStint } from "@/lib/player-team-context";
import { lastCardStint } from "@/lib/player-team-context";
import { cn } from "@/lib/utils";

/** Presentation density - same identity, different preview weight. */
export type PlayerIdentityVariant = "default" | "compact" | "chip";

export type PlayerIdentityProps = {
  /** Canonical player id. Required to link to a player page. */
  playerId?: string;
  name: string;
  teamKey?: string | null;
  teamLabel?: string | null;
  position?: string | null;
  /** Franchise stops this season; last item brands the preview. */
  stints?: PlayerCardStint[];
  season?: string | null;
  espnId?: string | null;
  nbaId?: string | null;
  /** Extra query on player page (e.g. season). */
  href?: string;
  className?: string;
  nameClassName?: string;
  /**
   * When false, the name is hoverable but not a link.
   * Defaults to true when `playerId` is present.
   */
  hasPlayedNba?: boolean;
  /**
   * Preview density.
   * - `default` - rich card
   * - `compact` - small card for dense tables
   * - `chip` - compact tip for avatar strips
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
  accoladeLimit: number;
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
    accoladeLimit: 3,
  },
  compact: {
    openDelay: 120,
    closeDelay: 160,
    side: "right",
    align: "start",
    sideOffset: 8,
    fallbackAxisSide: "start",
    popupWidth: "w-[min(14rem,calc(100vw-1rem))]",
    triggerHeadshot: "xs",
    accoladeLimit: 2,
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
    accoladeLimit: 2,
  },
};

const NEVER_PLAYED_COPY = "This player has not played in an NBA game.";

function resolveVariant(
  variant: PlayerIdentityVariant | undefined,
  compact: boolean | undefined
): PlayerIdentityVariant {
  if (variant) return variant;
  if (compact) return "compact";
  return "default";
}

/**
 * Consistent player identity: name links when they have NBA games; hover shows
 * career span + accolades (facts not already on the trigger).
 */
export function PlayerIdentity({
  playerId,
  name,
  teamKey,
  teamLabel,
  position,
  stints,
  season,
  espnId,
  nbaId,
  href,
  className,
  nameClassName,
  hasPlayedNba,
  variant,
  compact,
  children,
}: PlayerIdentityProps) {
  const resolved = resolveVariant(variant, compact);
  const cfg = VARIANT_CONFIG[resolved];
  const id = playerId?.trim() ?? "";
  const played = hasPlayedNba ?? Boolean(id);
  const linkable = Boolean(id) && played;
  const target =
    href ??
    (id
      ? `/players/${encodeURIComponent(id)}${
          season ? `?season=${encodeURIComponent(season)}` : ""
        }`
      : "");
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

  const resolvedStints: PlayerCardStint[] =
    stints && stints.length > 0
      ? stints
      : teamKey || teamLabel
        ? [
            {
              teamKey: teamKey?.trim() || "",
              teamLabel: teamLabel ?? "",
              position: position ?? null,
            },
          ]
        : [];
  const brandTeamKey =
    lastCardStint(resolvedStints)?.teamKey || teamKey || undefined;
  const brand = resolveTeamBrand(brandTeamKey);
  const searchRow = useMemo(() => lookupPlayerSearchRow(id), [id]);
  const span = careerSpanLabel(searchRow);
  const accolades = useMemo(
    () => lookupPlayerPreviewAccolades(id || nbaId, cfg.accoladeLimit),
    [id, nbaId, cfg.accoladeLimit]
  );

  const teamOnly =
    teamLabel || searchRow?.team || brand?.abbr || null;
  const posLine = position?.trim() || null;
  const seasonLine = season?.trim() || searchRow?.season || null;
  const metaBits = [teamOnly, posLine, seasonLine].filter(Boolean);
  const metaLine = metaBits.length ? metaBits.join(" · ") : null;

  const nameIsText = children == null || typeof children === "string";
  const trigger = linkable ? (
    <TransitionLink href={target} />
  ) : (
    <span />
  );

  return (
    <PreviewCard.Root open={open} onOpenChange={onOpenChange}>
      <span className={cn("inline-flex max-w-full items-center", className)}>
        <PreviewCard.Trigger
          render={trigger}
          delay={cfg.openDelay}
          closeDelay={cfg.closeDelay}
          className={cn(
            "inline-flex min-w-0 max-w-full items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            resolved !== "chip" && children == null && type.body,
            resolved === "chip" && "gap-0 no-underline hover:no-underline",
            resolved !== "chip" && nameIsText && linkable && textLinkClassName,
            resolved !== "chip" && nameIsText && !linkable && textHintClassName,
            nameClassName
          )}
          aria-describedby={open ? panelId : undefined}
          {...(!linkable
            ? {
                title: NEVER_PLAYED_COPY,
                "aria-label": `${name}. ${NEVER_PLAYED_COPY}`,
              }
            : {})}
        >
          {children ?? (
            <>
              {id ? (
                <PlayerHeadshot
                  playerId={id}
                  espnId={espnId}
                  nbaId={nbaId}
                  name={name}
                  teamKey={brandTeamKey}
                  size={
                    compact || resolved !== "default"
                      ? "xs"
                      : cfg.triggerHeadshot
                  }
                />
              ) : null}
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
            className={cn(cfg.popupWidth, resolved === "chip" && "rounded-md")}
            render={(popupProps) => (
              <FrostFloatingSurface
                {...popupProps}
                accentColor={brand?.primary}
                accentColorB={brand?.secondary}
              />
            )}
          >
            {!linkable ? (
              <div className="px-2.5 py-2">
                <p className="truncate text-[14px] font-semibold tracking-tight">
                  {name}
                </p>
                <p className="mt-1 text-[12px] leading-4 text-muted-foreground">
                  {NEVER_PLAYED_COPY}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5 px-2.5 py-2">
                <div className="flex items-center gap-2">
                  <PlayerHeadshot
                    playerId={id}
                    espnId={espnId}
                    nbaId={nbaId}
                    name={name}
                    teamKey={brandTeamKey}
                    size={resolved === "default" ? "sm" : "xs"}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-bold tracking-tight">
                      {name}
                    </p>
                    {metaLine ? (
                      <p className="mt-0.5 flex min-w-0 items-center gap-1 text-[12px] text-muted-foreground">
                        {brandTeamKey ? (
                          <TeamLogo teamKey={brandTeamKey} size="2xs" />
                        ) : null}
                        <span className="truncate">{metaLine}</span>
                      </p>
                    ) : null}
                  </div>
                </div>
                {span ? (
                  <p className="text-[12px] font-semibold tabular-nums text-muted-foreground">
                    {span}
                  </p>
                ) : null}
                {accolades.length > 0 ? (
                  <ul className="flex max-w-full flex-wrap gap-1">
                    {accolades.map((chip) => (
                      <li
                        key={chip}
                        className="rounded-md bg-foreground/8 px-1.5 py-0.5 text-[11px] font-semibold tracking-tight"
                      >
                        {chip}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )}
          </PreviewCard.Popup>
        </PreviewCard.Positioner>
      </PreviewCard.Portal>
    </PreviewCard.Root>
  );
}
