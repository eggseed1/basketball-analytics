"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { TransitionLink } from "@/components/continuity/query-nav";
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

function yearSeasonsOf(badge: PlayerAccoladeBadge): string[] {
  return badge.seasons.filter(
    (s) => s !== "inducted" && !/^AS-\d+$/i.test(s)
  );
}

/** BRef-style chip copy: "11x All Star", "2000-01 MVP", "Hall of Fame". */
function blingLabel(badge: PlayerAccoladeBadge): string {
  const { award, count } = badge;
  const years = yearSeasonsOf(badge);

  if (award.id === "hof") return "Hall of Fame";

  if (award.id === "all_star") {
    return count > 1 ? `${count}x All Star` : "All Star";
  }

  if (award.id === "champion") {
    return count > 1 ? `${count}x NBA Champ` : "NBA Champ";
  }

  if (award.id === "finals_mvp") {
    return count > 1 ? `${count}x Finals MVP` : "Finals MVP";
  }

  if (award.id === "all_defense") {
    return count > 1 ? `${count}x All-Defensive` : "All-Defensive";
  }

  if (award.id === "all_nba") {
    return count > 1 ? `${count}x All-NBA` : "All-NBA";
  }

  if (
    count === 1 &&
    years.length === 1 &&
    (award.id === "roy" || award.id === "mvp" || award.id === "dpoy")
  ) {
    return `${formatSeasonLabel(years[0]!)} ${award.shortLabel}`;
  }

  return count > 1 ? `${count}x ${award.shortLabel}` : award.shortLabel;
}

/** Showcase order: HOF, All-Star, then remaining by catalog sort. */
function sortForBling(badges: PlayerAccoladeBadge[]): PlayerAccoladeBadge[] {
  return [...badges].sort((a, b) => {
    const rank = (badge: PlayerAccoladeBadge) => {
      if (badge.award.id === "hof") return 0;
      if (badge.award.id === "all_star") return 1;
      return 10 + badge.award.sort;
    };
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    return a.award.sort - b.award.sort;
  });
}

function AccoladeTag({ badge }: { badge: PlayerAccoladeBadge }) {
  const { award, count, seasons } = badge;
  const tipId = useId();
  const triggerRef = useRef<HTMLLIElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null
  );
  const [mounted, setMounted] = useState(false);

  const years = yearSeasonsOf(badge);
  const label = blingLabel(badge);
  const isHof = award.id === "hof";

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
      className="min-w-0"
      onMouseEnter={openNow}
      onMouseLeave={scheduleClose}
      onFocus={openNow}
      onBlur={scheduleClose}
    >
      <TransitionLink
        href={`/awards/${award.slug}`}
        className={cn(
          "accolade-metal-pill inline-flex max-w-full items-center rounded-md px-2.5 py-1",
          "text-[12px] font-semibold leading-tight tracking-tight",
          "transition-[filter,transform] hover:brightness-110 active:scale-[0.99]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          isHof && "tracking-[0.02em]"
        )}
        aria-label={`${count}× ${award.title}${
          years.length
            ? `. Seasons: ${years.map(formatSeasonLabel).join(" · ")}`
            : ""
        }. View history.`}
        aria-describedby={open ? tipId : undefined}
      >
        <span className="truncate">{label}</span>
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
                {years.length > 0 ? (
                  <ul className="mt-2 flex flex-wrap gap-1">
                    {years.map((season) => (
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
                  <p className={cn(type.caption, "mt-2 text-muted-foreground")}>
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
 * Compact accolade tags for the player identity header (under name / vitals).
 */
export function PlayerAccolades({
  badges,
  className,
  compact: _compact = false,
}: {
  badges: PlayerAccoladeBadge[];
  className?: string;
  /** Kept for call-site compat; layout is always compact tags. */
  compact?: boolean;
}) {
  const ordered = useMemo(() => sortForBling(badges), [badges]);
  if (!ordered.length) return null;

  return (
    <ul
      className={cn(
        "mx-auto flex max-w-full flex-wrap content-start justify-center gap-1.5",
        className
      )}
      aria-label="Career accolades"
    >
      {ordered.map((badge) => (
        <AccoladeTag key={badge.award.id} badge={badge} />
      ))}
    </ul>
  );
}
