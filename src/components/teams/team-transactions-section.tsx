import { TradeAcquireBoxes } from "@/components/offseason/trade-acquire-boxes";
import { TransactionDescription } from "@/components/offseason/transaction-description";
import { TeamIdentity } from "@/components/teams/team-identity";
import { TextLink } from "@/components/ui/text-link";
import type { TransactionPlayerResolution } from "@/lib/transaction-player-resolution";
import type { NbaTransactionEvent } from "@/data/types/transaction-event";
import { isTradeRelatedSourceCategory } from "@/lib/transaction-event-presentation";
import { tradeAcquirePresentationFromEvent } from "@/lib/trade-acquire-presentation";

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
          {events.map((e) => {
            const tradeAcquire =
              isTradeRelatedSourceCategory(e.sourceTextCategory)
                ? tradeAcquirePresentationFromEvent(e)
                : null;
            return (
              <li
                key={e.id}
                className="rounded-xl border border-border frost-surface px-3 py-2.5"
              >
                <p className="type-caption font-semibold uppercase tracking-wide text-muted-foreground">
                  {e.date}
                  {tradeAcquire ? (
                    <>
                      {" · "}
                      {tradeAcquire.sides.map((s) => s.teamAbbr).join(" ↔ ")}
                    </>
                  ) : e.teamAbbr ? (
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
                {tradeAcquire ? (
                  <TradeAcquireBoxes
                    presentation={tradeAcquire}
                    resolutions={resolutionsByEventId[e.id]}
                    compact
                    className="mt-1.5"
                  />
                ) : (
                  <TransactionDescription
                    description={e.description}
                    resolutions={resolutionsByEventId[e.id]}
                    className="type-body leading-snug text-foreground"
                  />
                )}
              </li>
            );
          })}
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
