import { AwardTrophyIcon } from "@/components/awards/award-trophy-icon";
import { TransitionLink } from "@/components/continuity/query-nav";
import { PageHeader } from "@/components/layout/page-header";
import { AWARD_DEFINITIONS } from "@/content/awards/catalog";
import { summarizeAwardCard } from "@/content/awards/summaries";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Awards",
  description:
    "NBA award history — championships, MVP, Finals MVP, DPOY, and more.",
};

const GROUPS: Array<{
  title: string;
  blurb: string;
  slugs: string[];
}> = [
  {
    title: "Team hardware",
    blurb: "The championship trophy.",
    slugs: ["championships"],
  },
  {
    title: "Individual awards",
    blurb: "Season and Finals MVPs, defense, and rookies.",
    slugs: ["mvp", "finals-mvp", "dpoy", "roy"],
  },
  {
    title: "All-league & All-Star",
    blurb: "Team selections and midseason showcase.",
    slugs: ["all-nba", "all-defense", "all-star"],
  },
  {
    title: "Legacy",
    blurb: "Naismith Memorial Hall of Fame.",
    slugs: ["hall-of-fame"],
  },
];

export default function AwardsIndexPage() {
  const bySlug = new Map(AWARD_DEFINITIONS.map((a) => [a.slug, a]));

  return (
    <main className="site-shell flex flex-col gap-8 py-6 sm:py-8">
      <PageHeader
        eyebrow="Awards"
        title="Trophy case"
        subtitle="League award history. Player pages show each star’s hardware — open a trophy for winners, dynasties, and eras."
      />

      {GROUPS.map((group) => (
        <section key={group.title} className="flex flex-col gap-3">
          <div>
            <h2 className={cn(type.heading)}>{group.title}</h2>
            <p className={cn(type.caption, "mt-0.5 text-muted-foreground")}>
              {group.blurb}
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
                          ? ` · latest ${summary.latestSeason}`
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
