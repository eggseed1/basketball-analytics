import { getTranslations } from "next-intl/server";
import { MotionReveal } from "@/components/continuity/motion-reveal";
import { AwardTrophyIcon } from "@/components/awards/award-trophy-icon";
import { TransitionLink } from "@/components/continuity/query-nav";
import { PageHeader } from "@/components/layout/page-header";
import { AWARD_DEFINITIONS } from "@/content/awards/catalog";
import { summarizeAwardCard } from "@/content/awards/summaries";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

export const metadata = {
  alternates: { canonical: "/awards" },
  title: "NBA awards history",
  description:
    "NBA award history: championships, MVP, Finals MVP, DPOY, and more.",
};

const GROUP_DEFS: Array<{
  titleKey: "groupTeam" | "groupIndividual" | "groupAllLeague" | "groupLegacy";
  blurbKey:
    | "groupTeamBlurb"
    | "groupIndividualBlurb"
    | "groupAllLeagueBlurb"
    | "groupLegacyBlurb";
  slugs: string[];
}> = [
  { titleKey: "groupTeam", blurbKey: "groupTeamBlurb", slugs: ["championships"] },
  {
    titleKey: "groupIndividual",
    blurbKey: "groupIndividualBlurb",
    slugs: ["mvp", "finals-mvp", "dpoy", "roy"],
  },
  {
    titleKey: "groupAllLeague",
    blurbKey: "groupAllLeagueBlurb",
    slugs: ["all-nba", "all-defense", "all-star"],
  },
  { titleKey: "groupLegacy", blurbKey: "groupLegacyBlurb", slugs: ["hall-of-fame"] },
];

export default async function AwardsIndexPage() {
  const t = await getTranslations("Awards");
  const bySlug = new Map(AWARD_DEFINITIONS.map((a) => [a.slug, a]));

  return (
    <main data-motion-page className="site-shell flex flex-col gap-8 py-6 sm:py-8">
      <MotionReveal />
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
      />

      {GROUP_DEFS.map((group) => (
        <section key={group.titleKey} className="flex flex-col gap-3">
          <div>
            <h2 className={cn(type.heading)}>{t(group.titleKey)}</h2>
            <p className={cn(type.caption, "mt-0.5 text-muted-foreground")}>
              {t(group.blurbKey)}
            </p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.slugs.map((slug) => {
              const award = bySlug.get(slug);
              if (!award) return null;
              const summary = summarizeAwardCard(award);
              return (
                <li key={award.id}>
                  <TransitionLink
                    href={`/awards/${award.slug}`}
                    className={cn(
                      "sports-card flex h-full flex-col gap-3 px-4 py-3.5",
                      "hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    )}
                  >
                    <span className="flex items-start gap-3">
                      <AwardTrophyIcon
                        trophy={award.trophy}
                        title={award.trophyName}
                        className="size-10 shrink-0"
                      />
                      <span className="min-w-0">
                        <span className={cn(type.body, "block font-semibold")}>
                          {award.title}
                        </span>
                        <span
                          className={cn(
                            type.caption,
                            "mt-0.5 block text-muted-foreground"
                          )}
                        >
                          {award.trophyName}
                        </span>
                      </span>
                    </span>
                    <span
                      className={cn(
                        type.caption,
                        "line-clamp-2 text-muted-foreground"
                      )}
                    >
                      {award.blurb}
                    </span>
                    <span className="mt-auto flex flex-col gap-0.5 border-t border-border/70 pt-2.5">
                      <span
                        className={cn(
                          type.micro,
                          "font-bold uppercase tracking-[0.1em] text-muted-foreground"
                        )}
                      >
                        {summary.countLabel}
                        {summary.latestSeason
                          ? ` · ${t("latestSeason", { season: summary.latestSeason })}`
                          : ""}
                      </span>
                      <span
                        className={cn(
                          type.bodySm,
                          "truncate font-semibold text-foreground"
                        )}
                      >
                        {summary.latestLabel}
                      </span>
                    </span>
                  </TransitionLink>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </main>
  );
}
