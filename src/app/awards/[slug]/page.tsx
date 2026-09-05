import { notFound } from "next/navigation";

import { AwardTrophyIcon } from "@/components/awards/award-trophy-icon";
import { TransitionLink } from "@/components/continuity/query-nav";
import {
  AWARD_DEFINITIONS,
  getAwardBySlug,
} from "@/content/awards/catalog";
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
  const seasonColumnLabel =
    award.slug === "all-star"
      ? "Selections"
      : award.slug === "hall-of-fame"
        ? "Year"
        : "Season";
  const emptyCopy = `Full season-by-season lists for ${award.shortLabel} are coming soon. Player pages still show each player’s personal count from official NBA Stats awards.`;

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
            {award.slug === "all-star"
              ? " Ranked here by career All-Star selections from the awards bake."
              : award.slug === "hall-of-fame"
                ? " Player-category inductees by induction year (Naismith Memorial). Linked when we have a site player id."
                : ""}
          </p>
        </div>
      </header>

      {hasYearList ? (
        <div className="sports-card overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr
                className={cn(
                  type.caption,
                  "border-b border-border uppercase tracking-wide text-muted-foreground"
                )}
              >
                <th className="px-4 py-2.5 font-semibold">{seasonColumnLabel}</th>
                <th className="px-4 py-2.5 font-semibold">
                  {award.slug === "all-nba" || award.slug === "all-defense"
                    ? "Selection"
                    : "Winner"}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={`${row.season}-${row.winner}-${row.href ?? ""}`}
                  className="border-b border-border/70 last:border-0"
                >
                  <td
                    className={cn(
                      type.bodySm,
                      "px-4 py-2.5 tabular-nums text-muted-foreground"
                    )}
                  >
                    {row.note && award.slug === "championships"
                      ? row.note
                      : row.season}
                  </td>
                  <td className={cn(type.bodySm, "px-4 py-2.5 font-semibold")}>
                    {row.href ? (
                      <TransitionLink
                        href={row.href}
                        className="underline-offset-2 hover:underline"
                      >
                        {row.winner}
                      </TransitionLink>
                    ) : (
                      row.winner
                    )}
                    {row.note && award.slug !== "championships" ? (
                      <span className="ml-2 font-normal text-muted-foreground">
                        ({row.note})
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={cn(type.body, "text-muted-foreground")}>{emptyCopy}</p>
      )}
    </main>
  );
}
