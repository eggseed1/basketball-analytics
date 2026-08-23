import { TeamLogo } from "@/components/brand/team-logo";
import { TransactionDescription } from "@/components/offseason/transaction-description";
import { TeamIdentity } from "@/components/teams/team-identity";
import { TextLink } from "@/components/ui/text-link";
import { listTransactionEvents } from "@/data/queries/offseason-tracker";
import { resolvePlayersForTransactionEvents } from "@/data/queries/transaction-player-resolve";
import { resolveTeamBrand } from "@/lib/nba-brand";

/**
 * Compact Home module - recent ESPN archive events, same query as Transactions.
 */
export async function OffseasonPulsePanel() {
  const page = await listTransactionEvents({}, { page: 1, pageSize: 5 }).catch(
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
        <TextLink href="/offseason" className="type-body-sm text-muted-foreground">
          See all transactions →
        </TextLink>
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
              <time className="type-caption shrink-0 tabular-nums text-[#505050]">
                {event.date}
              </time>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
