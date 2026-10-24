import type { PlayerSeasonSortKey } from "@/lib/player-season-sort";
import {
  SHEET_STAT_CATEGORY_CHIPS,
  sheetStatOrderIndex,
  type SheetStatCategory,
} from "@/lib/player-stat-sheet-registry";

/**
 * Explore board chips — same taxonomy as Statistics / percentile / compare.
 * Hustle included when the hustle overlay attaches season totals.
 */
export const PLAYER_BOARD_VIEWS = [
  { id: "all", label: "All" },
  { id: "impact", label: "Impact" },
  { id: "profile", label: "Profile" },
  { id: "shooting", label: "Shooting" },
  { id: "defense", label: "Defense" },
  { id: "hustle", label: "Hustle" },
  { id: "advanced", label: "Advanced" },
] as const;

export type PlayerBoardView = (typeof PLAYER_BOARD_VIEWS)[number]["id"];

export const PLAYER_BOARD_CATEGORY_VIEWS = PLAYER_BOARD_VIEWS.filter(
  (view) => view.id !== "all"
);

/** Same rate modes as Statistics (player-stats-board). */
export const PLAYER_BOARD_RATES = [
  { id: "perGame", label: "Per game" },
  { id: "totals", label: "Totals" },
  { id: "per100", label: "Per 100" },
] as const;

export type PlayerBoardRate = (typeof PLAYER_BOARD_RATES)[number]["id"];

const VIEW_IDS = PLAYER_BOARD_VIEWS.map((view) => view.id);
const VIEWS = new Set<string>(VIEW_IDS);
const RATES = new Set<string>(PLAYER_BOARD_RATES.map((r) => r.id));

/**
 * Legacy Explore / sheet chips → current taxonomy.
 * counting/overview → profile; rates → advanced; ts → shooting.
 */
function normalizeViewId(part: string): string {
  switch (part) {
    case "overview":
    case "counting":
      return "profile";
    case "rates":
      return "advanced";
    case "ts":
      return "shooting";
    case "hustle":
      return "hustle";
    case "per75":
      return "per100";
    default:
      return part;
  }
}

/** First paint default — full sheet columns (All). */
export const DEFAULT_PLAYER_BOARD_VIEWS: PlayerBoardView[] = ["all"];

export function parsePlayerBoardViews(value: string | null): PlayerBoardView[] {
  if (!value) return [...DEFAULT_PLAYER_BOARD_VIEWS];
  const selected = new Set(
    value
      .split(",")
      .map((part) => normalizeViewId(part.trim()))
      .filter((part): part is PlayerBoardView => VIEWS.has(part))
  );
  const ordered = VIEW_IDS.filter((id) => selected.has(id));
  return ordered.length ? ordered : [...DEFAULT_PLAYER_BOARD_VIEWS];
}

export function parsePlayerBoardView(value: string | null): PlayerBoardView {
  return parsePlayerBoardViews(value)[0] ?? DEFAULT_PLAYER_BOARD_VIEWS[0]!;
}

export function serializePlayerBoardViews(
  views: PlayerBoardView[]
): string | null {
  if (
    views.length === 1 &&
    views[0] === DEFAULT_PLAYER_BOARD_VIEWS[0]
  ) {
    return null;
  }
  return views.join(",");
}

export function togglePlayerBoardView(
  current: PlayerBoardView[],
  id: PlayerBoardView
): PlayerBoardView[] {
  if (id === "all") return ["all"];
  const categories = current.filter((view) => view !== "all");
  const has = categories.includes(id);
  if (current.includes("all") || categories.length === 0) return [id];
  if (has) {
    const next = categories.filter((view) => view !== id);
    return next.length ? next : [id];
  }
  return VIEW_IDS.filter(
    (view) => view !== "all" && (view === id || categories.includes(view))
  );
}

export function playerBoardViewLabel(id: PlayerBoardView): string {
  return (
    PLAYER_BOARD_VIEWS.find((view) => view.id === id)?.label ??
    SHEET_STAT_CATEGORY_CHIPS.find((c) => c.id === id)?.label ??
    id
  );
}

