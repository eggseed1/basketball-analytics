import { TeamTransactionsSection } from "@/components/teams/team-transactions-section";
import { currentOffseasonLabelYear } from "@/data/providers/transactions/offseason-window";
import { listTransactionEvents } from "@/data/queries";
import { getTransactionEventWithRelations } from "@/data/queries/offseason-tracker";
import type { NbaTransactionEvent } from "@/data/types/transaction-event";
import { resolvePlayersForTransactionEvents } from "@/data/queries/transaction-player-resolve";

export async function TeamTransactionsIsland({
  teamFilterId,
}: {
  teamFilterId: string;
}) {
  const offseasonYear = currentOffseasonLabelYear();
  const txPage = await listTransactionEvents(
    { teamId: teamFilterId, offseasonYear },
    { page: 1, pageSize: 6 }
  ).catch(() => ({
    events: [],
    total: 0,
    page: 1,
    pageSize: 6,
    pageCount: 0,
  }));

  const relatedByEventId: Record<string, NbaTransactionEvent[]> = {};
  await Promise.all(
    txPage.events
      .filter((e) => e.relatedClusterId)
      .map(async (e) => {
        const rel = await getTransactionEventWithRelations(e.id).catch(() => null);
        const others = rel?.relatedEvents.filter((r) => r.id !== e.id) ?? [];
        if (others.length) relatedByEventId[e.id] = others;
      })
  );

  const txResolutionsByEventId = Object.fromEntries(
    await resolvePlayersForTransactionEvents([
      ...txPage.events,
      ...Object.values(relatedByEventId).flat(),
    ]).catch(() => new Map())
  );

  return (
    <section
      id="transactions"
      className="scroll-mt-16 flex flex-col gap-3"
      aria-label="Transactions"
    >
      <div>
        <h2 className="text-[20px] font-bold tracking-tight">
          {offseasonYear} Offseason
        </h2>
        <p className="text-[14px] text-muted-foreground">
          Latest transactions involving this team, from ESPN and NBA.com.
        </p>
      </div>
      <div className="sports-card p-4 sm:p-5">
        <TeamTransactionsSection
          events={txPage.events}
          teamFilterId={teamFilterId}
          offseasonYear={offseasonYear}
          resolutionsByEventId={txResolutionsByEventId}
          relatedByEventId={relatedByEventId}
        />
      </div>
    </section>
  );
}
