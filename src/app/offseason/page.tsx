import Link from "next/link";

import {
  OffseasonFilters,
  TimelineByMonth,
  TransactionEventDetail,
  TransactionEventRow,
} from "@/components/offseason/transaction-event-ui";
import { TeamLogo } from "@/components/brand/team-logo";
import {
  getOffseasonPulse,
  getOffseasonTimeline,
  getTeamOffseasonActivity,
  getTransactionEvent,
  getTransactionEventCoverage,
  listAvailableOffseasonYears,
} from "@/data/queries/offseason-tracker";
import {
  currentOffseasonLabelYear,
  offseasonWindowForYear,
} from "@/data/providers/transactions/offseason-window";
import { ESPN_TEAM_META } from "@/data/providers/nba/team-meta";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { parseSeasonParam } from "@/data/providers/historical/season-range";
import {
  sourceTextCategoryLabel,
  type TransactionType,
} from "@/offseason";

export const metadata = {
  title: "Transactions",
  description:
    "NBA transaction events from the ESPN archive — factual date, team, and description.",
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
  const brand = resolveTeamBrand(raw.trim());
  return brand?.espnTeamId ?? raw.trim();
}

export default async function OffseasonPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const years = await listAvailableOffseasonYears({ force: true });
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

  const [pulse, timeline, activity, coverage, detail] = await Promise.all([
    getOffseasonPulse({ offseasonYear }),
    getOffseasonTimeline(filters, { page, pageSize: 50 }),
    getTeamOffseasonActivity(
      { offseasonYear: season ? undefined : offseasonYear, season, teamId },
      { limit: 8 }
    ),
    getTransactionEventCoverage({ force: true }),
    eventId ? getTransactionEvent(eventId) : Promise.resolve(null),
  ]);

  const teamOptions = Object.entries(ESPN_TEAM_META)
    .map(([id]) => {
      const brand = resolveTeamBrand(id);
      return {
        teamId: id,
        label: brand ? `${brand.abbr}` : id,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));

  const latest = timeline.page.events.slice(0, 8);
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
        <p className="max-w-2xl text-[15px] text-muted-foreground">
          What was recorded from {window.startDate} to {window.endDate} (into{" "}
          {window.upcomingSeason}). Free-text ESPN events — not a structured
          trade ledger.
        </p>
      </header>

      <section className="sports-card grid gap-3 px-4 py-4 sm:grid-cols-3 sm:px-5">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            This offseason
          </p>
          <p className="mt-1 text-[22px] font-bold tabular-nums tracking-tight">
            {pulse.eventCount}
          </p>
          <p className="text-[12px] text-muted-foreground">transaction events</p>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            This week
          </p>
          <p className="mt-1 text-[22px] font-bold tabular-nums tracking-tight">
            {pulse.eventsThisWeek}
          </p>
          <p className="text-[12px] text-muted-foreground">
            events · {pulse.teamsThisWeek} teams
          </p>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            Most active
          </p>
          {pulse.mostActiveTeam ? (
            <>
              <p className="mt-1 text-[22px] font-bold tracking-tight">
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
            <p className="mt-1 text-[13px] text-muted-foreground">No events yet</p>
          )}
        </div>
      </section>

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

      {detail ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-[15px] font-bold tracking-tight">Event detail</h2>
          <TransactionEventDetail event={detail} />
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-[15px] font-bold tracking-tight">Latest</h2>
        <div className="sports-card px-4 py-2 sm:px-5">
          {latest.length ? (
            latest.map((e) => (
              <TransactionEventRow key={e.id} event={e} compact />
            ))
          ) : (
            <p className="py-6 text-center text-[13px] text-muted-foreground">
              No events in this view.
            </p>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[15px] font-bold tracking-tight">
          Most active teams
        </h2>
        <p className="text-[12px] text-muted-foreground">
          Counts are transaction events recorded for each team. Categories are
          source-text classifications, not official trade tallies.
        </p>
        <ul className="sports-card divide-y divide-border/70 px-4 py-1 sm:px-5">
          {activity.map((t) => {
            const brand = brandFor(t.teamId, t.teamAbbr);
            const tradeRelated = t.bySourceTextCategory.trade ?? 0;
            return (
              <li
                key={t.teamId}
                className="flex items-center gap-3 py-3"
              >
                <TeamLogo teamKey={brand?.abbr ?? t.teamAbbr ?? t.teamId} size="sm" />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/offseason?year=${offseasonYear}&team=${t.teamId}`}
                    className="text-[14px] font-bold underline-offset-2 hover:underline"
                  >
                    {brand?.abbr ?? t.teamAbbr ?? t.teamId}
                  </Link>
                  <p className="text-[12px] text-muted-foreground">
                    {t.eventCount} events · {t.activeDays} active days
                    {tradeRelated
                      ? ` · ${tradeRelated} classified as trade-related by source text`
                      : ""}
                  </p>
                </div>
                <Link
                  href={`/teams/${t.teamId}`}
                  className="text-[12px] font-semibold text-muted-foreground underline-offset-2 hover:underline"
                >
                  Profile
                </Link>
              </li>
            );
          })}
          {!activity.length ? (
            <li className="py-6 text-center text-[13px] text-muted-foreground">
              No team activity for these filters.
            </li>
          ) : null}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-[15px] font-bold tracking-tight">
            Offseason timeline
          </h2>
          <p className="text-[12px] text-muted-foreground">
            {timeline.page.total} events · page {timeline.page.page}/
            {timeline.page.pageCount}
          </p>
        </div>
        <TimelineByMonth byMonth={timeline.byMonth} />
        {timeline.page.pageCount > 1 ? (
          <div className="flex flex-wrap gap-2">
            {timeline.page.page > 1 ? (
              <Link
                href={`/offseason?${new URLSearchParams({
                  year: String(offseasonYear),
                  ...(teamId ? { team: teamId } : {}),
                  ...(q ? { q } : {}),
                  ...(dateFrom ? { from: dateFrom } : {}),
                  ...(dateTo ? { to: dateTo } : {}),
                  ...(season ? { season } : {}),
                  page: String(timeline.page.page - 1),
                }).toString()}`}
                className="rounded-md bg-secondary px-3 py-1.5 text-[13px] font-semibold"
              >
                Previous
              </Link>
            ) : null}
            {timeline.page.page < timeline.page.pageCount ? (
              <Link
                href={`/offseason?${new URLSearchParams({
                  year: String(offseasonYear),
                  ...(teamId ? { team: teamId } : {}),
                  ...(q ? { q } : {}),
                  ...(dateFrom ? { from: dateFrom } : {}),
                  ...(dateTo ? { to: dateTo } : {}),
                  ...(season ? { season } : {}),
                  page: String(timeline.page.page + 1),
                }).toString()}`}
                className="rounded-md bg-secondary px-3 py-1.5 text-[13px] font-semibold"
              >
                Next
              </Link>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="sports-card px-4 py-4 text-[12px] leading-relaxed text-muted-foreground sm:px-5">
        <h2 className="text-[13px] font-bold text-foreground">
          Archive coverage
        </h2>
        <p className="mt-2">
          Source: {coverage.source} v{coverage.datasetVersion ?? "?"} ·{" "}
          {coverage.eventCount.toLocaleString()} events ·{" "}
          {coverage.earliestDate} → {coverage.latestDate}
        </p>
        <p className="mt-1">
          Data format: ESPN transaction events (date, team, description).
          Structured assets / ownership: not available. Genealogy UI ready:{" "}
          {coverage.genealogyUiReady ? "yes" : "no"}.
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
