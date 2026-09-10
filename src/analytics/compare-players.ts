import type {
  ComparisonDimension,
  PlayerComparisonResult,
} from "@/analytics/types";
import type { PlayerSeason } from "@/data/types";
import { isCareerCompareKey } from "@/lib/career-average-row";
import {
  formatSheetStatValue,
  getSheetStatValue,
  SHEET_STAT_BY_ID,
  SHEET_STAT_CATEGORY_ORDER,
  SHEET_STAT_DEFS,
  type SheetStatCategory,
  type SheetStatId,
} from "@/lib/player-stat-sheet-registry";

function percentileOf(value: number, pool: number[], invert = false): number {
  if (!pool.length || !Number.isFinite(value)) return 50;
  const below = pool.filter((v) => v < value).length;
  const raw = (below / pool.length) * 100;
  return invert ? 100 - raw : raw;
}

/** Lower is better on the sheet — flip delta / percentile. */
const INVERT_SHEET_IDS = new Set<SheetStatId>([
  "tov",
  "pf",
  "tovPct",
  "drtg",
]);

/**
 * Compare dimensions — full player-board sheet vocabulary.
 * Categories / order: Profile · Shooting · Defense · Hustle · Advanced · Impact.
 */
const COMPARE_DIMS: Array<{
  id: SheetStatId;
  label?: string;
  invert?: boolean;
}> = SHEET_STAT_DEFS.map((def) => ({
  id: def.id,
  invert: INVERT_SHEET_IDS.has(def.id),
}));

/** Default-on metrics in the compare UI (player can enable the rest). */
export const COMPARE_DEFAULT_METRIC_IDS: SheetStatId[] = [
  "pts",
  "trb",
  "ast",
  "stl",
  "blk",
  "tov",
  "fgPct",
  "fg3Pct",
  "ftPct",
  "efg",
  "ts",
  "usg",
  "tovPct",
  "astPct",
  "ortg",
  "drtg",
  "net",
  "bpm",
  "darko",
  "raptor",
  "winsAdded",
  "war1",
  "drbl100",
  "drblO",
  "drblD",
];

const CATEGORY_ORDER: SheetStatCategory[] = [...SHEET_STAT_CATEGORY_ORDER];

function relativeBar(
  a: number | null,
  b: number | null,
  invert: boolean
): { aBar?: number; bBar?: number } {
  if (a == null && b == null) return {};
  const aV = a ?? 0;
  const bV = b ?? 0;
  if (invert) {
    const max = Math.max(aV, bV, 1e-9);
    const min = Math.min(a == null ? max : aV, b == null ? max : bV);
    const span = Math.max(max - min, 1e-9);
    return {
      aBar: a == null ? undefined : Math.max(8, ((max - aV) / span) * 100),
      bBar: b == null ? undefined : Math.max(8, ((max - bV) / span) * 100),
    };
  }
  const peak = Math.max(Math.abs(aV), Math.abs(bV), 1e-9);
  return {
    aBar: a == null ? undefined : Math.max(8, (Math.abs(aV) / peak) * 100),
    bBar: b == null ? undefined : Math.max(8, (Math.abs(bV) / peak) * 100),
  };
}

/**
 * Side-by-side player comparison using season or career rows + peer percentiles.
 * When seasons differ, pass peersA / peersB so each side is ranked in its
 * own season pool (cross-era compare stays season-true).
 * Career mode skips peer percentiles and uses relative bars.
 */
