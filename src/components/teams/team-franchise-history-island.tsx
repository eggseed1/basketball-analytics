import { FranchiseHistoryBook } from "@/components/franchises/franchise-history-book";
import { getFranchiseHistory } from "@/data/queries/franchises";

/**
 * Resolve curated franchise scrapbook for a live team page History tab.
 */
export function TeamFranchiseHistoryIsland({
  abbreviation,
  franchiseToken,
}: {
  abbreviation: string;
  /** Optional slug / registry token (e.g. okc) when abbr alone is ambiguous. */
  franchiseToken?: string | null;
}) {
  const franchise =
    (franchiseToken ? getFranchiseHistory(franchiseToken) : null) ??
    getFranchiseHistory(abbreviation);

  if (!franchise) {
    return (
      <section
        id="franchise-book"
        className="scroll-mt-16 rounded-md border border-border px-4 py-3 text-[13px] text-muted-foreground"
      >
        Franchise scrapbook is not published for this club yet.
      </section>
    );
  }

  return <FranchiseHistoryBook franchise={franchise} />;
}
