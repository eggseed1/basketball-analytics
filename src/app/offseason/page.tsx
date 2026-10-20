
import { getLocale, getTranslations } from "next-intl/server";
import { MotionReveal } from "@/components/continuity/motion-reveal";
import { formatAppDateTime } from "@/i18n/format-date";
import {
  OffseasonFilters,
  TimelineFeedByMonth,
  TransactionEventDetail,
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
import {
  currentOffseasonLabelYear,
  transactionYearWindow,
} from "@/data/providers/transactions/offseason-window";
import { ESPN_TEAM_META } from "@/data/providers/nba/team-meta";
import { resolvePlayersForTransactionEvents } from "@/data/queries/transaction-player-resolve";
import type { NbaTransactionEvent } from "@/data/types/transaction-event";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { redirect } from "next/navigation";
import { normalizeTeamParam } from "@/lib/team-identity";
import {
  sourceTextCategoryLabel,
  type TransactionType,
} from "@/offseason";

export const metadata = {
  alternates: { canonical: "/offseason" },
  title: "NBA transactions",
  description:
    "NBA transaction events, each with its date, team and description.",
};

/** Refresh live ESPN overlay at least hourly. */
export const revalidate = 3600;
export const dynamic = "force-dynamic";

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

function feedPageHref(options: {
  offseasonYear: number;
  teamId?: string;
  q?: string;
  dateFrom?: string;
  dateTo?: string;
  page: number;
}): string {
  return `/offseason?${new URLSearchParams({
    year: String(options.offseasonYear),
    ...(options.teamId ? { team: options.teamId } : {}),
    ...(options.q ? { q: options.q } : {}),
    ...(options.dateFrom ? { from: options.dateFrom } : {}),
    ...(options.dateTo ? { to: options.dateTo } : {}),
    page: String(options.page),
  }).toString()}`;
}

function longDate(iso: string, locale: string): string {
  return formatAppDateTime(`${iso}T12:00:00Z`, locale, {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function resolveTeamFilter(raw?: string): string | undefined {
  if (!raw?.trim()) return undefined;
  const normalized = normalizeTeamParam(raw.trim());
  // Offseason archive is ESPN-scoped - canonical id is the ESPN team id.
  return normalized?.canonicalTeamId ?? raw.trim();
}

function collectEventsForResolution(options: {
  timelineEvents: NbaTransactionEvent[];
  detailBundle: {
    event: NbaTransactionEvent;
    relatedEvents: NbaTransactionEvent[];
  } | null;
}): NbaTransactionEvent[] {
  const byId = new Map<string, NbaTransactionEvent>();
  for (const e of options.timelineEvents) byId.set(e.id, e);
  if (options.detailBundle) {
    byId.set(options.detailBundle.event.id, options.detailBundle.event);
    for (const e of options.detailBundle.relatedEvents) byId.set(e.id, e);
  }
  return [...byId.values()];
}

export default async function OffseasonPage({ searchParams }: PageProps) {
  const t = await getTranslations("Offseason");
  const locale = await getLocale();
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
  const focusPlayer = one(sp, "player");
  if (focusPlayer && teamId) {
    redirect(`/acquisitions?${new URLSearchParams({ team: teamId, player: focusPlayer }).toString()}`);
  }
  const page = Math.max(1, Number(one(sp, "page") ?? "1") || 1);

  const window = transactionYearWindow(offseasonYear);
  const ongoing = new Date().toISOString().slice(0, 10) <= window.endDate;
  const filters = {
    transactionYear: offseasonYear,
    teamId,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    q: q || undefined,
  };

  // One index build (or cache hit); derive coverage/pulse/timeline from shared TTL.
  const [pulse, timeline, coverage, detailBundle] =
    await Promise.all([
      getOffseasonPulse({ transactionYear: offseasonYear }),
      getOffseasonTimeline(filters, { page, pageSize: 50 }),
      getTransactionEventCoverage(),
      eventId
        ? getTransactionEventWithRelations(eventId)
        : Promise.resolve(null),
    ]);

  const eventsToResolve = collectEventsForResolution({
    timelineEvents: timeline.page.events,
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
    <main data-motion-page className="site-shell flex flex-col gap-5 py-5 sm:py-7">
      <MotionReveal />
      <header className="flex flex-col gap-2">
        <h1 className="text-[28px] font-bold tracking-tight sm:text-[32px]">
          {t("title", { season: window.upcomingSeason })}
        </h1>
        <p className="type-caption max-w-2xl text-muted-foreground">
          {ongoing
            ? t("subtitleOngoing", {
                start: longDate(window.startDate, locale),
                season: window.upcomingSeason,
              })
            : t("subtitleClosed", {
                start: longDate(window.startDate, locale),
                end: longDate(window.endDate, locale),
                season: window.upcomingSeason,
              })}
        </p>
      </header>

      <section className="sports-card grid gap-3 px-4 py-4 sm:grid-cols-3 sm:px-5">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
            {t("seasonStat", {
              season: window.upcomingSeason,
              phase: ongoing ? t("soFar") : t("total"),
            })}
          </p>
          <p className="mt-1 text-[24px] font-bold tabular-nums tracking-tight">
            {pulse.eventCount}
          </p>
          <p className="text-[12px] text-muted-foreground">{t("transactionEvents")}</p>
        </div>
        <div>
          <p className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
            {t("thisWeek")}
          </p>
          <p className="mt-1 text-[24px] font-bold tabular-nums tracking-tight">
            {pulse.eventsThisWeek}
          </p>
          <p className="text-[12px] text-muted-foreground">
            {t("eventsTeams", { teams: pulse.teamsThisWeek })}
          </p>
        </div>
        <div>
          <p className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
            {t("mostActive")}
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
                {t("eventsCount", { count: pulse.mostActiveTeam.eventCount })}
              </p>
            </>
          ) : (
            <p className="mt-1 text-[14px] text-muted-foreground">{t("noEventsYet")}</p>
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
        />

        {teamId ? (
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <TransitionLink
              href={`/teams/${encodeURIComponent(teamId)}`}
              className="text-[13px] font-semibold text-primary hover:underline"
            >
              {t("openTeamPage")}
            </TransitionLink>
            <TransitionLink
              href={`/acquisitions?team=${encodeURIComponent(teamId)}`}
              className="text-[13px] font-semibold text-primary hover:underline"
            >
              {t("howTheyGotEach", {
                abbr: resolveTeamBrand(teamId)?.abbr ?? "team",
              })}
            </TransitionLink>
          </div>
        ) : null}

        <div className="query-updating-content flex flex-col gap-5">
          {detailBundle ? (
            <section className="flex flex-col gap-2">
              <h2 className="text-[16px] font-bold tracking-tight">
                {t("eventDetail")}
              </h2>
              <TransactionEventDetail
                event={detailBundle.event}
                cluster={detailBundle.cluster}
                relatedEvents={detailBundle.relatedEvents}
                playerResolutionsByEventId={playerResolutionsByEventId}
              />
            </section>
          ) : null}

          <section className="flex flex-col gap-3">
            <TimelineFeedByMonth
              byMonth={timeline.feedByMonth}
              playerResolutionsByEventId={playerResolutionsByEventId}
            />
            {timeline.feedPageCount > 1 ? (
              <div className="flex flex-wrap gap-2">
                {timeline.feedPage > 1 ? (
                  <TransitionLink
                    href={feedPageHref({
                      offseasonYear,
                      teamId,
                      q,
                      dateFrom,
                      dateTo,
                      page: timeline.feedPage - 1,
                    })}
                    scroll={false}
                    className="sports-pill"
                  >
                    {t("previous")}
                  </TransitionLink>
                ) : null}
                {timeline.feedPage < timeline.feedPageCount ? (
                  <TransitionLink
                    href={feedPageHref({
                      offseasonYear,
                      teamId,
                      q,
                      dateFrom,
                      dateTo,
                      page: timeline.feedPage + 1,
                    })}
                    scroll={false}
                    className="sports-pill"
                  >
                    {t("next")}
                  </TransitionLink>
                ) : null}
              </div>
            ) : null}
          </section>
        </div>
      </OffseasonClientShell>

      <section className="sports-card px-4 py-4 text-[12px] leading-relaxed text-muted-foreground sm:px-5">
        <h2 className="text-[14px] font-bold text-foreground">
          {t("archiveCoverage")}
        </h2>
        <p className="mt-2">
          {t("archiveStats", {
            notes: coverage.sourceEventCount.toLocaleString(),
            clusters: coverage.relatedClusterCount.toLocaleString(),
            structured: coverage.structuredTransactionCount,
            edges: coverage.ownershipEdgeCount,
            earliest: coverage.earliestDate ?? "—",
            latest: coverage.latestDate ?? "—",
          })}
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          {coverage.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
        <p className="mt-2">
          {t("exampleLabels", {
            labels: (
              ["trade", "signing", "waive", "draft"] as TransactionType[]
            )
              .map((c) => sourceTextCategoryLabel(c))
              .join(", "),
          })}
        </p>
      </section>
    </main>
  );
}
