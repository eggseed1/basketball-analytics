import { TeamLogo } from "@/components/brand/team-logo";
import { TransactionDescription } from "@/components/offseason/transaction-description";
import { TeamIdentity } from "@/components/teams/team-identity";
import { SectionLink } from "@/components/ui/section-link";
import { listTransactionEvents } from "@/data/queries/offseason-tracker";
import { resolvePlayersForTransactionEvents } from "@/data/queries/transaction-player-resolve";
import { resolveTeamBrand } from "@/lib/nba-brand";

/**
 * Compact Home module - recent ESPN archive events, same query as Transactions.
 */
export async function OffseasonPulsePanel({ limit = 5 }: { limit?: number } = {}) {
  const page = await listTransactionEvents({}, { page: 1, pageSize: limit }).catch(
    () => null
  );
  const events = page?.events ?? [];
  if (!events.length) return null;
  const resolutions = await resolvePlayersForTransactionEvents(events).catch(
    () => new Map()
  );

  return (
    <section className="sports-card flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="type-heading">Recent NBA Transactions</h2>
        <SectionLink href="/offseason">See all transactions</SectionLink>
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
