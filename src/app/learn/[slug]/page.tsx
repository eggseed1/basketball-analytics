import { getLocale, getTranslations } from "next-intl/server";
import { MotionReveal } from "@/components/continuity/motion-reveal";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { CareerBandsExplorer } from "@/components/learn/career-bands-explorer";
import { DrblShrinkage } from "@/components/learn/drbl-shrinkage";
import { LearnPageFooter } from "@/components/learn/learn-page-footer";
import { LearnTopicView } from "@/components/learn/learn-topic-view";
import { StatGuideView } from "@/components/learn/stat-guide-view";
import { AppLink } from "@/components/ui/app-link";
import { isNonEnglishLocale, loadLocalizedLearnPage } from "@/content/learn/load-localized";
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
  const resolved = resolveLearnPage(slug);
  const t = await getTranslations("LearnPages");
  if (!resolved || resolved.kind === "portal") return { title: t("metaFallback") };
  const { page } = await loadLocalizedLearnPage(await getLocale(), resolved);
  if (page.kind === "portal") return { title: t("metaFallback") };
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
  const resolved = resolveLearnPage(slug);
  if (!resolved || resolved.kind === "portal") notFound();
  const locale = await getLocale();
  const { page, localized } = await loadLocalizedLearnPage(locale, resolved);
  if (page.kind === "portal") notFound();
  const t = await getTranslations("LearnPages");
  const englishBody = !localized && isNonEnglishLocale(locale);

  const conceptId = page.kind === "guide" ? page.guide.id : page.topic.id;

  return (
    <main data-motion-page className="site-shell flex flex-col gap-4 pb-6 sm:gap-5 sm:pb-8">
      <MotionReveal />
      <div data-motion-stack className="site-prose flex w-full flex-col gap-4 lg:mx-0 lg:max-w-4xl sm:gap-5">
        <AppLink
          href="/learn"
          className="text-[14px] font-semibold text-muted-foreground underline-offset-4 hover:underline"
        >
          {t("backAllTerms")}
        </AppLink>

        {englishBody ? (
          <p className="text-[13px] text-muted-foreground">{t("bodyEnglishNote")}</p>
        ) : null}

        {page.kind === "guide" ? (
          <StatGuideView
            guide={page.guide}
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
