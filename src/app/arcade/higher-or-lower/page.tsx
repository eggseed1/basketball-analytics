import { getTranslations } from "next-intl/server";

import { MotionReveal } from "@/components/continuity/motion-reveal";
import { HigherLowerGame } from "@/components/arcade/higher-lower-game";
import { PageHeader } from "@/components/layout/page-header";

export async function generateMetadata() {
  const t = await getTranslations("ArcadeHL");
  return {
    alternates: { canonical: "/arcade/higher-or-lower" },
    title: t("metaTitle"),
    description: t("metaDescription"),
  };
}

export default async function HigherOrLowerPage() {
  const t = await getTranslations("ArcadeHL");
  return (
    <main data-motion-page className="site-shell flex flex-col gap-6 py-6 sm:py-8">
      <MotionReveal />
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        about={t("about")}
      />
      <HigherLowerGame />
    </main>
  );
}
