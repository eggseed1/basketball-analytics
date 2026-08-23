"use client";

import { TransactionDescription } from "@/components/offseason/transaction-description";
import { TeamLogo } from "@/components/brand/team-logo";
import { TextLink } from "@/components/ui/text-link";
import { type } from "@/lib/design-system";
import { sourceTextCategoryLabel } from "@/offseason";
import type { NbaTransactionEvent } from "@/data/types/transaction-event";
import type { TransactionPlayerResolution } from "@/lib/transaction-player-resolution";
import { cn } from "@/lib/utils";

export function PlayerTransactionHistory({
  events,
  resolutionsByEventId,
  playerName,
  className,
}: {
  events: NbaTransactionEvent[];
  resolutionsByEventId: Record<string, TransactionPlayerResolution[]>;
  playerName: string;
  className?: string;
}) {
  if (!events.length) return null;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <p
          className={cn(
            type.caption,
            "font-semibold uppercase tracking-wide text-muted-foreground"
          )}
        >
          Transaction history
        </p>
        <TextLink
          href={`/offseason?q=${encodeURIComponent(playerName)}`}
          className={type.caption}
        >
          All →
        </TextLink>
      </div>
      <ul className="flex flex-col gap-2">
        {events.map((event) => (
          <li
            key={event.id}
            className="rounded-md border border-border/60 bg-white/40 px-2 py-1.5"
          >
            <p
              className={cn(
                type.caption,
                "flex flex-wrap items-center gap-1.5 font-semibold text-muted-foreground"
              )}
            >
              <time className="tabular-nums">{event.date}</time>
              {event.teamAbbr ? (
                <>
                  <span aria-hidden>·</span>
                  <span className="inline-flex items-center gap-1 text-foreground">
                    <TeamLogo
                      teamKey={event.teamId || event.teamAbbr}
                      size="2xs"
                    />
                    {event.teamAbbr}
                  </span>
                </>
              ) : null}
              <span className="font-medium uppercase tracking-wide">
                {sourceTextCategoryLabel(event.sourceTextCategory)}
              </span>
            </p>
            <TransactionDescription
              description={event.description}
              resolutions={resolutionsByEventId[event.id]}
              className={cn(type.caption, "mt-0.5 leading-snug text-foreground")}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