export function buildPlayerComparison(options: {
  a: PlayerSeason;
  b: PlayerSeason;
  peers?: PlayerSeason[];
  peersA?: PlayerSeason[];
  peersB?: PlayerSeason[];
  careerSpanA?: string;
  careerSpanB?: string;
  teamKeysA?: string[];
  teamKeysB?: string[];
}): PlayerComparisonResult {
  const { a, b } = options;
  const careerMode =
    isCareerCompareKey(a.season) || isCareerCompareKey(b.season);
  const peersA = careerMode ? [] : (options.peersA ?? options.peers ?? []);
  const peersB = careerMode
    ? []
    : (options.peersB ?? options.peers ?? peersA);

  const qualify = (peers: PlayerSeason[]) => {
    const qualified = peers.filter(
      (p) =>
        p.gamesPlayed >= 15 && p.minutes / Math.max(1, p.gamesPlayed) >= 12
    );
    return qualified.length ? qualified : peers;
  };
  const poolA = qualify(peersA);
  const poolB = qualify(peersB);

  const dimensions: ComparisonDimension[] = [];

  for (const spec of COMPARE_DIMS) {
    const def = SHEET_STAT_BY_ID[spec.id];
    if (!def) continue;
    const label = spec.label ?? def.label;
    const invert = Boolean(spec.invert);
    const mode = "perGame" as const;

    const aRaw = getSheetStatValue(a, spec.id, mode);
    const bRaw = getSheetStatValue(b, spec.id, mode);
    if (aRaw == null && bRaw == null) continue;

    const aRawDisplay =
      aRaw != null ? formatSheetStatValue(aRaw, def, mode) : "—";
    const bRawDisplay =
      bRaw != null ? formatSheetStatValue(bRaw, def, mode) : "—";

    let aPct: number | undefined;
    let bPct: number | undefined;

    if (!careerMode && poolA.length && poolB.length) {
      const valuesA = poolA
        .map((row) => getSheetStatValue(row, spec.id, mode))
        .filter((n): n is number => n != null && Number.isFinite(n));
      const valuesB = poolB
        .map((row) => getSheetStatValue(row, spec.id, mode))
        .filter((n): n is number => n != null && Number.isFinite(n));
      if (aRaw != null && valuesA.length) {
        aPct = percentileOf(aRaw, valuesA, invert);
      }
      if (bRaw != null && valuesB.length) {
        bPct = percentileOf(bRaw, valuesB, invert);
      }
    }

    const rel = relativeBar(aRaw, bRaw, invert);
    const aBar = aPct ?? rel.aBar;
    const bBar = bPct ?? rel.bBar;

    let delta: number | undefined;
    if (aPct != null && bPct != null) delta = aPct - bPct;
    else if (aRaw != null && bRaw != null) {
      delta = invert ? bRaw - aRaw : aRaw - bRaw;
    }

    dimensions.push({
      id: spec.id,
      label,
      aDisplay: aRawDisplay,
      bDisplay: bRawDisplay,
      aValue: aRaw ?? undefined,
      bValue: bRaw ?? undefined,
      aPercentile: aPct,
      bPercentile: bPct,
      aBar,
      bBar,
      delta,
      group: def.category,
      note: careerMode
        ? "Career averages — bars scale within this matchup when league percentiles are unavailable."
        : undefined,
    });
  }

  const differenceSummary = buildDifferenceSummary(
    a.playerName,
    b.playerName,
    dimensions,
    careerMode
  );

  const seasonA = isCareerCompareKey(a.season)
    ? (options.careerSpanA ?? "Career")
    : a.season;
  const seasonB = isCareerCompareKey(b.season)
    ? (options.careerSpanB ?? "Career")
    : b.season;

  const aTeamKey = a.teamAbbreviation ?? a.teamId;
  const bTeamKey = b.teamAbbreviation ?? b.teamId;
  const aTeamKeys =
    options.teamKeysA?.length
      ? options.teamKeysA
      : aTeamKey && aTeamKey !== "CAR" && aTeamKey !== "CAREER"
        ? [aTeamKey]
        : [];
  const bTeamKeys =
    options.teamKeysB?.length
      ? options.teamKeysB
      : bTeamKey && bTeamKey !== "CAR" && bTeamKey !== "CAREER"
        ? [bTeamKey]
        : [];

  return {
    aId: a.playerId,
    bId: b.playerId,
    aName: a.playerName,
    bName: b.playerName,
    aTeamKey: aTeamKeys[0] ?? aTeamKey,
    bTeamKey: bTeamKeys[0] ?? bTeamKey,
    aTeamKeys,
    bTeamKeys,
    season: seasonA === seasonB ? seasonA : undefined,
    seasonA,
    seasonB,
    mode: careerMode ? "career" : "season",
    dimensions,
    differenceSummary,
  };
}

function buildDifferenceSummary(
  aName: string,
  bName: string,
  dimensions: ComparisonDimension[],
  careerMode: boolean
): string[] {
  const scored = dimensions
    .filter((d) => d.delta != null && Number.isFinite(d.delta))
    .map((d) => ({ d, abs: Math.abs(d.delta!) }))
    .sort((x, y) => y.abs - x.abs);

  if (!scored.length) {
    return [
      careerMode
        ? "Available career metrics are close across the compared dimensions."
        : "Available season metrics are close across the compared dimensions. Small gaps may reflect sample noise rather than a clear profile difference.",
    ];
  }

  const lines: string[] = [];
  for (const { d } of scored.slice(0, 3)) {
    const leader = (d.delta ?? 0) > 0 ? aName : bName;
    const trail = (d.delta ?? 0) > 0 ? bName : aName;
    if (d.aPercentile != null && d.bPercentile != null) {
      lines.push(
        `${leader} holds the edge in ${d.label} (${Math.round(
          Math.max(d.aPercentile, d.bPercentile)
        )}th vs ${Math.round(Math.min(d.aPercentile, d.bPercentile))}th among peers).`
      );
    } else {
      const leadDisp = (d.delta ?? 0) > 0 ? d.aDisplay : d.bDisplay;
      const trailDisp = (d.delta ?? 0) > 0 ? d.bDisplay : d.aDisplay;
      lines.push(
        `${leader} leads ${trail} in ${d.label} (${leadDisp} vs ${trailDisp}).`
      );
    }
  }
  return lines;
}

export { CATEGORY_ORDER };
