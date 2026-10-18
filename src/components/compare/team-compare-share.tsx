"use client";

import { useCallback, useState } from "react";
import { Share2 } from "lucide-react";

import type { TeamSeasonComparison } from "@/analytics/compare-team-seasons";
import { teamCompareEdgeLabel } from "@/analytics/compare-team-seasons";
import { TeamLogo } from "@/components/brand/team-logo";
import { SHARE_PALETTE, ShareCardFrame, type ShareAppearance } from "@/components/share/share-card";
import { ShareSnapshotDialog } from "@/components/share/share-snapshot-dialog";
import { type } from "@/lib/design-system";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { cn } from "@/lib/utils";

function shareText(result: TeamSeasonComparison): string {
  const title =
    result.mode === "same_team"
      ? `${result.sideA.fullName}: ${result.sideA.season} vs ${result.sideB.season}`
      : `${result.sideA.fullName} ${result.sideA.season} vs ${result.sideB.fullName} ${result.sideB.season}`;
  return `${title}. ${result.overall.reason}`;
}

function fileName(result: TeamSeasonComparison): string {
  const a = `${result.sideA.abbreviation}-${result.sideA.season}`;
  const b = `${result.sideB.abbreviation}-${result.sideB.season}`;
  return `${a}-vs-${b}.png`.toLowerCase();
}

function TeamCompareShareGraphic({
  result,
  appearance,
}: {
  result: TeamSeasonComparison;
  appearance: ShareAppearance;
}) {
  const palette = SHARE_PALETTE[appearance];
  const labelA = `${result.sideA.abbreviation} ${result.sideA.season}`;
  const labelB = `${result.sideB.abbreviation} ${result.sideB.season}`;
  return (
    <ShareCardFrame
      appearance={appearance}
      colorA={resolveTeamBrand(result.sideA.abbreviation)?.primary}
      colorB={resolveTeamBrand(result.sideB.abbreviation)?.primary}
    >
      <div className="flex items-center gap-3">
        <TeamLogo teamKey={result.sideA.abbreviation} size="md" />
        {result.mode === "cross_team" ? (
          <TeamLogo teamKey={result.sideB.abbreviation} size="md" />
        ) : null}
        <p className="min-w-0 text-[18px] font-bold leading-snug" style={{ color: palette.fg }}>
          {result.mode === "same_team"
            ? `${result.sideA.fullName}: ${result.sideA.season} vs ${result.sideB.season}`
            : `${result.sideA.fullName} vs ${result.sideB.fullName}`}
        </p>
      </div>
      <p className="text-[13px] leading-snug" style={{ color: palette.muted }}>
        {result.overall.reason}
      </p>
      <ul className="flex flex-col gap-1">
        {result.categories.map((category) => (
          <li
            key={category.id}
            className="flex items-baseline justify-between gap-3 text-[13px]"
          >
            <span style={{ color: palette.muted }}>{category.label}</span>
            <span className="font-semibold" style={{ color: palette.fg }}>
              {teamCompareEdgeLabel(category.edge, labelA, labelB)}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-center text-[11px] font-semibold" style={{ color: palette.muted }}>
        DRBL
      </p>
    </ShareCardFrame>
  );
}

export function TeamCompareShare({ result }: { result: TeamSeasonComparison }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const title =
    result.mode === "same_team"
      ? `${result.sideA.fullName}: ${result.sideA.season} vs ${result.sideB.season}`
      : `${result.sideA.abbreviation} vs ${result.sideB.abbreviation}`;

  return (
    <div className="shrink-0" data-capture-exclude="">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "glass-pill inline-flex h-9 items-center gap-2 rounded-md px-3 font-semibold",
          type.bodySm
        )}
      >
        <Share2 className="size-3.5" aria-hidden />
        Share
      </button>
      <ShareSnapshotDialog
        open={open}
        onClose={close}
        fileName={fileName(result)}
        shareTitle={title}
        shareText={shareText(result)}
        canCapture
        graphic={(appearance) => (
          <TeamCompareShareGraphic result={result} appearance={appearance} />
        )}
      />
    </div>
  );
}
