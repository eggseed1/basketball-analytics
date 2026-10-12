import { MotionReveal } from "@/components/continuity/motion-reveal";
import { InsightCard } from "@/components/home/findings-section";
import { PageHeader } from "@/components/layout/page-header";
import archive from "@/data/runtime/findings-archive.json";
import {
  findingsDateHeading,
  groupFindingsByDate,
  type FindingsArchive,
} from "@/lib/findings-archive";

export const metadata = {
  title: "Findings",
  description: "What stood out in each night of NBA games, newest first.",
  alternates: {
    canonical: "/findings",
    types: { "application/rss+xml": [{ url: "/findings/feed.xml", title: "DRBL findings" }] },
  },
};

export default function FindingsPage() {
  const groups = groupFindingsByDate((archive as FindingsArchive).findings);
  return (
    <main data-motion-page className="site-shell flex flex-col gap-6 py-6 sm:py-8">
      <MotionReveal />
      <PageHeader
        eyebrow="Findings"
        title="Past nights"
        subtitle="The Recent Insights cards from each night of games, kept after they leave the home page."
        about="The nightly run saves the cards the home page showed for the latest completed games. Preseason nights carry a label next to the date."
        actions={
          <a
            href="/findings/feed.xml"
            className="text-[13px] font-semibold underline-offset-4 hover:underline"
          >
            RSS feed
          </a>
        }
      />
      {groups.length ? (
        groups.map((group) => {
          const first = group.findings[0]!;
          return (
            <section key={group.date} className="flex flex-col gap-3">
              <h2 className="type-heading flex flex-wrap items-baseline gap-x-2">
                {findingsDateHeading(group.date)}
                {first.preseason ? (
                  <span className="whitespace-nowrap type-body-sm font-normal text-muted-foreground">
                    {first.season} preseason
                  </span>
                ) : null}
              </h2>
              <div data-motion-list className="grid min-w-0 gap-3 sm:grid-cols-2">
                {group.findings.map((finding) => (
                  <InsightCard key={finding.id} insight={finding} asOf={null} />
                ))}
              </div>
            </section>
          );
        })
      ) : (
        <p className="type-body-sm text-muted-foreground">
          No findings saved yet. Cards appear here after the first night of games.
        </p>
      )}
    </main>
  );
}
