import { LearnIndexClient } from "@/components/learn/learn-index-client";
import { PageHeader } from "@/components/layout/page-header";
import { listLearnConcepts } from "@/content/learn/registry";

export const metadata = {
  title: "Learn",
  description:
    "DRBL glossary - stats, labels, and methodologies a casual fan needs to understand the product.",
};

export default function LearnIndexPage() {
  const concepts = listLearnConcepts().filter((c) => c.learnSlug);

  return (
    <main className="site-shell flex flex-col gap-6 py-6 sm:py-8">
      <PageHeader
        eyebrow="Learn"
        title="Understand every number"
        subtitle="Short explanations on the page. Deeper methodology here. Simple surface → extremely deep rabbit hole - without getting lost."
      />

      <LearnIndexClient concepts={concepts} />
    </main>
  );
}
