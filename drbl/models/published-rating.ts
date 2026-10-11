/**
 * Publishes the box blend (box-forward.ts) as DRBL/100.
 *
 * The play-by-play-only rate (EB1600) moves to `drblPbp100`, an internal
 * field the blend uses as an input; `drbl100` becomes the calibrated blend.
 * Rank, forecast WAR, R1 Points and WAR1 follow the new `drbl100`: R1 Points
 * = DRBL/100 × possessions / 100, WAR1 = R1 Points / P1, so WAR1 always has
 * the sign of DRBL/100. The play-by-play ledger's credit stays internal as
 * `r1PointsPbp` and `r1WinEquivalentsPbp`. DRBL-P/O/D/LN/B are unchanged.
 */
import type { PublishedAbilityInputKind } from "./ability-lineage";
import { R1_POINTS_PER_WIN } from "./r1-value-v1";

export const BOX_BLEND_ABILITY_INPUT: PublishedAbilityInputKind = "box_blend_v2";
export const BOX_BLEND_MODEL_VERSION = "drbl-box-blend-v2";
export const BLEND_R1_POINTS_VERSION = "drbl-r1-points-blend-v2";
export const BLEND_R1_WINEQ_VERSION = "drbl-r1-wineq-blend-v2";

/** Share of rows allowed to lack a blend value before publishing refuses. */
const MAX_MISSING_SHARE = 0.01;

interface PublishableRow {
  playerId: string;
  drbl100: number;
  actualPossessions: number;
  forecastPossessions: number;
  r1PointValueVersion?: string | null;
  replacementLevelRate: number;
  pointsPerWin: number;
  rank?: number;
  drblPbp100?: number;
  drblBox100?: number;
  r1Points?: number | null;
  r1WinEquivalents?: number | null;
  r1PointsPbp?: number | null;
  r1WinEquivalentsPbp?: number | null;
}

export type PublishedRow<T> = Omit<T, "drblBox100" | "r1PointValueVersion" | "r1WinEquivalentVersion"> & {
  drblPbp100: number;
  r1Points: number;
  r1WinEquivalents: number;
  r1PointsPbp: number | null;
  r1WinEquivalentsPbp: number | null;
  r1PointValueVersion: typeof BLEND_R1_POINTS_VERSION;
  r1WinEquivalentVersion: typeof BLEND_R1_WINEQ_VERSION;
  forecastImpact: number;
  forecastWar: number;
  publishedAbilityInput: PublishedAbilityInputKind;
  abilityModelVersion: string;
};

/**
 * Swaps the blend into `drbl100` and re-ranks. Rows without a finite blend
 * value are dropped (and logged) rather than shown as 0; more than 1% missing
 * throws, since that means the blend failed rather than a few odd rows.
 * Rows that already carry `drblPbp100` keep it, so re-publishing is safe.
 */
export function publishBoxBlend<T extends PublishableRow>(
  rows: readonly T[],
  ratings: ReadonlyMap<string, number>,
  log: (message: string) => void = console.warn
): PublishedRow<T>[] {
  const missing = rows.filter((r) => !Number.isFinite(ratings.get(r.playerId) ?? Number.NaN));
  if (rows.length > 0 && missing.length > rows.length * MAX_MISSING_SHARE) {
    throw new Error(`box blend missing for ${missing.length} of ${rows.length} players; refusing to publish DRBL/100`);
  }
  if (missing.length > 0) {
    log(`[drbl] no box blend for ${missing.map((r) => r.playerId).join(", ")}; left off the board`);
  }
  const published = rows
    .filter((r) => Number.isFinite(ratings.get(r.playerId) ?? Number.NaN))
    .map((r) => {
      const { drblBox100: _shadow, ...rest } = r;
      void _shadow;
      const v = ratings.get(r.playerId)!;
      const forecastImpact = ((v - r.replacementLevelRate) * r.forecastPossessions) / 100;
      const r1Points = (v * Math.max(0, r.actualPossessions)) / 100;
      const republished = r.r1PointValueVersion === BLEND_R1_POINTS_VERSION;
      return {
        ...rest,
        drblPbp100: r.drblPbp100 ?? r.drbl100,
        r1PointsPbp: republished ? (r.r1PointsPbp ?? null) : (r.r1PointsPbp ?? r.r1Points ?? null),
        r1WinEquivalentsPbp: republished
          ? (r.r1WinEquivalentsPbp ?? null)
          : (r.r1WinEquivalentsPbp ?? r.r1WinEquivalents ?? null),
        r1Points,
        r1WinEquivalents: r1Points / R1_POINTS_PER_WIN,
        r1PointValueVersion: BLEND_R1_POINTS_VERSION,
        r1WinEquivalentVersion: BLEND_R1_WINEQ_VERSION,
        drbl100: v,
        forecastImpact: Number(forecastImpact.toFixed(2)),
        forecastWar: Number((forecastImpact / r.pointsPerWin).toFixed(4)),
        publishedAbilityInput: BOX_BLEND_ABILITY_INPUT,
        abilityModelVersion: BOX_BLEND_MODEL_VERSION,
      };
    });
  published.sort(
    (a, b) =>
      b.drbl100 - a.drbl100 ||
      b.actualPossessions - a.actualPossessions ||
      a.playerId.localeCompare(b.playerId)
  );
  return published.map((r, i) => ({ ...r, rank: i + 1, drbl100: Number(r.drbl100.toFixed(2)) })) as unknown as PublishedRow<T>[];
}
