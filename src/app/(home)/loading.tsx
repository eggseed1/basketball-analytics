import { LoadingTopBar } from "@/components/continuity/destination-loading-frame";
import { HomeLayoutSkeleton } from "@/components/home/home-module-skeleton";
import { HomeWarmup } from "@/components/home/home-warmup";
import { guessHomeSeasonPhase, homeLayoutForPhase } from "@/lib/home-season-moment";
import { nbaTodayIso } from "@/lib/nba-calendar-date";

/** Same placeholders and grid the page streams in with, so nothing moves when it lands. */
export default function Loading() {
  const phase = guessHomeSeasonPhase(nbaTodayIso());
  return (
    <main className="site-shell relative flex flex-col gap-5 py-5 sm:py-7" aria-busy="true" aria-live="polite">
      <LoadingTopBar />
      <HomeLayoutSkeleton layout={homeLayoutForPhase(phase)} phase={phase} />
      <HomeWarmup />
      <p className="sr-only">Loading the home page…</p>
    </main>
  );
}
