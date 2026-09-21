import { notFound } from "next/navigation";

import { AwardHistoryBoard } from "@/components/awards/award-history-board";
import { AwardSiblingNav } from "@/components/awards/award-sibling-nav";
import { AwardTrophyIcon } from "@/components/awards/award-trophy-icon";
import { AwardDynastyBarsLazy } from "@/components/charts/recharts-lazy";
import { TransitionLink } from "@/components/continuity/query-nav";
import {
  AWARD_DEFINITIONS,
  getAwardBySlug,
} from "@/content/awards/catalog";
import {
  awardDynastyUnitLabel,
  buildAwardDynastyBars,
} from "@/content/awards/dynasty";
import { getAwardHistory } from "@/content/awards/history";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

export function generateStaticParams() {
  return AWARD_DEFINITIONS.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const award = getAwardBySlug(slug);
  if (!award) return { title: "Award" };
  return {
    title: award.title,
    description: award.blurb,
  };
}

export default async function AwardHistoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const award = getAwardBySlug(slug);
  if (!award) notFound();

  const rows = getAwardHistory(slug);
  const hasYearList = rows.length > 0;
  const dynastyBars = buildAwardDynastyBars(rows);
  const dynastyUnit = awardDynastyUnitLabel(slug);
  const seasonColumnLabel =
    award.slug === "all-star"
      ? "Selections"
      : award.slug === "hall-of-fame"
        ? "Year"
        : "Season";
  const winnerColumnLabel =
    award.slug === "all-nba" || award.slug === "all-defense"
      ? "Selection"
      : "Winner";

  return (
    <main className="site-shell flex flex-col gap-6 py-6 sm:py-8">
      <TransitionLink
        href="/awards"
        className={cn(
          type.bodySm,
          "font-semibold text-muted-foreground underline-offset-4 hover:underline"
        )}
      >
        ← All awards
      </TransitionLink>

      <header className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
        <AwardTrophyIcon
          trophy={award.trophy}
          title={award.trophyName}
          className="size-14"
        />
        <div className="min-w-0">
          <p
            className={cn(
              type.caption,
              "font-bold uppercase tracking-[0.12em] text-muted-foreground"
            )}
          >
            {award.trophyName}
          </p>
          <h1 className={type.title1}>{award.title}</h1>
          <p className={cn(type.body, "mt-1 max-w-2xl text-muted-foreground")}>
            {award.blurb}
            {award.slug === "hall-of-fame"
              ? " Player-category inductees by induction year. Linked when we have a site player id."
              : ""}
          </p>
        </div>
      </header>

      {hasYearList && dynastyBars.length >= 3 && dynastyBars[0]!.count >= 2 ? (
        <AwardDynastyBarsLazy
          title={`${award.shortLabel} dynasty`}
          unitLabel={dynastyUnit}
          bars={dynastyBars}
        />
      ) : null}

      {hasYearList ? (
        <AwardHistoryBoard
          slug={award.slug}
          seasonColumnLabel={seasonColumnLabel}
          winnerColumnLabel={winnerColumnLabel}
          rows={rows}
          seasonUsesNote={award.slug === "championships"}
        />
      ) : (
        <p className={cn(type.body, "text-muted-foreground")}>
          History for {award.shortLabel} is not baked yet. Player pages still
          show personal counts from official NBA Stats awards.
        </p>
      )}

      <AwardSiblingNav currentSlug={award.slug} />
    </main>
  );
}
