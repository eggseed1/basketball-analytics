import { getTranslations } from "next-intl/server";

import { MotionReveal } from "@/components/continuity/motion-reveal";
import { FranchiseHistoryTable } from "@/components/franchises/franchise-history-table";
import { PageHeader } from "@/components/layout/page-header";
import { listFranchiseHistories } from "@/data/queries/franchises";

export const metadata = {
  alternates: { canonical: "/franchises" },
  title: "NBA franchise history",
  description:
    "NBA franchise history: titles, playoff ledgers, all-time records, and fan lore.",
};

export default async function FranchisesPage() {
  const t = await getTranslations("Franchises");
  const franchises = listFranchiseHistories();

  return (
    <main data-motion-page className="site-shell flex flex-1 flex-col gap-5 py-6 sm:py-8">
      <MotionReveal />
      <PageHeader title={t("title")} />

      <FranchiseHistoryTable franchises={franchises} />

      <p className="pb-6 text-[12px] text-muted-foreground">
        {t("footnote")}
      </p>
    </main>
  );
}
