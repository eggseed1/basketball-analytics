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
      className={`animate-pulse rounded-md bg-secondary ${className ?? "h-56"}`}
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
      tsLeaders={data.tsLeaders}
      usageStars={data.usageStars}
      performerSeasons={data.performerSeasons}
      drblOverlayOk={data.drblOverlayOk}
      drblFallbackNote={data.drblFallbackNote}
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

      <div className="grid items-start gap-5 lg:grid-cols-12">
        <div className="flex flex-col gap-4 lg:col-span-7">
          <WatchlistPanel />
          <Suspense fallback={<BlockSkeleton className="h-48" />}>
            <SentimentMoversPanel />
          </Suspense>
          <Suspense fallback={<BlockSkeleton className="h-36" />}>
            <OffseasonPulsePanel />
          </Suspense>
          <HomeNews />
        </div>
        <div className="flex flex-col gap-4 lg:col-span-5">
          <Suspense fallback={<BlockSkeleton className="h-72" />}>
            <HomeStandings season={season} />
          </Suspense>
          <Suspense fallback={<BlockSkeleton className="h-80" />}>
            <HomeTopPerformers />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
