import { getTranslations } from "next-intl/server";

import { MotionReveal } from "@/components/continuity/motion-reveal";
import { Zero82Game } from "@/components/arcade/zero-82-game";
import { PageHeader } from "@/components/layout/page-header";

export async function generateMetadata() {
  const t = await getTranslations("ArcadeZero");
  return {
    alternates: { canonical: "/arcade/zero-82" },
    title: t("metaTitle"),
    description: t("metaDescription"),
  };
}

export default async function Zero82Page() {
  const t = await getTranslations("ArcadeZero");
  return (
    <main data-motion-page className="site-shell flex flex-col gap-6 py-6 sm:py-8">
      <MotionReveal />
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
      />
      <Zero82Game />
    </main>
  );
}
