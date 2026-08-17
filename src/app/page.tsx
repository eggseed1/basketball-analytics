import Link from "next/link";
import { Suspense } from "react";

import { HomeGameList } from "@/components/home/home-game-list";
import { AutoRefresh } from "@/components/system/auto-refresh";
import { getHomeFeed } from "@/data/queries/home";

export const revalidate = 60;

export const metadata = {
  title: "Home",
  description:
    "Recent NBA results and upcoming matchups with player previews.",
};

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-4 border-b border-border pb-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl font-semibold tracking-tight">
            Basketball Analytics
          </h1>
          <p className="max-w-2xl text-muted-foreground">
            Live NBA stats, player profiles, and Contour-style multi-board
            analysis — with recent results and the next games on the slate.
          </p>
          <AutoRefresh />
        </div>
        <p className="flex flex-wrap gap-3">
          <Link
            href="/dashboard"
            className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Open dashboard
          </Link>
        <Link
          href="/explore/teams"
          className="inline-flex h-10 items-center rounded-lg border border-border bg-background px-4 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Explore teams
        </Link>
        <Link
          href="/explore/players"
          className="inline-flex h-10 items-center rounded-lg border border-border bg-background px-4 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Explore players
        </Link>
          <Link
            href="/explore/games"
            className="inline-flex h-10 items-center rounded-lg border border-border bg-background px-4 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Explore games
          </Link>
        </p>
      </header>

      <Suspense fallback={<HomeFeedSkeleton />}>
        <HomeFeedSections />
      </Suspense>
    </main>
  );
}

async function HomeFeedSections() {
  const { recent, upcoming } = await getHomeFeed();

  return (
    <div className="grid gap-10 lg:grid-cols-2">
      <HomeGameList
        mode="recent"
        title="Recent games"
        subtitle="Final scores with each starting five"
        games={recent}
        emptyLabel="No recent games found for the current slate."
      />
      <HomeGameList
        mode="upcoming"
        title="Upcoming games"
        subtitle="Next matchups with projected starting fives"
        games={upcoming}
        emptyLabel="No upcoming games on the schedule yet."
      />
    </div>
  );
}

function HomeFeedSkeleton() {
  return (
    <div className="grid gap-10 lg:grid-cols-2" aria-busy="true">
      {[0, 1].map((col) => (
        <div key={col} className="flex flex-col gap-3">
          <div className="h-7 w-40 animate-pulse rounded bg-muted/50" />
          <div className="h-4 w-56 animate-pulse rounded bg-muted/40" />
          <div className="h-64 animate-pulse rounded-lg border border-border bg-muted/30" />
        </div>
      ))}
    </div>
  );
}
