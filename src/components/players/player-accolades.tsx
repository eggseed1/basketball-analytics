"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { TransitionLink } from "@/components/continuity/query-nav";
import { AwardTrophyIcon } from "@/components/awards/award-trophy-icon";
import { FrostFloatingSurface } from "@/components/brand/frost-floating-surface";
import type { PlayerAccoladeBadge } from "@/data/queries/player-awards";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

function formatSeasonLabel(season: string): string {
  if (season === "inducted") return "Inducted";
  const m = /^(\d{4})-(\d{2})$/.exec(season);
  if (m) return `${m[1]}-${m[2]}`;
  return season;
}

function AccoladeChip({
  badge,
  compact = false,
}: {
  badge: PlayerAccoladeBadge;
  compact?: boolean;
}) {
  const { award, count, seasons } = badge;
  const tipId = useId();
  const triggerRef = useRef<HTMLLIElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null
  );
  const [mounted, setMounted] = useState(false);

  const yearSeasons = seasons.filter((s) => s !== "inducted");
  const seasonsLabel =
    yearSeasons.map(formatSeasonLabel).join(" · ") ||
    (seasons.includes("inducted") ? "Inducted" : undefined);

  useEffect(() => {
    setMounted(true);
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setCoords(null);
      return;
    }
    const rect = triggerRef.current.getBoundingClientRect();
    const width = 240;
    const left = Math.min(
      Math.max(8, rect.left + rect.width / 2 - width / 2),
      window.innerWidth - width - 8
    );
    setCoords({
      top: rect.bottom + 8,
      left,
    });
  }, [open]);

  function scheduleClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  }

  function openNow() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  }

  return (
    <li
      ref={triggerRef}
      className="relative"
      onMouseEnter={openNow}
      onMouseLeave={scheduleClose}
      onFocus={openNow}
      onBlur={scheduleClose}
    >
      <TransitionLink
        href={`/awards/${award.slug}`}
        className={cn(
          "group inline-flex max-w-[14rem] items-center gap-2 rounded-md text-muted-foreground transition-colors hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          compact ? "px-1 py-0.5" : "px-1.5 py-1"
        )}
        aria-label={`${count}× ${award.title}${
          seasonsLabel ? `. Seasons: ${seasonsLabel}` : ""
        }. View history.`}
        aria-describedby={open ? tipId : undefined}
      >
        <span
          className={cn(
            "inline-flex shrink-0 items-center justify-center",
            compact ? "size-6" : "size-8"
          )}
        >
          <AwardTrophyIcon
            trophy={award.trophy}
            title={award.trophyName}
            className={cn(
              "transition-transform group-hover:scale-105",
              compact ? "size-6" : "size-8"
            )}
          />
        </span>
        <span className="min-w-0 text-left leading-tight">
          <span
            className={cn(
              type.caption,
              "block font-semibold tracking-tight text-foreground"
            )}
          >
            {award.title}
          </span>
          <span
            className={cn(
              type.caption,
              "mt-0.5 block tabular-nums text-muted-foreground"
            )}
          >
            {count}×
          </span>
        </span>
      </TransitionLink>

      {mounted && open && coords
        ? createPortal(
            <div
              id={tipId}
              role="tooltip"
              className="fixed z-[90] w-[240px]"
              style={{ top: coords.top, left: coords.left }}
              onMouseEnter={openNow}
              onMouseLeave={scheduleClose}
            >
              <FrostFloatingSurface className="p-3">
                <p
                  className={cn(
                    type.caption,
                    "font-bold uppercase tracking-[0.08em] text-muted-foreground"
                  )}
                >
                  {award.trophyName}
                </p>
                <p className={cn(type.bodySm, "mt-0.5 font-semibold")}>
                  {count}× {award.title}
                </p>
                {yearSeasons.length > 0 ? (
                  <ul className="mt-2 flex flex-wrap gap-1">
                    {yearSeasons.map((season) => (
                      <li
                        key={season}
                        className={cn(
                          type.caption,
                          "rounded-md bg-foreground/8 px-1.5 py-0.5 tabular-nums font-semibold text-foreground"
                        )}
                      >
                        {formatSeasonLabel(season)}
                      </li>
                    ))}
                  </ul>
                ) : seasons.includes("inducted") ? (
                  <p
                    className={cn(
                      type.caption,
                      "mt-2 text-muted-foreground"
                    )}
                  >
                    Hall of Fame inductee
                  </p>
                ) : null}
              </FrostFloatingSurface>
            </div>,
            document.body
          )
        : null}
    </li>
  );
}

/**
 * Trophy row for the player identity card — icon + written award title.
 */
export function PlayerAccolades({
  badges,
  className,
  compact = false,
}: {
  badges: PlayerAccoladeBadge[];
  className?: string;
  compact?: boolean;
}) {
  if (!badges.length) return null;

  return (
    <ul
      className={cn(
        "flex max-w-full flex-wrap items-start gap-x-1.5 gap-y-1.5",
        compact ? "justify-start" : "mt-3 justify-center gap-x-2 gap-y-2",
        className
      )}
      aria-label="Career accolades"
    >
      {badges.map((badge) => (
        <AccoladeChip key={badge.award.id} badge={badge} compact={compact} />
      ))}
    </ul>
  );
}
