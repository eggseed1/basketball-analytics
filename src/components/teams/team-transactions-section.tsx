import Link from "next/link";

import { TransactionDescription } from "@/components/offseason/transaction-description";
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
      <p className="text-[13px] text-muted-foreground">
        ESPN transaction <span className="font-semibold text-foreground">events</span>{" "}
        for this franchise — factual date + description only. Not asset
        genealogy.
      </p>
      {events.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">
          No transaction events in the {offseasonYear} offseason window for this
          team filter.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {events.map((e) => (
            <li
              key={e.id}
              className="rounded-xl border border-border bg-white/45 px-3 py-2.5"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {e.date}
                {e.teamAbbr ? ` · ${e.teamAbbr}` : null}
              </p>
              <TransactionDescription
                description={e.description}
                resolutions={resolutionsByEventId[e.id]}
                className="text-[13px] leading-snug text-foreground"
              />
            </li>
          ))}
        </ul>
      )}
      <p className="text-[13px] text-muted-foreground">
        <Link
          href={`/offseason?team=${encodeURIComponent(teamFilterId)}&year=${offseasonYear}`}
          className="font-semibold underline-offset-2 hover:underline"
        >
          View all transactions →
        </Link>
      </p>
    </div>
  );
}
