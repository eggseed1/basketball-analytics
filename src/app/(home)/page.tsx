import { WatchlistPanel } from "@/components/home/watchlist-panel";
import { WeekGameCalendar } from "@/components/home/week-game-calendar";
import { OffseasonPulsePanel } from "@/components/home/offseason-pulse-panel";
import { getHomeAnalyticsCached } from "@/data/queries/request-cache";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { Suspense } from "react";

import { AnalyticsDesk } from "@/components/home/analytics-desk";
import { AppLink } from "@/components/ui/app-link";
import { HotColdColumns } from "@/components/explore/hot-cold-board";
import { AboveNormPanel } from "@/components/home/above-norm-panel";
import { FindingsSection } from "@/components/home/findings-section";
import { InjuryReportPanel } from "@/components/home/injury-report-panel";
import { LeagueMovesPanel } from "@/components/home/league-moves-panel";
import { SeasonGlancePanel } from "@/components/home/season-glance-panel";
import { HomeStandingsPanel } from "@/components/home/home-standings-panel";
import { SentimentMoversPanel } from "@/components/home/sentiment-movers-panel";
import { TopPerformersPanel } from "@/components/home/top-performers-panel";
import { SeasonMomentCard, SeasonPhaseBar } from "@/components/home/season-moment";
import { PlayoffBracket } from "@/components/explore/playoff-bracket";
import { getHomeSeasonMoment } from "@/data/queries/home-season-moment";
import {
  homeLayoutForPhase,
  type HomeModuleId,
  type HomeSeasonMoment,
} from "@/lib/home-season-moment";
import { yieldForStreaming } from "@/lib/stream-yield";

export const metadata = {
  title: "Home",
  description: "NBA games, standings, impact leaders, and analytics coverage.",
};

// Cache the assembled homepage briefly at the route level. Provider-specific
// live-score fetches still keep their own shorter refresh policy.
export const revalidate = 60;

function BlockSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-[var(--radius-md)] bg-[color-mix(in_oklab,var(--foreground)_8%,transparent)] ${className ?? "h-56"}`}
    />
  );
}

async function HomeCalendar({ season }: { season: string }) {
  return <WeekGameCalendar season={season} />;
}

function HomeNews() {
  // Client-loaded so homepage SSR is not blocked on RSS / outlet latency.
  return <AnalyticsDesk articles={[]} embedded />;
}

async function HomeStandings({ season }: { season: string }) {
  return <HomeStandingsPanel season={season} />;
}

async function HomeTopPerformers() {
  const data = await getHomeAnalyticsCached();
  return (
    <TopPerformersPanel
      season={data.season}
      drblLeaders={data.drblLeaders}
      darkoLeaders={data.darkoLeaders}
      raptorLeaders={data.raptorLeaders}
      tsLeaders={data.tsLeaders}
      usageStars={data.usageStars}
      performerSeasons={data.performerSeasons}
      drblOverlayOk={data.drblOverlayOk}
      drblFallbackNote={data.drblFallbackNote}
    />
  );
}

async function HomeHotCold() {
  const { statDetectiveSeason, statDetectiveWindow } = await import(
    "@/data/runtime/stat-detective-windows"
  );
  const season = statDetectiveSeason();
  const window = statDetectiveWindow("last5");
  if (!season || !window.risers.length) return null;
  return (
    <section className="sports-card flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="type-heading">Hot & Cold</h2>
          <p className="type-body-sm text-muted-foreground">
            Scoring over the last 5 games of {season} against each
            player&apos;s own season average. Rows read season avg → last 5.
          </p>
        </div>
        <AppLink
          href="/explore/players/hot-cold"
          className="text-[13px] font-semibold underline-offset-4 hover:underline"
        >
          Open Hot & Cold →
        </AppLink>
      </div>
      <HotColdColumns risers={window.risers} fallers={window.fallers} limit={4} />
    </section>
  );
}

const LIVE_INSIGHTS_BUDGET_MS = 5000;

async function HomeFindings() {
  const { getLiveRecentInsights } = await import("@/data/queries/recent-insights-live");
  const live = await Promise.race([
    getLiveRecentInsights(),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), LIVE_INSIGHTS_BUDGET_MS)),
  ]);
  if (live) {
    return (
      <FindingsSection
        insights={live.insights}
        seasonLabel={live.preseason ? `${live.season} preseason` : live.season}
      />
    );
  }

  const {
    getBundledRecentInsights,
    recentInsightsSnapshotMeta,
  } = await import("@/data/runtime/recent-insights-snapshot");
  const insights = getBundledRecentInsights();
  const meta = recentInsightsSnapshotMeta();
  const seasonLabel =
    meta.season && meta.slateDates?.length
      ? `${meta.season} (through ${meta.slateDates[0]})`
      : meta.season;
  return (
    <FindingsSection
      insights={insights}
      seasonLabel={seasonLabel}
      empty={insights.length === 0}
    />
  );
}

async function HomeAboveNorm() {
  const { getLiveRecentInsights } = await import("@/data/queries/recent-insights-live");
  const live = await Promise.race([
    getLiveRecentInsights(),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), LIVE_INSIGHTS_BUDGET_MS)),
  ]);
  if (live) return <AboveNormPanel nights={live.aboveNorm} />;
  const { getBundledAboveNorm } = await import("@/data/runtime/recent-insights-snapshot");
  return <AboveNormPanel nights={getBundledAboveNorm()} />;
}

const SIDEBAR_FEED_BUDGET_MS = 4_500;

async function HomeInjuries() {
  const { getInjuryReport } = await import("@/data/queries/injury-report");
  const { withBudget } = await import("@/data/queries/budget");
  const { value } = await withBudget(getInjuryReport(), SIDEBAR_FEED_BUDGET_MS, null);
  if (!value) return null;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  return <InjuryReportPanel entries={value.entries} today={today} />;
}

async function HomeLeagueMoves() {
  const { getLeagueMoves } = await import("@/data/queries/league-moves");
  const { withBudget } = await import("@/data/queries/budget");
  const { value } = await withBudget(getLeagueMoves(), SIDEBAR_FEED_BUDGET_MS, []);
  return <LeagueMovesPanel moves={value} />;
}

const BRACKET_BUDGET_MS = 2_500;

async function HomeBracket({ season }: { season: string }) {
  const { getPlayoffBracketModel } = await import("@/data/queries/playoff-bracket");
  const { withBudget } = await import("@/data/queries/budget");
  const { value } = await withBudget(
    getPlayoffBracketModel(season).catch(() => null),
    BRACKET_BUDGET_MS,
    null
  );
  if (!value?.model) return null;
  return <PlayoffBracket model={value.model} />;
}

function renderModule(id: HomeModuleId, moment: HomeSeasonMoment, season: string) {
  const offseason = moment.phase === "draft-free-agency" || moment.phase === "offseason";
  switch (id) {
    case "moment":
      return <SeasonMomentCard key={id} moment={moment} />;
    case "phase-bar":
      return <SeasonPhaseBar key={id} moment={moment} />;
    case "calendar":
      return (
        <Suspense key={id} fallback={<BlockSkeleton className="h-52" />}>
          <HomeCalendar season={season} />
        </Suspense>
      );
    case "bracket":
      return (
        <Suspense key={id} fallback={<BlockSkeleton className="h-72" />}>
          <HomeBracket season={moment.season} />
        </Suspense>
      );
    case "standings":
      return (
        <Suspense key={id} fallback={<BlockSkeleton className="h-72" />}>
          <HomeStandings season={season} />
        </Suspense>
      );
    case "standings-race":
      return (
        <Suspense key={id} fallback={<BlockSkeleton className="h-80" />}>
          <HomeStandingsPanel season={season} race />
        </Suspense>
      );
    case "findings":
      return (
        <Suspense key={id} fallback={<BlockSkeleton className="h-40" />}>
          <HomeFindings />
        </Suspense>
      );
    case "above-norm":
      return (
        <Suspense key={id} fallback={<BlockSkeleton className="h-48" />}>
          <HomeAboveNorm />
        </Suspense>
      );
    case "injuries":
      return (
        <Suspense key={id} fallback={<BlockSkeleton className="h-64" />}>
          <HomeInjuries />
        </Suspense>
      );
    case "league-moves":
      return (
        <Suspense key={id} fallback={<BlockSkeleton className="h-56" />}>
          <HomeLeagueMoves />
        </Suspense>
      );
    case "top-performers":
      return (
        <Suspense key={id} fallback={<BlockSkeleton className="h-80" />}>
          <HomeTopPerformers />
        </Suspense>
      );
    case "hot-cold":
      return (
        <Suspense key={id} fallback={<BlockSkeleton className="h-40" />}>
          <HomeHotCold />
        </Suspense>
      );
    case "transactions":
      return (
        <Suspense key={id} fallback={<BlockSkeleton className="h-36" />}>
          <OffseasonPulsePanel limit={offseason ? 8 : 5} />
        </Suspense>
      );
    case "watchlist":
      return <WatchlistPanel key={id} />;
    case "sentiment":
      return (
        <Suspense key={id} fallback={<BlockSkeleton className="h-48" />}>
          <SentimentMoversPanel />
        </Suspense>
      );
    case "season-glance":
      return <SeasonGlancePanel key={id} />;
    case "news":
      return <HomeNews key={id} />;
  }
}

export default async function HomePage() {
  await yieldForStreaming();
  const season = canonicalSeasonFromStartYear(currentNbaStartYear());
  const moment = await getHomeSeasonMoment();
  const layout = homeLayoutForPhase(moment.phase);
  const render = (id: HomeModuleId) => renderModule(id, moment, season);
  // Below lg the columns use `display: contents`, so the watchlist can sit
  // right under the week strip on phones and tablets.
  const renderGridModule = (id: HomeModuleId) =>
    id === "watchlist" ? (
      <div key={id} className="order-first min-w-0 lg:order-none">
        {render(id)}
      </div>
    ) : (
      render(id)
    );

  return (
    <main className="site-shell flex flex-col gap-5 py-5 sm:py-7" data-season-phase={moment.phase}>
      {layout.top.map(render)}

      <div className="grid min-w-0 grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_21.25rem] xl:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
          {layout.main.map(renderGridModule)}
        </div>
        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
          {layout.side.map(renderGridModule)}
        </div>
      </div>

      {layout.bottom.map(render)}
    </main>
  );
}
