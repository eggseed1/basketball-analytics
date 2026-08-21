import { WatchlistPanel } from "@/components/home/watchlist-panel";
import { WeekGameCalendar } from "@/components/home/week-game-calendar";
import { OffseasonPulsePanel } from "@/components/home/offseason-pulse-panel";
import { getHomeAnalyticsCached } from "@/data/queries/request-cache";
import { fetchAnalyticsNews } from "@/data/providers/insights/analytics-news";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { Suspense } from "react";

import { AnalyticsDesk } from "@/components/home/findings-section";
import { HomeStandingsPanel } from "@/components/home/home-standings-panel";
import { TopPerformersPanel } from "@/components/home/top-performers-panel";

export const metadata = {
  title: "Home",
  description: "NBA games, standings, impact leaders, and analytics coverage.",
};

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

async function HomeNews() {
  const articles = await fetchAnalyticsNews({ limit: 6 }).catch(() => []);
  return <AnalyticsDesk articles={articles} embedded />;
}

async function HomeStandings({ season }: { season: string }) {
  return <HomeStandingsPanel season={season} />;
}

async function HomeTopPerformers({ season }: { season: string }) {
  const data = await getHomeAnalyticsCached();
  return (
    <TopPerformersPanel
      season={season}
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
            <Suspense fallback={<BlockSkeleton className="h-36" />}>
              <OffseasonPulsePanel />
            </Suspense>
            <Suspense fallback={<BlockSkeleton className="h-80" />}>
              <HomeNews />
            </Suspense>
          </div>
          <div className="flex flex-col gap-4 lg:col-span-5">
            <Suspense fallback={<BlockSkeleton className="h-72" />}>
              <HomeStandings season={season} />
            </Suspense>
            <Suspense fallback={<BlockSkeleton className="h-80" />}>
              <HomeTopPerformers season={season} />
            </Suspense>
          </div>
        </div>
      </main>
  );
}
