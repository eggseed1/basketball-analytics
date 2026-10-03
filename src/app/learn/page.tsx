import { LearnIndexClient } from "@/components/learn/learn-index-client";
import { PageHeader } from "@/components/layout/page-header";
import { learnHrefFor, listLearnConcepts } from "@/content/learn/registry";

export const metadata = {
  title: "Learn",
  description:
    "DRBL glossary: the stats, labels, and methods a casual fan needs to read the site.",
};

export default function LearnIndexPage() {
  const concepts = listLearnConcepts()
    .filter((c) => c.learnSlug || c.showTooltip)
    .map((c) => ({ ...c, href: learnHrefFor(c.id) }));

  return (
    <main className="site-shell flex flex-col gap-6 py-6 sm:py-8">
      <PageHeader
        eyebrow="Learn"
        title="Understand every number"
        subtitle="Every stat, label, and method the site uses, grouped by topic. Other pages give the short explanation; the full one is here."
      />

      <LearnIndexClient concepts={concepts} />
    </main>
  );
}
