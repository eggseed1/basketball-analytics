import { TransactionDescription } from "@/components/offseason/transaction-description";
import { TeamIdentity } from "@/components/teams/team-identity";
import { TextLink } from "@/components/ui/text-link";
import type { TransactionPlayerResolution } from "@/lib/transaction-player-resolution";
import type { NbaTransactionEvent } from "@/data/types/transaction-event";

export function TeamTransactionsSection({
  events,
  teamFilterId,
  offseasonYear,
  resolutionsByEventId = {},
}: {
  events: NbaTransactionEvent[];
  teamFilterId: string;
  offseasonYear: number;
  resolutionsByEventId?: Record<string, TransactionPlayerResolution[]>;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="type-body-sm text-muted-foreground">
        ESPN transaction <span className="font-semibold text-foreground">events</span>{" "}
        for this franchise - factual date + description only. Not asset
        genealogy.
      </p>
      {events.length === 0 ? (
        <p className="type-body-sm text-muted-foreground">
          No transaction events in the {offseasonYear} offseason window for this
          team filter.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {events.map((e) => (
            <li
              key={e.id}
              className="rounded-xl border border-border frost-surface px-3 py-2.5"
            >
              <p className="type-caption font-semibold uppercase tracking-wide text-muted-foreground">
                {e.date}
                {e.teamAbbr ? (
                  <>
                    {" · "}
                    <TeamIdentity
                      teamKey={e.teamId || e.teamAbbr}
                      label={e.teamAbbr}
                      className="inline-flex align-baseline"
                      nameClassName="inline uppercase"
                    />
                  </>
                ) : null}
                {e.sourceTextCategory === "trade"
                  ? " · Trade-related transaction"
                  : null}
              </p>
              <TransactionDescription
                description={e.description}
                resolutions={resolutionsByEventId[e.id]}
                className="type-body leading-snug text-foreground"
              />
            </li>
          ))}
        </ul>
      )}
      <p className="type-body-sm text-muted-foreground">
        <TextLink
          href={`/offseason?team=${encodeURIComponent(teamFilterId)}&year=${offseasonYear}`}
        >
          View all transactions →
        </TextLink>
      </p>
    </div>
  );
}
