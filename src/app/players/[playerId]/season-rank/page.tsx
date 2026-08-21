import Link from "next/link";
import { Suspense } from "react";

import {
  PlayerSeasonRankView,
  SeasonRankPicker,
} from "@/components/players/player-season-rank-view";
import {
  getPlayerSeasonRanking,
  parseSeasonListParam,
} from "@/data/queries/player-season-rank";
import { defaultRankSeasons } from "@/analytics/rank-player-seasons";
import { getPlayerCareerSeasons } from "@/data/queries";
import { dedupeCareerSeasons } from "@/analytics/career-resume";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";

export const metadata = {
  title: "Rank my seasons",
  description:
    "Rank multiple seasons of the same player using pairwise season comparisons.",
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

export default async function PlayerSeasonRankPage({
  params,
  searchParams,
}: PageProps) {
  const { playerId } = await params;
  const sp = await searchParams;
  const seasonsParam = one(sp, "seasons");
  const parsed = parseSeasonListParam(seasonsParam);

  const career = dedupeCareerSeasons(
    await getPlayerCareerSeasons(playerId).catch(() => [])
  );
  const careerSeasons = career.map((r) => r.season);
  const nowSeason = canonicalSeasonFromStartYear(currentNbaStartYear());

  let selected: string[] = [];
  let parseError: string | null = null;
  if (Array.isArray(parsed)) {
    selected =
      parsed.length > 0
        ? parsed
        : defaultRankSeasons(career, { nowSeason });
  } else {
    parseError = parsed.error;
    selected = defaultRankSeasons(career, { nowSeason });
  }

  const loaded = !parseError
    ? await getPlayerSeasonRanking({ playerId, seasons: selected })
    : null;

  return (
    <main className="site-shell flex flex-col gap-5 py-5 sm:py-7">
      <p>
        <Link
          href={`/players/${playerId}`}
          className="text-[14px] font-semibold text-muted-foreground"
        >
          ← Player
        </Link>
      </p>

      <Suspense
        fallback={<div className="h-24 animate-pulse rounded-xl bg-secondary" />}
      >
        <SeasonRankPicker
          playerId={playerId}
          careerSeasons={careerSeasons}
          selected={loaded?.ranking?.seasons ?? selected}
        />
      </Suspense>

      {parseError ? (
        <p className="rounded-md border border-dashed border-border px-4 py-10 text-center text-[14px] text-muted-foreground">
          {parseError}
        </p>
      ) : loaded?.error ? (
        <p className="rounded-md border border-dashed border-border px-4 py-10 text-center text-[14px] text-muted-foreground">
          {loaded.error}
        </p>
      ) : loaded?.ranking ? (
        <PlayerSeasonRankView result={loaded.ranking} />
      ) : (
        <p className="rounded-md border border-dashed border-border px-4 py-10 text-center text-[14px] text-muted-foreground">
          Could not rank these seasons.
        </p>
      )}
    </main>
  );
}
