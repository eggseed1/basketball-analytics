
import {
  OffseasonFilters,
  TimelineFeedByMonth,
  TransactionEventDetail,
  TransactionEventRow,
  RelatedEventClusterCard,
} from "@/components/offseason/transaction-event-ui";
import { OffseasonClientShell } from "@/components/offseason/offseason-client-shell";
import { TransitionLink } from "@/components/continuity/query-nav";
import {
  getOffseasonPulse,
  getOffseasonTimeline,
  getTransactionEventWithRelations,
  getTransactionEventCoverage,
  listAvailableOffseasonYears,
} from "@/data/queries/offseason-tracker";
import { TradeTreeIsland } from "@/components/offseason/trade-tree-island";
import { buildOffseasonFeedItems } from "@/data/providers/transactions/transaction-event-clusters";
import { buildTransactionEventIndex } from "@/data/providers/transactions/transaction-event-index";
import {
  currentOffseasonLabelYear,
  offseasonWindowForYear,
} from "@/data/providers/transactions/offseason-window";
import { ESPN_TEAM_META } from "@/data/providers/nba/team-meta";
import { resolvePlayersForTransactionEvents } from "@/data/queries/transaction-player-resolve";
import type { NbaTransactionEvent } from "@/data/types/transaction-event";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { normalizeTeamParam } from "@/lib/team-identity";
import { parseSeasonParam } from "@/data/providers/historical/season-range";
import {
  sourceTextCategoryLabel,
  type TransactionType,
} from "@/offseason";

