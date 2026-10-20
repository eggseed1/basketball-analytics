import { getTranslations } from "next-intl/server";

import { MotionReveal } from "@/components/continuity/motion-reveal";
import { PageHeader } from "@/components/layout/page-header";
import { OneShotGame } from "@/components/one-shot/one-shot-game";

export async function generateMetadata() {
  const t = await getTranslations("ArcadeOneShot");
  return {
    alternates: { canonical: "/arcade/one-shot" },
    title: t("metaTitle"),
    description: t("metaDescription"),
  };
}

export default async function OneShotPage() {
  const t = await getTranslations("ArcadeOneShot");
  return (
    <main data-motion-page className="flex flex-col gap-5 py-6 sm:py-8 [&:has([data-os-play])_[data-os-page-intro]]:sr-only">
      <MotionReveal />
      <div data-os-page-intro className="site-shell">
        <PageHeader
          title={t("title")}
          subtitle={t("subtitle")}
        />
      </div>
      <OneShotGame />
    </main>
  );
}
