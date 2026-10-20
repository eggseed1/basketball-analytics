import { getTranslations } from "next-intl/server";

import { MotionReveal } from "@/components/continuity/motion-reveal";
import { TeammateChainGame } from "@/components/arcade/teammate-chain-game";
import { PageHeader } from "@/components/layout/page-header";

export async function generateMetadata() {
  const t = await getTranslations("ArcadeChain");
  return {
    alternates: { canonical: "/arcade/teammate-chain" },
    title: t("metaTitle"),
    description: t("metaDescription"),
  };
}

export default async function TeammateChainPage() {
  const t = await getTranslations("ArcadeChain");
  return (
    <main data-motion-page className="site-shell flex flex-col gap-6 py-6 sm:py-8">
      <MotionReveal />
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
      />
      <TeammateChainGame />
    </main>
  );
}
