import { Suspense, type ReactNode } from "react";

import { WatchlistPanel } from "@/components/home/watchlist-panel";
import { AnalyticsDesk } from "@/components/home/analytics-desk";
import { MotionReveal } from "@/components/continuity/motion-reveal";
import { HomeLoadingWatchdog } from "@/components/home/home-loading-watchdog";
import { SectionLink } from "@/components/ui/section-link";
import { HomeModuleFrame, HomeModuleSkeleton } from "@/components/home/home-module-skeleton";
import { SeasonMomentCard, SeasonPhaseBar } from "@/components/home/season-moment";
import { JsonLd } from "@/components/seo/json-ld";
import { getHomeShellBootstrap } from "@/data/queries/home-season-moment-shell";
import {
  homeLayoutForPhase,
  type HomeModuleId,
  type HomeSeasonMoment,
} from "@/lib/home-season-moment";
import { yieldForStreaming } from "@/lib/stream-yield";
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

async function HomeCalendar({ season }: { season: string }) {
  const { WeekGameCalendar } = await import(
    "@/components/home/week-game-calendar"
  );
  return <WeekGameCalendar season={season} />;
}

async function HomeSeasonMomentLive() {
  const { getHomeSeasonMoment } = await import(
    "@/data/queries/home-season-moment"
  );
  const moment = await getHomeSeasonMoment();
  return <SeasonMomentCard moment={moment} />;
}

async function HomeSeasonPhaseBarLive() {
  const { getHomeSeasonMoment } = await import(
    "@/data/queries/home-season-moment"
  );
  const moment = await getHomeSeasonMoment();
  return <SeasonPhaseBar moment={moment} />;
}

function HomeNews() {
  // Client-loaded so homepage SSR is not blocked on RSS / outlet latency.
  return <AnalyticsDesk articles={[]} embedded />;
}

async function HomeStandings({
  season,
  race = false,
}: {
  season: string;
  race?: boolean;
}) {
  const { HomeStandingsPanel } = await import(
    "@/components/home/home-standings-panel"
  );
  return <HomeStandingsPanel season={season} race={race} />;
}

async function HomeTopPerformers() {
  const [{ getHomeAnalytics }, { TopPerformersPanel }] = await Promise.all([
    import("@/data/queries/home"),
    import("@/components/home/top-performers-panel"),
  ]);
  const data = await getHomeAnalytics();
  const byName = new Map(
    data.performerSeasons.map((row) => [row.playerName.toLowerCase(), row])
  );
  const slim = (
    rows: typeof data.tsLeaders
  ): typeof data.performerSeasons =>
    rows.map((row) => {
      const hit = byName.get(row.playerName.toLowerCase());
      return {
        playerId: row.playerId,
        playerName: row.playerName,
        teamKey: hit?.teamKey,
        teamAbbr: hit?.teamAbbr ?? row.teamAbbreviation ?? undefined,
        trueShootingPct:
          row.trueShootingPct != null && row.trueShootingPct > 0
            ? row.trueShootingPct
            : null,
        usagePct:
          row.usagePct != null && row.usagePct > 0 ? row.usagePct : null,
      };
    });
  return (
    <TopPerformersPanel
      season={data.season}
      drblLeaders={data.drblLeaders}
      darkoLeaders={data.darkoLeaders}
      raptorLeaders={data.raptorLeaders}
      tsLeaders={slim(data.tsLeaders)}
      usageStars={slim(data.usageStars)}
      performerSeasons={data.performerSeasons}
      drblOverlayOk={data.drblOverlayOk}
      drblFallbackNote={data.drblFallbackNote}
    />
  );
}

async function HomeHotCold() {
  const [
    { statDetectiveSeason, statDetectiveWindow },
    { HotColdColumns },
  ] = await Promise.all([
    import("@/data/runtime/stat-detective-windows"),
    import("@/components/explore/hot-cold-board"),
  ]);
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
  const [{ getLiveRecentInsights }, { FindingsSection }] = await Promise.all([
    import("@/data/queries/recent-insights-live"),
    import("@/components/home/findings-section"),
  ]);
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
  const [{ getLiveRecentInsights }, { AboveNormPanel }] = await Promise.all([
    import("@/data/queries/recent-insights-live"),
    import("@/components/home/above-norm-panel"),
  ]);
  const live = await getLiveRecentInsights();
  if (live) return <AboveNormPanel nights={live.aboveNorm} />;
  const { getBundledAboveNorm } = await import(
    "@/data/runtime/recent-insights-snapshot"
  );
  return <AboveNormPanel nights={getBundledAboveNorm()} />;
}

