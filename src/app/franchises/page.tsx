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

export default function FranchisesPage() {
  const franchises = listFranchiseHistories();

  return (
    <main data-motion-page className="site-shell flex flex-1 flex-col gap-5 py-6 sm:py-8">
      <MotionReveal />
      <PageHeader title="Franchises" />

      <FranchiseHistoryTable franchises={franchises} />

      <p className="pb-6 text-[12px] text-muted-foreground">
        Relocated franchises keep their history (OKC includes Seattle; MEM includes Vancouver).
        Counting stats are curated snapshots, not a live box-score feed.
      </p>
    </main>
  );
}
