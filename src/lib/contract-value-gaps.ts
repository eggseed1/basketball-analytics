/**
 * Shared copy for missing contract-worth rows.
 * Worth is projected from published DRBL through model.lastSeason only —
 * current-year box scores do not fill that window until the season is baked.
 */
import type {
  ContractValueGap,
  ContractValueModel,
} from "@/data/runtime/contract-value";

export function contractValueWindowLabel(
  model: Pick<ContractValueModel, "lastSeason">
): string {
  const end = Number(model.lastSeason.slice(0, 4));
  const start = end - 2;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")} to ${model.lastSeason}`;
}

/** Player-page / salary-tab note. Blank means missing, not zero. */
export function contractValueGapNote(
  reason: ContractValueGap,
  model: Pick<ContractValueModel, "lastSeason">
): string {
  const window = contractValueWindowLabel(model);
  switch (reason) {
    case "no-drbl":
      return `Contract worth stays blank, not 0. It is projected from published DRBL seasons (${window}). Current-season box scores are not in that set until the season is baked.`;
    case "thin":
      return `Contract worth stays blank, not 0. Fewer than 500 published DRBL possessions in ${window}.`;
    case "waived":
      return `Contract worth stays blank, not 0. This player was waived, so the team pays salary without them on the floor.`;
  }
}

/** Short label for team-page missing lists. */
export function contractValueGapShortLabel(reason: ContractValueGap): string {
  switch (reason) {
    case "no-drbl":
      return "no published DRBL in the projection window";
    case "thin":
      return "too few published DRBL possessions";
    case "waived":
      return "waived";
  }
}

/** Surplus board footer when contracts are omitted from the ranking. */
export function contractValueLeftOutBlurb(opts: {
  leftOut: number;
  lastSeason: string;
}): string {
  if (opts.leftOut <= 0) return "";
  const noun = opts.leftOut === 1 ? "contract" : "contracts";
  return (
    `${opts.leftOut} ${noun} are left out of the totals, blank not 0: worth needs ` +
    `published DRBL through ${opts.lastSeason}, so many rookies and short samples ` +
    `stay off the board until that season is baked. Waived deals are left out too.`
  );
}
