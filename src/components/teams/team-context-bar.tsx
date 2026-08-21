"use client";

import { TransitionLink } from "@/components/continuity/query-nav";
import { type } from "@/lib/design-system";
import {
  teamContextBarVisibility,
  teamPageHref,
  type TeamPageHrefOpts,
  type TeamPageTab,
  type TeamRateMode,
  type TeamSeasonKind,
} from "@/lib/team-destination";
import { cn } from "@/lib/utils";

const KINDS: Array<{ id: TeamSeasonKind; label: string }> = [
  { id: "regular", label: "Regular" },
  { id: "playoffs", label: "Playoffs" },
  { id: "cup", label: "NBA Cup" },
  { id: "playin", label: "Play-in" },
  { id: "preseason", label: "Preseason" },
];

const RATES: Array<{ id: TeamRateMode; label: string }> = [
  { id: "perGame", label: "Per game" },
  { id: "totals", label: "Totals" },
  { id: "per36", label: "Per 36" },
  { id: "per75", label: "Per 75" },
  { id: "per100", label: "Per 100" },
];

function Chip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: string;
}) {
  return (
    <TransitionLink
      href={href}
      scroll={false}
      aria-pressed={active}
      className={cn(
        type.caption,
        "rounded-md px-2.5 py-1 font-semibold",
        active
          ? "bg-foreground text-background"
          : "bg-white/55 text-foreground hover:bg-white/80"
      )}
    >
      {children}
    </TransitionLink>
  );
}

export function TeamContextBar({
  teamId,
  tab,
  hrefOpts,
}: {
  teamId: string;
  tab: TeamPageTab;
  hrefOpts: TeamPageHrefOpts;
}) {
  const visibility = teamContextBarVisibility(tab);
  if (!visibility.seasonType && !visibility.rate) return null;

  const seasonType = hrefOpts.seasonType ?? "regular";
  const rate = hrefOpts.rate ?? "perGame";

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {visibility.seasonType ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <p
            className={cn(
              type.caption,
              "font-semibold uppercase tracking-wide text-muted-foreground"
            )}
          >
            Type
          </p>
          {KINDS.map((item) => (
            <Chip
              key={item.id}
              active={seasonType === item.id}
              href={teamPageHref(teamId, { ...hrefOpts, seasonType: item.id })}
            >
              {item.label}
            </Chip>
          ))}
        </div>
      ) : null}
      {visibility.rate ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <p
            className={cn(
              type.caption,
              "font-semibold uppercase tracking-wide text-muted-foreground"
            )}
          >
            Rate
          </p>
          {RATES.map((item) => (
            <Chip
              key={item.id}
              active={rate === item.id}
              href={teamPageHref(teamId, { ...hrefOpts, rate: item.id })}
            >
              {item.label}
            </Chip>
          ))}
        </div>
      ) : null}
    </div>
  );
}
