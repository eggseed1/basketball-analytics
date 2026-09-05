import { AwardTrophyIcon } from "@/components/awards/award-trophy-icon";
import { TransitionLink } from "@/components/continuity/query-nav";
import { PageHeader } from "@/components/layout/page-header";
import { AWARD_DEFINITIONS } from "@/content/awards/catalog";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Awards",
  description:
    "NBA award history — championships, MVP, Finals MVP, DPOY, and more.",
};

export default function AwardsIndexPage() {
  return (
    <main className="site-shell flex flex-col gap-6 py-6 sm:py-8">
      <PageHeader
        eyebrow="Awards"
        title="Trophy case"
        subtitle="League award history. Player pages show each star’s hardware — tap a trophy to open the full list of winners."
      />

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {AWARD_DEFINITIONS.map((award) => (
          <li key={award.id}>
            <TransitionLink
              href={`/awards/${award.slug}`}
              className={cn(
                "sports-card flex items-center gap-3 px-4 py-3",
                "hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              )}
            >
              <AwardTrophyIcon
                trophy={award.trophy}
                title={award.trophyName}
                className="size-10"
              />
              <span className="min-w-0">
                <span className={cn(type.body, "block font-semibold")}>
                  {award.title}
                </span>
                <span
                  className={cn(type.caption, "block text-muted-foreground")}
                >
                  {award.trophyName}
                </span>
              </span>
            </TransitionLink>
          </li>
        ))}
      </ul>
    </main>
  );
}
