import { Suspense } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import {
  PlayerSeasonCompareView,
  SeasonComparePicker,
} from "@/components/players/player-season-compare-view";
import { getPlayerSeasonComparison } from "@/data/queries/player-season-compare";
import { getPlayerCareerSeasonsCached } from "@/data/queries/request-cache";
import { dedupeCareerSeasons } from "@/analytics/career-resume";
import { MotionReveal } from "@/components/continuity/motion-reveal";

export async function generateMetadata() {
  const t = await getTranslations("PlayerDetail");
  return {
    title: t("seasonCompareMetaTitle"),
    description: t("seasonCompareMetaDescription"),
  };
}

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
  const t = await getTranslations("PlayerDetail");
  const { playerId } = await params;
  const sp = await searchParams;
  const seasonA = one(sp, "a");
  const seasonB = one(sp, "b");

  // Selection only needs factual seasons. Optional impact enrichment belongs in
  // the comparison query and must not hold the entire route above Suspense.
  const career = dedupeCareerSeasons(
    await getPlayerCareerSeasonsCached(playerId).catch(() => [])
  );
  const seasons = career.map((r) => r.season);

  let loaded: Awaited<ReturnType<typeof getPlayerSeasonComparison>> | null = null;
  let loadError: string | null = null;
  if (seasonA && seasonB) {
    try {
      loaded = await getPlayerSeasonComparison({
        playerId,
        seasonA,
        seasonB,
      });
    } catch {
      loadError = t("seasonCompareUnavailable");
    }
  }

  return (
    <main data-motion-page className="site-shell flex flex-col gap-5 py-5 sm:py-7">
      <MotionReveal />
      <p>
        <Link
          href={`/players/${playerId}`}
          className="text-[14px] font-semibold text-muted-foreground"
        >
          {t("backToPlayer")}
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
        <p className="rounded-md border border-dashed border-border px-4 py-10 text-center text-[14px] text-muted-foreground">
          {t("seasonComparePick")}
        </p>
      ) : loadError ? (
        <p className="rounded-md border border-dashed border-border px-4 py-10 text-center text-[14px] text-muted-foreground">
          {loadError}
        </p>
      ) : loaded?.error ? (
        <p className="rounded-md border border-dashed border-border px-4 py-10 text-center text-[14px] text-muted-foreground">
          {loaded.error}
        </p>
      ) : loaded?.comparison ? (
        <PlayerSeasonCompareView result={loaded.comparison} />
      ) : (
        <p className="rounded-md border border-dashed border-border px-4 py-10 text-center text-[14px] text-muted-foreground">
          {t("seasonCompareCouldNot")}
        </p>
      )}
    </main>
  );
}
