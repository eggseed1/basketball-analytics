import Link from "next/link";

import {
  getSeasonEntry,
  type SeasonRegistryEntry,
} from "@/data/drbl/season-registry";

export function DrblSeasonSupportNotice({ season }: { season: string }) {
  const entry: SeasonRegistryEntry | undefined = getSeasonEntry(season);

  if (!entry || !entry.drblAvailable) {
    return (
      <div
        role="status"
        className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
      >
        <p>
          <span className="font-medium text-foreground">
            DRBL unavailable for this season.
          </span>{" "}
          Canonical DRBL/100 and Wins Above R1 require play-by-play seasons that
          pass frozen-v1 support gates. Box-score stats may still load.
        </p>
        <p className="mt-1">
          <Link
            href="/learn/drbl"
            className="underline-offset-4 hover:underline"
          >
            Methodology
          </Link>
        </p>
      </div>
    );
  }

  // Current production seasons: do not frame as "partially supported DRBL"
  // merely because raw lineup completeness is below a historical Tier-A gate.
  if (entry.modelProductStatus === "CANONICAL_PRODUCTION") {
    return null;
  }

  const tierB =
    entry.historicalSourceQualityTier ===
      "B_CANONICAL_WITH_DOCUMENTED_SOURCE_LIMITATION" ||
    entry.supportTier === "B_CANONICAL_WITH_LIMITATIONS" ||
    entry.supportTier === "B_CANONICAL_WITH_DOCUMENTED_SOURCE_LIMITATION";

  if (tierB && entry.modelProductStatus === "RETROSPECTIVE_FROZEN_V1") {
    return (
      <div
        role="status"
        className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
      >
        <p>
          <span className="font-medium text-foreground">
            Historical data quality: Limited
          </span>
          {entry.dataQualityNote ? ` — ${entry.dataQualityNote}` : ""}
        </p>
        <p className="mt-1">
          Frozen v1 applied retrospectively.{" "}
          <Link
            href="/learn/drbl"
            className="underline-offset-4 hover:underline"
          >
            Methodology
          </Link>
        </p>
      </div>
    );
  }

  return null;
}