export const metadata = {
  title: "Transactions",
  description:
    "NBA transaction events from the ESPN archive - factual date, team, and description.",
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function one(
  sp: Record<string, string | string[] | undefined>,
  key: string
): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

function resolveTeamFilter(raw?: string): string | undefined {
  if (!raw?.trim()) return undefined;
  const normalized = normalizeTeamParam(raw.trim());
  // Offseason archive is ESPN-scoped - canonical id is the ESPN team id.
  return normalized?.canonicalTeamId ?? raw.trim();
}

function collectEventsForResolution(options: {
  timelineEvents: NbaTransactionEvent[];
  latestFeed: ReturnType<typeof buildOffseasonFeedItems>;
  detailBundle: {
    event: NbaTransactionEvent;
    relatedEvents: NbaTransactionEvent[];
  } | null;
}): NbaTransactionEvent[] {
  const byId = new Map<string, NbaTransactionEvent>();
  for (const e of options.timelineEvents) byId.set(e.id, e);
  for (const item of options.latestFeed) {
    if (item.kind === "source_event") byId.set(item.event.id, item.event);
    else for (const e of item.events) byId.set(e.id, e);
  }
  if (options.detailBundle) {
    byId.set(options.detailBundle.event.id, options.detailBundle.event);
    for (const e of options.detailBundle.relatedEvents) byId.set(e.id, e);
  }
  return [...byId.values()];
}

export default async function OffseasonPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  // Use cached index (do not force-rebuild on every page view).
  const years = await listAvailableOffseasonYears();
  const defaultYear = currentOffseasonLabelYear();
  const yearRaw = one(sp, "year");
  const offseasonYear = yearRaw
    ? Number(yearRaw)
    : years.includes(defaultYear)
      ? defaultYear
      : (years[0] ?? defaultYear);

  const teamId = resolveTeamFilter(one(sp, "team"));
  const q = one(sp, "q");
  const dateFrom = one(sp, "from");
  const dateTo = one(sp, "to");
  const eventId = one(sp, "event");
  const rootEventId = one(sp, "root");
  const focusPlayer = one(sp, "player");
  const page = Math.max(1, Number(one(sp, "page") ?? "1") || 1);

  let season: string | undefined;
  const seasonRaw = one(sp, "season");
  if (seasonRaw) {
    try {
      season = parseSeasonParam(seasonRaw);
    } catch {
      season = undefined;
    }
  }

  const window = offseasonWindowForYear(offseasonYear);
  const filters = {
    offseasonYear: season ? undefined : offseasonYear,
    season,
    teamId,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    q: q || undefined,
  };

  // One index build (or cache hit); derive coverage/pulse/timeline from shared TTL.
  const [pulse, timeline, coverage, detailBundle, index] =
    await Promise.all([
      getOffseasonPulse({ offseasonYear }),
      getOffseasonTimeline(filters, { page, pageSize: 50 }),
      getTransactionEventCoverage(),
      eventId
        ? getTransactionEventWithRelations(eventId)
        : Promise.resolve(null),
      buildTransactionEventIndex(),
    ]);

  const latestFeed = buildOffseasonFeedItems(
    timeline.page.events.slice(0, 12),
    index.clusters,
    index.byId
  ).slice(0, 8);

  const eventsToResolve = collectEventsForResolution({
    timelineEvents: timeline.page.events,
    latestFeed,
    detailBundle: detailBundle
      ? {
          event: detailBundle.event,
          relatedEvents: detailBundle.relatedEvents ?? [],
        }
      : null,
  });
  const resolutionMap = await resolvePlayersForTransactionEvents(
    eventsToResolve
  ).catch(() => new Map());
  const playerResolutionsByEventId: Record<
    string,
    import("@/lib/transaction-player-resolution").TransactionPlayerResolution[]
  > = {};
  for (const [id, rows] of resolutionMap) {
    playerResolutionsByEventId[id] = rows;
  }

  const teamOptions = Object.entries(ESPN_TEAM_META)
    .map(([id]) => {
      const brand = resolveTeamBrand(id);
      return {
        teamId: id,
        label: brand ? `${brand.abbr}` : id,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));

  const brandFor = (id: string, abbr?: string) =>
    resolveTeamBrand(id) ?? resolveTeamBrand(abbr);

  return (
    <main className="site-shell flex flex-col gap-5 py-5 sm:py-7">
      <header className="flex flex-col gap-2">
        <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          Transactions · ESPN archive
        </p>
        <h1 className="text-[28px] font-bold tracking-tight sm:text-[32px]">
          {offseasonYear} NBA Offseason
        </h1>
        <p className="max-w-2xl text-[16px] text-muted-foreground">
          What was recorded from {window.startDate} to {window.endDate} (into{" "}
          {window.upcomingSeason}). Free-text ESPN source events - not a
          structured trade ledger.
        </p>
      </header>

      <section className="sports-card grid gap-3 px-4 py-4 sm:grid-cols-3 sm:px-5">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
            This offseason
          </p>
          <p className="mt-1 text-[24px] font-bold tabular-nums tracking-tight">
            {pulse.eventCount}
          </p>
          <p className="text-[12px] text-muted-foreground">transaction events</p>
        </div>
        <div>
          <p className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
            This week
          </p>
          <p className="mt-1 text-[24px] font-bold tabular-nums tracking-tight">
            {pulse.eventsThisWeek}
          </p>
          <p className="text-[12px] text-muted-foreground">
            events · {pulse.teamsThisWeek} teams
          </p>
        </div>
        <div>
          <p className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
            Most active
          </p>
          {pulse.mostActiveTeam ? (
            <>
              <p className="mt-1 text-[24px] font-bold tracking-tight">
                {brandFor(
                  pulse.mostActiveTeam.teamId,
                  pulse.mostActiveTeam.teamAbbr
                )?.abbr ?? pulse.mostActiveTeam.teamAbbr}
              </p>
              <p className="text-[12px] text-muted-foreground">
                {pulse.mostActiveTeam.eventCount} events
              </p>
            </>
          ) : (
            <p className="mt-1 text-[14px] text-muted-foreground">No events yet</p>
          )}
        </div>
      </section>

      <OffseasonClientShell>
        <OffseasonFilters
          offseasonYear={offseasonYear}
          years={years.length ? years : [offseasonYear]}
          teamId={teamId}
          teams={teamOptions}
          q={q}
          dateFrom={dateFrom}
          dateTo={dateTo}
          season={season}
        />

        {teamId ? (
          <TransitionLink
            href={`/teams/${encodeURIComponent(teamId)}`}
            className="text-[13px] font-semibold text-primary hover:underline"
          >
            Open team page
          </TransitionLink>
        ) : null}

        <div className="query-updating-content flex flex-col gap-5">
          <TradeTreeIsland
            teamId={teamId}
            rootEventId={rootEventId}
            focusPlayer={focusPlayer}
            offseasonYear={offseasonYear}
            teams={teamOptions.map((t) => ({ id: t.teamId, label: t.label }))}
          />

          {detailBundle ? (
            <section className="flex flex-col gap-2">
              <h2 className="text-[16px] font-bold tracking-tight">
                Event detail
              </h2>
              <TransactionEventDetail
                event={detailBundle.event}
                cluster={detailBundle.cluster}
                relatedEvents={detailBundle.relatedEvents}
                playerResolutionsByEventId={playerResolutionsByEventId}
              />
            </section>
          ) : null}

          <section className="flex flex-col gap-2">
            <h2 className="text-[16px] font-bold tracking-tight">Latest</h2>
            <div className="sports-card px-4 py-2 sm:px-5">
              {latestFeed.length ? (
                latestFeed.map((item) =>
                  item.kind === "related_event_cluster" ? (
                    <RelatedEventClusterCard
                      key={item.cluster.id}
                      cluster={item.cluster}
                      events={item.events}
                      playerResolutionsByEventId={playerResolutionsByEventId}
                    />
                  ) : (
                    <TransactionEventRow
                      key={item.event.id}
                      event={item.event}
                      compact
                      playerResolutions={
                        playerResolutionsByEventId[item.event.id]
                      }
                    />
                  )
                )
              ) : (
                <p className="py-6 text-center text-[14px] text-muted-foreground">
                  No events in this view.
                </p>
              )}
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <h2 className="text-[16px] font-bold tracking-tight">
                Offseason timeline
              </h2>
              <p className="text-[12px] text-muted-foreground">
                {timeline.page.total} source events · {timeline.feedTotal} feed
                groups · page {timeline.feedPage}/{timeline.feedPageCount}
              </p>
            </div>
            <TimelineFeedByMonth
              byMonth={timeline.feedByMonth}
              playerResolutionsByEventId={playerResolutionsByEventId}
            />
            {timeline.feedPageCount > 1 ? (
              <div className="flex flex-wrap gap-2">
                {timeline.feedPage > 1 ? (
                  <TransitionLink
                    href={`/offseason?${new URLSearchParams({
                      year: String(offseasonYear),
                      ...(teamId ? { team: teamId } : {}),
                      ...(q ? { q } : {}),
                      ...(dateFrom ? { from: dateFrom } : {}),
                      ...(dateTo ? { to: dateTo } : {}),
                      ...(season ? { season } : {}),
                      page: String(timeline.feedPage - 1),
                    }).toString()}`}
                    scroll={false}
                    className="rounded-md bg-secondary px-3 py-1.5 text-[14px] font-semibold"
                  >
                    Previous
                  </TransitionLink>
                ) : null}
                {timeline.feedPage < timeline.feedPageCount ? (
                  <TransitionLink
                    href={`/offseason?${new URLSearchParams({
                      year: String(offseasonYear),
                      ...(teamId ? { team: teamId } : {}),
                      ...(q ? { q } : {}),
                      ...(dateFrom ? { from: dateFrom } : {}),
                      ...(dateTo ? { to: dateTo } : {}),
                      ...(season ? { season } : {}),
                      page: String(timeline.feedPage + 1),
                    }).toString()}`}
                    scroll={false}
                    className="rounded-md bg-secondary px-3 py-1.5 text-[14px] font-semibold"
                  >
                    Next
                  </TransitionLink>
                ) : null}
              </div>
            ) : null}
          </section>
        </div>
      </OffseasonClientShell>

      <section className="sports-card px-4 py-4 text-[12px] leading-relaxed text-muted-foreground sm:px-5">
        <h2 className="text-[14px] font-bold text-foreground">
          Archive coverage
        </h2>
        <p className="mt-2">
          Source: {coverage.source} v{coverage.datasetVersion ?? "?"} ·{" "}
          {coverage.sourceEventCount.toLocaleString()} source events ·{" "}
          {coverage.relatedClusterCount.toLocaleString()} related clusters ·{" "}
          {coverage.structuredTransactionCount} structured transactions ·{" "}
          {coverage.ownershipEdgeCount} ownership edges ·{" "}
          {coverage.earliestDate} → {coverage.latestDate}
        </p>
        <p className="mt-1">
          {coverage.genealogyUiReady
            ? "Pick and exception genealogy views are enabled for covered assets."
            : "Pick and exception genealogy is incomplete — asset history may be partial."}
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          {coverage.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
        <p className="mt-2">
          Example source-text labels include{" "}
          {(
            ["trade", "signing", "waive", "draft"] as TransactionType[]
          )
            .map((c) => sourceTextCategoryLabel(c))
            .join(", ")}
          .
        </p>
      </section>
    </main>
  );
}
