import { notFound } from "next/navigation";
import { Suspense } from "react";

import { CareerBandsExplorer } from "@/components/learn/career-bands-explorer";
import { DrblShrinkage } from "@/components/learn/drbl-shrinkage";
import { LearnPageFooter, learnEyebrow } from "@/components/learn/learn-page-footer";
import { LearnTopicView } from "@/components/learn/learn-topic-view";
import { StatGuideView } from "@/components/learn/stat-guide-view";
import { AppLink } from "@/components/ui/app-link";
import { listAllLearnSlugs, resolveLearnPage } from "@/content/learn/resolve";

const CAREER_BAND_TOPICS = new Set(["peak_prime_longevity", "career_resume", "career_self_comparison"]);

export function generateStaticParams() {
  return listAllLearnSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = resolveLearnPage(slug);
  if (!page || page.kind === "portal") return { title: "Learn" };
  if (page.kind === "guide") {
    return { title: page.guide.shortName, description: page.guide.blurb };
  }
  return {
    title: page.topic.shortName,
    description: page.topic.oneSentence,
  };
}

export default async function LearnStatPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = resolveLearnPage(slug);
  if (!page || page.kind === "portal") notFound();

  const conceptId = page.kind === "guide" ? page.guide.id : page.topic.id;
  const eyebrow = learnEyebrow(conceptId);

  return (
    <main className="site-shell flex flex-col gap-8 py-6 sm:py-8">
      <div className="site-prose flex w-full flex-col gap-8 lg:mx-0 lg:max-w-4xl">
        <AppLink
          href="/learn"
          className="text-[14px] font-semibold text-muted-foreground underline-offset-4 hover:underline"
        >
          ← All terms
        </AppLink>

        {page.kind === "guide" ? (
          <StatGuideView
            guide={page.guide}
            eyebrow={eyebrow}
            visual={
              page.guide.slug === "drbl-100" ? (
                <Suspense key="drbl-shrinkage" fallback={<div className="h-[42rem] animate-pulse rounded-md bg-foreground/[0.05]" />}>
                  <DrblShrinkage />
                </Suspense>
              ) : undefined
            }
          />
        ) : (
          <LearnTopicView
            topic={page.topic}
            eyebrow={eyebrow}
            visual={CAREER_BAND_TOPICS.has(page.topic.id) ? <CareerBandsExplorer /> : undefined}
          />
        )}

        {page.kind === "guide" ? (
          <LearnPageFooter conceptId={conceptId} />
        ) : (
          <LearnPageFooter
            conceptId={conceptId}
            relatedIds={page.topic.relatedIds}
            seeInAction={page.topic.seeInAction}
          />
        )}
      </div>
    </main>
  );
}
