import { getTranslations } from "next-intl/server";

import { MotionReveal } from "@/components/continuity/motion-reveal";
import { DailyGame } from "@/components/arcade/daily-game";
import { PageHeader } from "@/components/layout/page-header";

export async function generateMetadata() {
  const t = await getTranslations("ArcadeDaily");
  return {
    alternates: { canonical: "/arcade/daily" },
    title: t("metaTitle"),
    description: t("metaDescription"),
  };
}

export default async function DailyPage() {
  const t = await getTranslations("ArcadeDaily");
  return (
    <main data-motion-page className="site-shell flex flex-col gap-6 py-6 sm:py-8">
      <MotionReveal />
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        about={t("about")}
      />
      <DailyGame />
    </main>
  );
}
