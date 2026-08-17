import { Suspense } from "react";
import Link from "next/link";

import {
  PlayerSeasonCompareView,
  SeasonComparePicker,
} from "@/components/players/player-season-compare-view";
import { getPlayerSeasonComparison } from "@/data/queries/player-season-compare";
import { getPlayerCareerSeasons } from "@/data/queries";
import { dedupeCareerSeasons } from "@/analytics/career-resume";

export const metadata = {
  title: "Season compare",
  description:
    "Compare multiple seasons of the same player — production, efficiency, and more.",
};

interface PageProps {
  params: Promise<{ playerId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function one(
  sp: Record<string, string | string[] | undefined>,
  key: string
): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

export default async function PlayerSeasonComparePage({
  params,
  searchParams,
}: PageProps) {
  const { playerId } = await params;
  const sp = await searchParams;
  const seasonA = one(sp, "a");
  const seasonB = one(sp, "b");

  const career = dedupeCareerSeasons(
    await getPlayerCareerSeasons(playerId).catch(() => [])
  );
  const seasons = career.map((r) => r.season);

  const loaded =
    seasonA && seasonB
      ? await getPlayerSeasonComparison({
          playerId,
          seasonA,
          seasonB,
        })
      : null;

  return (
    <main className="site-shell flex flex-col gap-5 py-5 sm:py-7">
      <p>
        <Link
          href={`/players/${playerId}`}
          className="text-[13px] font-semibold text-muted-foreground"
        >
          ← Player
        </Link>
      </p>

      <Suspense
        fallback={<div className="h-20 animate-pulse rounded-xl bg-secondary" />}
      >
        <SeasonComparePicker
          playerId={playerId}
          seasons={seasons}
          seasonA={loaded?.comparison?.seasonA ?? seasonA}
          seasonB={loaded?.comparison?.seasonB ?? seasonB}
        />
      </Suspense>

      {!seasonA || !seasonB ? (
        <p className="rounded-md border border-dashed border-border px-4 py-10 text-center text-[13px] text-muted-foreground">
          Pick two seasons to compare versions of this player.
        </p>
      ) : loaded?.error ? (
        <p className="rounded-md border border-dashed border-border px-4 py-10 text-center text-[13px] text-muted-foreground">
          {loaded.error}
        </p>
      ) : loaded?.comparison ? (
        <PlayerSeasonCompareView result={loaded.comparison} />
      ) : (
        <p className="rounded-md border border-dashed border-border px-4 py-10 text-center text-[13px] text-muted-foreground">
          Could not build this season comparison.
        </p>
      )}
    </main>
  );
}
