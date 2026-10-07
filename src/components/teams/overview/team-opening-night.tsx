import type { CSSProperties } from "react";

import { TeamLogo } from "@/components/brand/team-logo";
import { TransitionLink } from "@/components/continuity/query-nav";
import { type, sectionLinkClassName } from "@/lib/design-system";
import { teamPageHref } from "@/lib/team-destination";
import type { ScheduleFacts } from "@/lib/team-overview-data";
import { cn } from "@/lib/utils";

const REGULAR_SEASON_GAMES = 82;
const PRE_CUP_GAMES = 80;

function dateLabel(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function tipLabel(tipOffAt: string | null) {
  if (!tipOffAt) return null;
  const d = new Date(tipOffAt);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })} ET`;
}

export function TeamOpeningNight({
  facts,
  season,
  teamId,
  teamName,
}: {
  facts: ScheduleFacts;
  season: string;
  teamId: string;
  teamName: string;
}) {
  const opener = facts.opener;
  const scheduleHref = teamPageHref(teamId, { season, tab: "schedule" });
  const rosterHref = teamPageHref(teamId, { season, tab: "players" });

  return (
    <section className="sports-card relative overflow-hidden p-4 sm:p-6" aria-label={`${season} opening night`}>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className={cn(type.micro, "font-semibold uppercase tracking-[0.12em] text-muted-foreground")}>{season} season</p>
          {opener ? (
            <>
              <h2 className={cn(type.title1, "mt-1 font-bold tracking-tight")}>
                {facts.daysUntilOpener != null && facts.daysUntilOpener > 0
                  ? `Tips off in ${facts.daysUntilOpener} day${facts.daysUntilOpener === 1 ? "" : "s"}`
                  : facts.daysUntilOpener === 0
                    ? "Opening night is today"
                    : "Season underway"}
              </h2>
              <p className={cn(type.body, "mt-1 text-muted-foreground")}>
                {opener.home ? "Home vs" : "At"} the {opener.opponentName} · {dateLabel(opener.date)}
                {tipLabel(opener.tipOffAt) ? ` · ${tipLabel(opener.tipOffAt)}` : ""}
              </p>
            </>
          ) : (
            <h2 className={cn(type.title2, "mt-1 font-bold")}>The {season} schedule isn&apos;t out yet.</h2>
          )}
          <p className={cn(type.bodySm, "mt-3 max-w-xl text-muted-foreground")}>
            Strengths, weaknesses and league ranks for {teamName} fill in once {season} games are played.
          </p>
        </div>

        {facts.regularGames ? (
          <div className="flex shrink-0 flex-col gap-2">
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
            {(
              [
                [
                  "Games scheduled",
                  facts.regularGames < REGULAR_SEASON_GAMES
                    ? `${facts.regularGames} of ${REGULAR_SEASON_GAMES}`
                    : String(facts.regularGames),
                ],
                ["Home games", String(facts.homeGames)],
                ["Back-to-backs", String(facts.backToBacks)],
                ["Longest road trip", `${facts.longestRoadTrip} games`],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="rounded-lg border border-border/70 bg-background/40 px-3 py-2">
                <dt className={cn(type.micro, "font-semibold uppercase tracking-wide text-muted-foreground")}>{label}</dt>
                <dd className={cn(type.title3, "font-bold tabular-nums")}>{value}</dd>
              </div>
            ))}
          </dl>
          {facts.regularGames < REGULAR_SEASON_GAMES ? (
            <p className={cn(type.micro, "max-w-md text-muted-foreground")}>
              {facts.regularGames === PRE_CUP_GAMES
                ? "The NBA sets each team's last 2 games in December, after the NBA Cup group stage. "
                : null}
              These counts cover the {facts.regularGames} games announced so far.
            </p>
          ) : null}
          </div>
        ) : null}
      </div>

      {facts.next.length ? (
        <div className="mt-5">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <p className={cn(type.micro, "font-semibold uppercase tracking-wide text-muted-foreground")}>First games</p>
            <div className="flex gap-3">
              <TransitionLink href={rosterHref} className={cn(type.caption, sectionLinkClassName)}>
                Roster <span data-motion-arrow aria-hidden>→</span>
              </TransitionLink>
              <TransitionLink href={scheduleHref} className={cn(type.caption, sectionLinkClassName)}>
                Full schedule <span data-motion-arrow aria-hidden>→</span>
              </TransitionLink>
            </div>
          </div>
          <ol
            className="grid grid-cols-2 gap-2 sm:grid-cols-[repeat(var(--games),minmax(0,1fr))]"
            style={{ "--games": facts.next.length } as CSSProperties}
          >
            {facts.next.map((g, i) => (
              <li key={g.id} className={cn(i === 0 && facts.next.length % 2 === 1 && "col-span-2 sm:col-span-1")}>
                <TransitionLink
                  href={`/games/${g.id}`}
                  data-motion="chip"
                  className="flex items-center gap-3 rounded-lg border border-border/70 bg-background/40 px-3 py-2.5 transition hover:bg-muted/60"
                >
                  <TeamLogo teamKey={g.opponentAbbr || g.opponentId} size="sm" />
                  <span className="min-w-0">
                    <span className={cn(type.bodySm, "block font-semibold")}>
                      {g.home ? "vs" : "at"} {g.opponentAbbr}
                    </span>
                    <span className={cn(type.micro, "block text-muted-foreground")}>{dateLabel(g.date)}</span>
                  </span>
                </TransitionLink>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}
