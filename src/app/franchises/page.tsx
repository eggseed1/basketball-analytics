import { TransitionLink } from "@/components/continuity/query-nav";

import { FranchiseHistoryTable } from "@/components/franchises/franchise-history-table";
import {
  franchiseHistoryAsOf,
  listFranchiseHistories,
} from "@/data/queries/franchises";

export const metadata = {
  title: "History",
  description:
    "NBA franchise history - titles, playoff ledgers, all-time records, and fan lore.",
};

export default function FranchisesPage() {
  const franchises = listFranchiseHistories();
  const asOf = franchiseHistoryAsOf();

  return (
    <main className="site-shell flex flex-1 flex-col gap-5 py-6 sm:py-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            History
          </p>
          <h1 className="mt-1 text-[28px] font-bold tracking-tight sm:text-[32px]">
            Franchises
          </h1>
          <p className="mt-1 text-[16px] leading-relaxed text-muted-foreground">
            Titles, Finals trips, playoff ledgers, career win percentages, and
            the weird records fans argue about - through {asOf}. Click any club
            for the full scrapbook — lore, not live season intelligence.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <TransitionLink
            href="/explore/teams"
            className="rounded-md bg-foreground px-4 py-2 text-[14px] font-semibold text-background"
          >
            Live teams
          </TransitionLink>
          <TransitionLink
            href="/history"
            className="rounded-md bg-secondary px-4 py-2 text-[14px] font-semibold"
          >
            Time Machine
          </TransitionLink>
          <TransitionLink
            href="/gm"
            className="rounded-md border border-border px-4 py-2 text-[14px] font-semibold text-muted-foreground"
            title="Unfinished Franchise Lab scaffold"
          >
            GM lab
          </TransitionLink>
        </div>
      </header>

      <FranchiseHistoryTable franchises={franchises} />

      <p className="pb-6 text-[12px] text-muted-foreground">
        Continuous franchises keep relocated history (OKC includes Seattle; MEM
        includes Vancouver). Counting stats are curated snapshots - great for
        browsing, not a live box-score feed. Open a franchise for the live team
        page link.
      </p>
    </main>
  );
}
