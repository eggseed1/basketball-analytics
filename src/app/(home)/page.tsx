import { WatchlistPanel } from "@/components/home/watchlist-panel";
import { WeekGameCalendar } from "@/components/home/week-game-calendar";
import { OffseasonPulsePanel } from "@/components/home/offseason-pulse-panel";
import { getHomeAnalyticsCached } from "@/data/queries/request-cache";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { Suspense, type ReactNode } from "react";

import { AnalyticsDesk } from "@/components/home/analytics-desk";
import { MotionReveal } from "@/components/continuity/motion-reveal";
import { HomeLoadingWatchdog } from "@/components/home/home-loading-watchdog";
import { SectionLink } from "@/components/ui/section-link";
import { HotColdColumns } from "@/components/explore/hot-cold-board";
import { AboveNormPanel } from "@/components/home/above-norm-panel";
import { FindingsSection } from "@/components/home/findings-section";
import { InjuryReportPanel } from "@/components/home/injury-report-panel";
import { LeagueMovesPanel } from "@/components/home/league-moves-panel";
import { SeasonPulsePanel } from "@/components/home/season-pulse-panel";
import { HomeStandingsPanel } from "@/components/home/home-standings-panel";
import { HomeModuleFrame, HomeModuleSkeleton } from "@/components/home/home-module-skeleton";
import { ContractShowcasePanel } from "@/components/home/contract-showcase-panel";
import { SentimentMoversPanel } from "@/components/home/sentiment-movers-panel";
import { TopPerformersPanel } from "@/components/home/top-performers-panel";
import { SeasonMomentCard, SeasonPhaseBar } from "@/components/home/season-moment";
import { PlayoffBracket } from "@/components/explore/playoff-bracket";
import {
  getHomeSeasonMoment,
  getHomeSeasonMomentSync,
  homeSeasonMomentNeedsLiveEnrichment,
  homeShellPhase,
} from "@/data/queries/home-season-moment";
import {
  homeLayoutForPhase,
  type HomeModuleId,
  type HomeSeasonMoment,
} from "@/lib/home-season-moment";
import { yieldForStreaming } from "@/lib/stream-yield";
import { JsonLd } from "@/components/seo/json-ld";
import {
  organizationJsonLd,
  SITE_DESCRIPTION,
  SITE_HOME_TITLE,
  SITE_KEYWORDS,
  websiteJsonLd,
} from "@/lib/site-seo";

export const metadata = {
  title: { absolute: SITE_HOME_TITLE },
  description: SITE_DESCRIPTION,
  keywords: [...SITE_KEYWORDS],
  alternates: {
    canonical: "/",
    types: { "application/rss+xml": [{ url: "/findings/feed.xml", title: "DRBL findings" }] },
  },
  openGraph: {
    title: SITE_HOME_TITLE,
    description: SITE_DESCRIPTION,
    url: "/",
  },
  twitter: {
    title: SITE_HOME_TITLE,
    description: SITE_DESCRIPTION,
  },
};

// Keep this request-time. OpenNext has no incremental cache here, so ISR would
// render the whole page before the first byte on every request. Streaming lets
// modules arrive one by one, and the worker page cache shares the result.
export const dynamic = "force-dynamic";

async function HomeCalendar({
  season,
  enrichSchedule,
}: {
  season: string;
  /** When the bundled slate is thin, wait on live October inside this stream. */
  enrichSchedule?: boolean;
}) {
  if (enrichSchedule) {
    await getHomeSeasonMoment();
  }
  return <WeekGameCalendar season={season} />;
}

async function HomeSeasonMomentLive() {
  const moment = await getHomeSeasonMoment();
  return <SeasonMomentCard moment={moment} />;
}

async function HomeSeasonPhaseBarLive() {
  const moment = await getHomeSeasonMoment();
  return <SeasonPhaseBar moment={moment} />;
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
          <h2 className="type-title">Hot & Cold</h2>
          <p className="type-caption text-muted-foreground">
            Scoring over the last 5 games of {season} against each
            player&apos;s own season average. Rows read season avg → last 5.
          </p>
        </div>
        <SectionLink href="/explore/players/hot-cold" className="pt-0.5">
          Open Hot &amp; Cold
        </SectionLink>
      </div>
      <HotColdColumns risers={window.risers} fallers={window.fallers} limit={4} />
    </section>
  );
}

async function HomeFindings() {
  const { getLiveRecentInsights } = await import(
    "@/data/queries/recent-insights-live"
  );
  const live = await getLiveRecentInsights();
  if (live) {
    return <FindingsSection insights={live.insights} />;
  }

  const { getBundledRecentInsights } = await import(
    "@/data/runtime/recent-insights-snapshot"
  );
  const insights = getBundledRecentInsights();
  return <FindingsSection insights={insights} empty={insights.length === 0} />;
}