export function parsePlayerBoardRate(value: string | null): PlayerBoardRate {
  const normalized = value === "per75" ? "per100" : value;
  if (normalized && RATES.has(normalized)) return normalized as PlayerBoardRate;
  return "perGame";
}

/**
 * Columns on the Explore board, bucketed like the sheet. Every SHEET_STAT_DEFS
 * stat appears here under its sheet category (test-explore-players-board).
 */
export const PLAYER_BOARD_VIEW_COLUMNS: Record<
  PlayerBoardView,
  PlayerSeasonSortKey[]
> = {
  impact: [
    "darkoDpm",
    "darkoOff",
    "darkoDef",
    "raptor",
    "oRaptor",
    "dRaptor",
    "winsAdded",
    "r1WinEquivalents",
    "vorp",
    "drbl100",
    "drblO",
    "drblD",
  ],
  profile: [
    "gamesPlayed",
    "mpg",
    "ppg",
    "rpg",
    "offensiveRebounds",
    "defensiveRebounds",
    "apg",
    "tov",
    "personalFouls",
    "plusMinus",
  ],
  shooting: [
    "fieldGoalsMade",
    "fieldGoalsAttempted",
    "fieldGoalPct",
    "threePointersMade",
    "threePointersAttempted",
    "threePointPct",
    "twoPointersMade",
    "twoPointersAttempted",
    "twoPointPct",
    "freeThrowsMade",
    "freeThrowsAttempted",
    "freeThrowPct",
    "effectiveFieldGoalPct",
    "trueShootingPct",
  ],
  defense: [
    "spg",
    "bpg",
    "stealPct",
    "blockPct",
    "defensiveReboundPct",
    "defensiveRating",
    "dbpm",
    "dws",
  ],
  hustle: [
    "hustleDeflections",
    "hustleContestedShots",
    "hustleScreenAssists",
    "hustleChargesDrawn",
    "hustleLooseBallsRecovered",
    "hustleBoxOuts",
  ],
  advanced: [
    "threePointAttemptRate",
    "freeThrowRate",
    "usagePct",
    "turnoverPct",
    "assistPct",
    "offensiveReboundPct",
    "reboundPct",
    "assistToTurnover",
    "offensiveRating",
    "netRating",
    "pie",
    "per",
    "ows",
    "winShares",
    "winSharesPer48",
    "obpm",
    "bpm",
  ],
  /** Filled below as the deduped union in sheet category order. */
  all: [],
};

PLAYER_BOARD_VIEW_COLUMNS.all = (() => {
  const seen = new Set<PlayerSeasonSortKey>();
  const out: PlayerSeasonSortKey[] = [];
  for (const cat of PLAYER_BOARD_CATEGORY_VIEWS) {
    for (const key of PLAYER_BOARD_VIEW_COLUMNS[cat.id]) {
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(key);
    }
  }
  return out;
})();

/** GP has no sheet column, so it leads its band ahead of the sheet order. */
function boardColumnOrder(key: PlayerSeasonSortKey): number {
  return key === "gamesPlayed" ? -1 : sheetStatOrderIndex(key);
}

/** A view's columns minus those with no value anywhere on the current board. */
export function filterPlayerBoardViewColumns(
  view: PlayerBoardView,
  emptyColumns: ReadonlySet<PlayerSeasonSortKey>
): PlayerSeasonSortKey[] {
  return PLAYER_BOARD_VIEW_COLUMNS[view]
    .filter((key) => !emptyColumns.has(key))
    .sort((a, b) => boardColumnOrder(a) - boardColumnOrder(b));
}

/** Category for an Explore column — sheet taxonomy only. */
export function playerBoardColumnCategory(
  key: PlayerSeasonSortKey
): SheetStatCategory | null {
  for (const cat of PLAYER_BOARD_CATEGORY_VIEWS) {
    if ((PLAYER_BOARD_VIEW_COLUMNS[cat.id] as string[]).includes(key)) {
      return cat.id as SheetStatCategory;
    }
  }
  return null;
}
