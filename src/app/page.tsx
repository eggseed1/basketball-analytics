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
import { FindingsSection } from "@/components/home/findings-section";
import { HomeStandingsPanel } from "@/components/home/home-standings-panel";
import { SentimentMoversPanel } from "@/components/home/sentiment-movers-panel";
import { TopPerformersPanel } from "@/components/home/top-performers-panel";

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

async function HomeFindings() {
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

export default function HomePage() {
  const season = canonicalSeasonFromStartYear(currentNbaStartYear());

  return (
    <main className="site-shell flex flex-col gap-5 py-5 sm:py-7">
      <Suspense fallback={<BlockSkeleton className="h-52" />}>
        <HomeCalendar season={season} />
      </Suspense>

      <div className="grid min-w-0 items-start gap-5 lg:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-7">
          <WatchlistPanel />
          <div className="hidden min-w-0 lg:block">
            <Suspense fallback={<BlockSkeleton className="h-48" />}>
              <SentimentMoversPanel />
            </Suspense>
          </div>
          <Suspense fallback={<BlockSkeleton className="h-36" />}>
            <OffseasonPulsePanel />
          </Suspense>
          <HomeNews />
        </div>
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-5">
          <Suspense fallback={<BlockSkeleton className="h-72" />}>
            <HomeStandings season={season} />
          </Suspense>
          <Suspense fallback={<BlockSkeleton className="h-80" />}>
            <HomeTopPerformers />
          </Suspense>
        </div>
      </div>

      <div className="min-w-0 lg:hidden">
        <Suspense fallback={<BlockSkeleton className="h-48" />}>
          <SentimentMoversPanel />
        </Suspense>
      </div>

      <Suspense fallback={<BlockSkeleton className="h-40" />}>
        <HomeFindings />
      </Suspense>
    </main>
  );
}
