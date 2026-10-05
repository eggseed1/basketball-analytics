import { TradeAcquireBoxes } from "@/components/offseason/trade-acquire-boxes";
import { TransactionDescription } from "@/components/offseason/transaction-description";
import { TeamIdentity } from "@/components/teams/team-identity";
import { TextLink } from "@/components/ui/text-link";
import {
  realignResolutions,
  type TransactionPlayerResolution,
} from "@/lib/transaction-player-resolution";
import type { NbaTransactionEvent } from "@/data/types/transaction-event";
import { isTradeRelatedSourceCategory } from "@/lib/transaction-event-presentation";
import {
  nonTradeSentences,
  tradeAcquirePresentationFromEvent,
  tradeAcquirePresentationFromEvents,
} from "@/lib/trade-acquire-presentation";

export function TeamTransactionsSection({
  events,
  teamFilterId,
  offseasonYear,
  resolutionsByEventId = {},
  relatedByEventId = {},
}: {
  events: NbaTransactionEvent[];
  teamFilterId: string;
  offseasonYear: number;
  resolutionsByEventId?: Record<string, TransactionPlayerResolution[]>;
  /** Same-day partner-team blurbs logged as separate events. */
  relatedByEventId?: Record<string, NbaTransactionEvent[]>;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="type-body-sm text-muted-foreground">
        Transaction <span className="font-semibold text-foreground">events</span>{" "}
        for this franchise: date and description only, not asset genealogy.
      </p>
      {events.length === 0 ? (
        <p className="type-body-sm text-muted-foreground">
          No transaction events in the {offseasonYear} offseason window for this
          team filter.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {events.map((e) => {
            const related = relatedByEventId[e.id] ?? [];
            const inTradeCluster =
              isTradeRelatedSourceCategory(e.sourceTextCategory) ||
              related.some((r) => isTradeRelatedSourceCategory(r.sourceTextCategory));
            const fromCluster = related.length
              ? tradeAcquirePresentationFromEvents([e, ...related])
              : null;
            const tradeAcquire = inTradeCluster
              ? fromCluster?.sides.some((s) => s.teamId === e.teamId)
                ? fromCluster
                : isTradeRelatedSourceCategory(e.sourceTextCategory)
                  ? tradeAcquirePresentationFromEvent(e)
                  : null
              : null;
            const rest = tradeAcquire ? nonTradeSentences(e.description) : "";
            const tradeResolutions = [e, ...related].flatMap(
              (r) => resolutionsByEventId[r.id] ?? []
            );
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
                  {tradeAcquire ? " · Trade-related transaction" : null}
                </p>
                {tradeAcquire ? (
                  <>
                    <TradeAcquireBoxes
                      presentation={tradeAcquire}
                      resolutions={tradeResolutions}
                      compact
                      className="mt-1.5"
                    />
                    {rest ? (
                      <TransactionDescription
                        description={rest}
                        resolutions={realignResolutions(rest, resolutionsByEventId[e.id])}
                        className="type-body mt-2 leading-snug text-foreground"
                      />
                    ) : null}
                  </>
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