const SIDEBAR_FEED_BUDGET_MS = 4_500;

async function HomeInjuries() {
  const [
    { getInjuryReport },
    { withBudget },
    { InjuryReportPanel },
  ] = await Promise.all([
    import("@/data/queries/injury-report"),
    import("@/data/queries/budget"),
    import("@/components/home/injury-report-panel"),
  ]);
  const { value } = await withBudget(getInjuryReport(), SIDEBAR_FEED_BUDGET_MS, null);
  if (!value) return null;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  return <InjuryReportPanel entries={value.entries} today={today} />;
}

async function HomeLeagueMoves() {
  const [
    { getLeagueMoves },
    { withBudget },
    { LeagueMovesPanel },
  ] = await Promise.all([
    import("@/data/queries/league-moves"),
    import("@/data/queries/budget"),
    import("@/components/home/league-moves-panel"),
  ]);
  const { value } = await withBudget(getLeagueMoves(), SIDEBAR_FEED_BUDGET_MS, []);
  return <LeagueMovesPanel moves={value} />;
}

const BRACKET_BUDGET_MS = 2_500;

async function HomeBracket({ season }: { season: string }) {
  const [
    { getPlayoffBracketModel },
    { withBudget },
    { PlayoffBracket },
  ] = await Promise.all([
    import("@/data/queries/playoff-bracket"),
    import("@/data/queries/budget"),
    import("@/components/explore/playoff-bracket"),
  ]);
  const { value } = await withBudget(
    getPlayoffBracketModel(season).catch(() => null),
    BRACKET_BUDGET_MS,
    null
  );
  if (!value?.model) return null;
  return <PlayoffBracket model={value.model} />;
}

async function HomeTransactions({
  limit,
  season,
  tippedOff,
}: {
  limit: number;
  season: string;
  tippedOff: boolean;
}) {
  const { OffseasonPulsePanel } = await import(
    "@/components/home/offseason-pulse-panel"
  );
  return (
    <OffseasonPulsePanel limit={limit} season={season} tippedOff={tippedOff} />
  );
}

async function HomeSentiment() {
  const { SentimentMoversPanel } = await import(
    "@/components/home/sentiment-movers-panel"
  );
  return <SentimentMoversPanel />;
}

async function HomeContractShowcase() {
  const { ContractShowcasePanel } = await import(
    "@/components/home/contract-showcase-panel"
  );
  return <ContractShowcasePanel />;
}

async function HomeSeasonGlance() {
  const { SeasonPulsePanel } = await import(
    "@/components/home/season-pulse-panel"
  );
  return <SeasonPulsePanel />;
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
  season: string
) {
  const offseason = moment.phase === "draft-free-agency" || moment.phase === "offseason";
  switch (id) {
    case "moment":
      // Always stream — shell moment has empty marks (no game-snapshot on TTFB).
      return (
        <Streamed key={id} id={id}>
          <HomeSeasonMomentLive />
        </Streamed>
      );
    case "phase-bar":
      return (
        <Streamed key={id} id={id}>
          <HomeSeasonPhaseBarLive />
        </Streamed>
      );
    case "calendar":
      return (
        <Streamed key={id} id={id}>
          <HomeCalendar season={season} />
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
          <HomeStandings season={season} race />
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
          <HomeTransactions
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
          <HomeSentiment />
        </Streamed>
      );
    case "season-glance":
      return (
        <Streamed key={id} id={id}>
          <HomeSeasonGlance />
        </Streamed>
      );
    case "news":
      return <HomeNews key={id} />;
    case "contract-showcase":
      return (
        <Streamed key={id} id={id}>
          <HomeContractShowcase />
        </Streamed>
      );
  }
}

export default async function HomePage() {
  await yieldForStreaming();
  // Calendar phase only — never touch game-snapshot.json on the shell path.
  // Schedule marks / opener copy stream in via Suspense modules.
  const { season, phase, moment } = getHomeShellBootstrap();
  const layout = homeLayoutForPhase(phase);
  const render = (id: HomeModuleId) => (
    <HomeModuleFrame key={id} id={id}>
      {renderModule(id, moment, season)}
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
