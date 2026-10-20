import { getTranslations } from "next-intl/server";

import { MotionReveal } from "@/components/continuity/motion-reveal";
import { LearnIndexClient } from "@/components/learn/learn-index-client";
import { PageHeader } from "@/components/layout/page-header";
import { learnHrefFor, listLearnConcepts } from "@/content/learn/registry";

export async function generateMetadata() {
  const t = await getTranslations("Learn");
  return {
    alternates: { canonical: "/learn" },
    title: t("metaTitle"),
    description: t("metaDescription"),
  };
}

export default async function LearnIndexPage() {
  const t = await getTranslations("Learn");
  const concepts = listLearnConcepts()
    .filter((c) => c.learnSlug || c.showTooltip)
    .map((c) => ({ ...c, href: learnHrefFor(c.id) }));

  return (
    <main data-motion-page className="site-shell flex flex-col gap-6 py-6 sm:py-8">
      <MotionReveal />
      <PageHeader title={t("hubTitle")} subtitle={t("hubSubtitle")} />

      <LearnIndexClient concepts={concepts} />
    </main>
  );
}