async function HomeAboveNorm() {
  const { getLiveRecentInsights } = await import(
    "@/data/queries/recent-insights-live"
  );
  const live = await getLiveRecentInsights();
  if (live) return <AboveNormPanel nights={live.aboveNorm} />;
  const { getBundledAboveNorm } = await import(
    "@/data/runtime/recent-insights-snapshot"
  );
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

/**
 * Streamed module. The skeleton stays still. The real section and its cards
 * ease in when they replace it.
 */
function Streamed({ id, children }: { id: HomeModuleId; children: ReactNode }) {
  return (
    <div className="contents">
      <Suspense fallback={<HomeModuleSkeleton id={id} />}>{children}</Suspense>
    </div>
  );
}

function renderModule(
  id: HomeModuleId,
  moment: HomeSeasonMoment,
  season: string,
  enrichSchedule: boolean
) {
  const offseason = moment.phase === "draft-free-agency" || moment.phase === "offseason";
  switch (id) {
    case "moment":
      if (enrichSchedule) {
        return (
          <Streamed key={id} id={id}>
            <HomeSeasonMomentLive />
          </Streamed>
        );
      }
      return <SeasonMomentCard key={id} moment={moment} />;
    case "phase-bar":
      if (enrichSchedule) {
        return (
          <Streamed key={id} id={id}>
            <HomeSeasonPhaseBarLive />
          </Streamed>
        );
      }
      return <SeasonPhaseBar key={id} moment={moment} />;
    case "calendar":
      return (
        <Streamed key={id} id={id}>
          <HomeCalendar season={season} enrichSchedule={enrichSchedule} />
        </Streamed>
      );
    case "bracket":
      return (
        <Streamed key={id} id={id}>
          <HomeBracket season={moment.season} />
        </Streamed>
      );
    case "standings":
      return (
        <Streamed key={id} id={id}>
          <HomeStandings season={season} />
        </Streamed>
      );
    case "standings-race":
      return (
        <Streamed key={id} id={id}>
          <HomeStandingsPanel season={season} race />
        </Streamed>
      );
    case "findings":
      return (
        <Streamed key={id} id={id}>
          <HomeFindings />
        </Streamed>
      );
    case "above-norm":
      return (
        <Streamed key={id} id={id}>
          <HomeAboveNorm />
        </Streamed>
      );
    case "injuries":
      return (
        <Streamed key={id} id={id}>
          <HomeInjuries />
        </Streamed>
      );
    case "league-moves":
      return (
        <Streamed key={id} id={id}>
          <HomeLeagueMoves />
        </Streamed>
      );
    case "top-performers":
      return (
        <Streamed key={id} id={id}>
          <HomeTopPerformers />
        </Streamed>
      );
    case "hot-cold":
      return (
        <Streamed key={id} id={id}>
          <HomeHotCold />
        </Streamed>
      );
    case "transactions":
      return (
        <Streamed key={id} id={id}>
          <OffseasonPulsePanel
            limit={offseason ? 8 : 5}
            season={moment.season}
            tippedOff={
              moment.phase === "opening-weeks" ||
              moment.phase === "regular-season" ||
              moment.phase === "stretch-run" ||
              moment.phase === "play-in" ||
              moment.phase === "playoffs"
            }
          />
        </Streamed>
      );
    case "watchlist":
      return <WatchlistPanel key={id} compact />;
    case "sentiment":
      return (
        <Streamed key={id} id={id}>
          <SentimentMoversPanel />
        </Streamed>
      );
    case "season-glance":
      return <SeasonPulsePanel key={id} />;
    case "news":
      return <HomeNews key={id} />;
    case "contract-showcase":
      return (
        <Streamed key={id} id={id}>
          <ContractShowcasePanel />
        </Streamed>
      );
  }
}

export default async function HomePage() {
  await yieldForStreaming();
  const season = canonicalSeasonFromStartYear(currentNbaStartYear());
  // Snapshot only — never await ESPN before the module grid. Thin-schedule
  // enrichment runs inside streamed moment/calendar modules.
  const momentSync = getHomeSeasonMomentSync();
  const enrichSchedule = homeSeasonMomentNeedsLiveEnrichment(momentSync);
  const phase = homeShellPhase(momentSync);
  const moment: HomeSeasonMoment = enrichSchedule
    ? { ...momentSync, phase }
    : momentSync;
  const layout = homeLayoutForPhase(phase);
  const render = (id: HomeModuleId) => (
    <HomeModuleFrame key={id} id={id}>
      {renderModule(id, moment, season, enrichSchedule)}
    </HomeModuleFrame>
  );

  return (
    <main
      data-motion-page
      data-home-stack
      className="site-shell flex flex-col gap-5 py-5 sm:py-7"
      data-season-phase={phase}
    >
      <JsonLd data={websiteJsonLd()} />
      <JsonLd data={organizationJsonLd()} />
      <h1 className="sr-only">
        DRBL: NBA advanced stats, DRBL/100, WAR1, and basketball analytics
      </h1>
      <MotionReveal />
      <HomeLoadingWatchdog />
      {layout.top.map(render)}

      <div className="home-columns grid min-w-0 grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_21.25rem] xl:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="home-column contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
          {layout.main.map(render)}
        </div>
        <div className="home-column contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
          {layout.side.map(render)}
        </div>
      </div>

      {layout.bottom.map(render)}
    </main>
  );
}
