import { LearnIndexClient } from "@/components/learn/learn-index-client";
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
      <header className="flex flex-col gap-2">
        <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          Learn
        </p>
        <h1 className="text-[28px] font-bold tracking-tight sm:text-[32px]">
          Understand every number
        </h1>
        <p className="max-w-2xl text-[16px] text-muted-foreground">
          Short explanations on the page. Deeper methodology here. Simple
          surface → extremely deep rabbit hole - without getting lost.
        </p>
      </header>

      <LearnIndexClient concepts={concepts} />
    </main>
  );
}
