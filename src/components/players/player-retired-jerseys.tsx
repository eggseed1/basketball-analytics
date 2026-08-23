import { TransitionLink } from "@/components/continuity/query-nav";

import type { RetiredJerseyBadge } from "@/data/queries/player-retired-jerseys";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

/**
 * Arena-style retired number tile — number + field + frame in franchise banner colors.
 */
export function PlayerRetiredJerseys({
  jerseys,
  className,
}: {
  jerseys: RetiredJerseyBadge[];
  className?: string;
}) {
  if (!jerseys.length) return null;

  return (
    <ul
      className={cn(
        "mt-3 flex max-w-full flex-wrap items-end justify-center gap-x-2.5 gap-y-2",
        className
      )}
      aria-label="Retired jersey numbers"
    >
      {jerseys.map((jersey) => {
        const title = `${jersey.teamAbbr} retired No. ${jersey.number} — ${jersey.playerName}`;
        const href = `/teams/${encodeURIComponent(jersey.teamHrefId ?? jersey.teamKey)}`;
        return (
          <li key={`${jersey.teamKey}-${jersey.number}`}>
            <TransitionLink
              href={href}
              className={cn(
                "group flex flex-col items-center gap-0.5 rounded-md px-1 py-0.5",
                "text-muted-foreground transition-colors hover:text-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              )}
              title={title}
              aria-label={title}
            >
              <span
                className="flex size-9 items-center justify-center rounded-[1px] shadow-sm transition-transform group-hover:scale-105"
                style={{
                  backgroundColor: jersey.palette.field,
                  boxShadow: `inset 0 0 0 2.5px ${jersey.palette.border}`,
                  color: jersey.palette.number,
                }}
                aria-hidden
              >
                <span
                  className={cn(
                    "font-black leading-none tracking-tight",
                    jersey.number.length > 2 ? "text-[11px]" : "text-[17px]"
                  )}
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {jersey.number}
                </span>
              </span>
              <span
                className={cn(
                  type.caption,
                  "font-semibold leading-none uppercase tracking-wide"
                )}
              >
                #{jersey.number}
              </span>
              <span className={cn(type.caption, "leading-none opacity-80")}>
                {jersey.teamAbbr}
              </span>
            </TransitionLink>
          </li>
        );
      })}
    </ul>
  );
}
