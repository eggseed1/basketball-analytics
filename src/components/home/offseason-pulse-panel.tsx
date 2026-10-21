import { TeamLogo } from "@/components/brand/team-logo";
import { TransactionDescription } from "@/components/offseason/transaction-description";
import { TeamIdentity } from "@/components/teams/team-identity";
import { SectionLink } from "@/components/ui/section-link";
import { listTransactionEvents } from "@/data/queries/offseason-tracker";
import { resolvePlayersForTransactionEvents } from "@/data/queries/transaction-player-resolve";
import { currentOffseasonLabelYear } from "@/data/providers/transactions/offseason-window";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { type } from "@/lib/design-system";

/**
 * Compact Home module - recent ESPN archive events, same query as Transactions.
 * After tip-off the title uses the league season (e.g. 2026-27), matching
 * Top performers; the archive link stays on /offseason for that label year.
 */
export async function OffseasonPulsePanel({
  limit = 5,
  season,
  tippedOff = false,
}: {
  limit?: number;
  /** League season label, e.g. 2026-27. */
  season?: string;
  /** True once the regular-season opener has arrived. */
  tippedOff?: boolean;
} = {}) {
  const page = await listTransactionEvents({}, { page: 1, pageSize: limit }).catch(
    () => null
  );
  const events = page?.events ?? [];
  if (!events.length) return null;
  const resolutions = await resolvePlayersForTransactionEvents(events).catch(
    () => new Map()
  );

  const labelYear = currentOffseasonLabelYear();
  const title =
    tippedOff && season
      ? `${season} transactions`
      : season
        ? `Recent ${season} transactions`
        : "Recent NBA Transactions";
  const archiveHref = `/offseason?year=${encodeURIComponent(String(labelYear))}`;

  return (
    <section
      aria-label={title}
      className="sports-card flex flex-col gap-3 p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className={type.heading}>{title}</h2>
        <SectionLink href={archiveHref}>See all transactions</SectionLink>
      </div>
      <ul className="flex flex-col divide-y divide-border/40">
        {events.map((event) => {
          const brand =
            resolveTeamBrand(event.teamId) ??
            resolveTeamBrand(event.teamAbbr);
          const abbr = brand?.abbr ?? event.teamAbbr ?? event.teamId;
          return (
            <li
              key={event.id}
              data-motion="row"
              className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
            >
              <div className="flex min-w-0 items-center gap-2">
                <TeamIdentity
                  teamKey={event.teamId}
                  label={abbr}
                  className="shrink-0"
                  nameClassName="no-underline hover:no-underline"
                >
                  <TeamLogo teamKey={abbr} size="xs" />
                </TeamIdentity>
                <TransactionDescription
                  description={event.description}
                  resolutions={resolutions.get(event.id)}
                  className="type-body-sm min-w-0 flex-1 truncate text-foreground"
                />
              </div>
              <time className="type-caption shrink-0 tabular-nums text-muted-foreground">
                {event.date}
              </time>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
