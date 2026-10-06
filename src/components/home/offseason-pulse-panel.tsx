import { TeamLogo } from "@/components/brand/team-logo";
import { TransactionDescription } from "@/components/offseason/transaction-description";
import { TeamIdentity } from "@/components/teams/team-identity";
import { AppLink } from "@/components/ui/app-link";
import { listTransactionEvents } from "@/data/queries/offseason-tracker";
import { resolvePlayersForTransactionEvents } from "@/data/queries/transaction-player-resolve";
import { sectionLinkClassName } from "@/lib/design-system";
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
    <section className="sports-card flex flex-col gap-3 px-4 py-4 sm:px-[20px] sm:py-[16px]">
      <div className="flex items-center justify-between gap-2">
        <h2 className="type-heading">Recent NBA Transactions</h2>
        <AppLink href="/offseason" className={`type-body-sm ${sectionLinkClassName}`}>
          See all transactions →
        </AppLink>
      </div>
      <ul className="flex flex-col gap-4">
        {events.map((event) => {
          const brand =
            resolveTeamBrand(event.teamId) ??
            resolveTeamBrand(event.teamAbbr);
          const abbr = brand?.abbr ?? event.teamAbbr ?? event.teamId;
          return (
            <li
              key={event.id}
              className="flex items-center justify-between gap-3"
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
