import type { PlayerSeasonSortKey } from "@/lib/player-season-sort";
import {
  SHEET_STAT_CATEGORY_CHIPS,
  sheetStatOrderIndex,
  type SheetStatCategory,
} from "@/lib/player-stat-sheet-registry";

/**
 * Explore board chips — same taxonomy as Statistics / percentile / compare.
 * Hustle omitted: board rows don't carry hustle fields.
 */
export const PLAYER_BOARD_VIEWS = [
  { id: "all", label: "All" },
  { id: "profile", label: "Profile" },
  { id: "shooting", label: "Shooting" },
  { id: "defense", label: "Defense" },
  { id: "advanced", label: "Advanced" },
  { id: "impact", label: "Impact" },
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

export function parsePlayerBoardViews(value: string | null): PlayerBoardView[] {
  if (!value) return ["all"];
  const selected = new Set(
    value
      .split(",")
      .map((part) => normalizeViewId(part.trim()))
      .filter((part): part is PlayerBoardView => VIEWS.has(part))
  );
  const ordered = VIEW_IDS.filter((id) => selected.has(id));
  return ordered.length ? ordered : ["all"];
}

export function parsePlayerBoardView(value: string | null): PlayerBoardView {
  return parsePlayerBoardViews(value)[0] ?? "all";
}

export function serializePlayerBoardViews(
  views: PlayerBoardView[]
): string | null {
  if (views.length === 1 && views[0] === "all") return null;
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
 * Columns available on the Explore board, bucketed like the sheet.
 * Subset of SHEET_STAT_DEFS — only keys the board can render/sort today.
 */
export const PLAYER_BOARD_VIEW_COLUMNS: Record<
  PlayerBoardView,
  PlayerSeasonSortKey[]
> = {
  profile: [
    "gamesPlayed",
    "mpg",
    "ppg",
    "rpg",
    "offensiveRebounds",
    "defensiveRebounds",
    "apg",
    "tov",
  ],
  shooting: [
    "fieldGoalPct",
    "twoPointPct",
    "threePointPct",
    "threePointersAttempted",
    "freeThrowPct",
    "freeThrowsAttempted",
    "effectiveFieldGoalPct",
    "trueShootingPct",
  ],
  defense: ["spg", "bpg", "defensiveRating"],
  advanced: [
    "usagePct",
    "turnoverPct",
    "offensiveRating",
    "netRating",
    "bpm",
  ],
  impact: [
    "darkoDpm",
    "darkoOff",
    "darkoDef",
    "raptor",
    "oRaptor",
    "dRaptor",
    "winsAdded",
    "r1WinEquivalents",
    "drbl100",
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
  out.sort((a, b) => sheetStatOrderIndex(a) - sheetStatOrderIndex(b));
  return out;
})();

export function filterPlayerBoardViewColumns(
  view: PlayerBoardView,
  flags: { hasDarko: boolean; hasRaptor: boolean; hasDrbl: boolean }
): PlayerSeasonSortKey[] {
  return PLAYER_BOARD_VIEW_COLUMNS[view].filter((key) => {
    if (key === "drbl100" || key === "r1WinEquivalents") return flags.hasDrbl;
    if (key === "darkoDpm" || key === "darkoOff" || key === "darkoDef") {
      return flags.hasDarko;
    }
    if (
      key === "raptor" ||
      key === "oRaptor" ||
      key === "dRaptor" ||
      key === "winsAdded"
    ) {
      return flags.hasRaptor;
    }
    return true;
  });
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
