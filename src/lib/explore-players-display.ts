import type { PlayerSeasonSortKey } from "@/lib/player-season-sort";

export const PLAYER_BOARD_VIEWS = [
  { id: "all", label: "Show all stats" },
  { id: "overview", label: "Overview" },
  { id: "profile", label: "Profile" },
  { id: "shooting", label: "Shooting" },
  { id: "impact", label: "Impact" },
  { id: "advanced", label: "Advanced" },
  { id: "defense", label: "Defense" },
  { id: "ts", label: "True Shooting" },
] as const;

export type PlayerBoardView = (typeof PLAYER_BOARD_VIEWS)[number]["id"];

export const PLAYER_BOARD_CATEGORY_VIEWS = PLAYER_BOARD_VIEWS.filter(
  (view) => view.id !== "all"
);

export const PLAYER_BOARD_RATES = [
  { id: "perGame", label: "Per Game" },
  { id: "per75", label: "Per 75" },
  { id: "per100", label: "Per 100" },
  { id: "totals", label: "Totals" },
] as const;

export type PlayerBoardRate = (typeof PLAYER_BOARD_RATES)[number]["id"];

const VIEW_IDS = PLAYER_BOARD_VIEWS.map((view) => view.id);
const VIEWS = new Set<string>(VIEW_IDS);
const RATES = new Set<string>(PLAYER_BOARD_RATES.map((r) => r.id));

export function parsePlayerBoardViews(value: string | null): PlayerBoardView[] {
  if (!value) return ["all"];
  const selected = new Set(
    value
      .split(",")
      .map((part) => part.trim())
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
  return PLAYER_BOARD_VIEWS.find((view) => view.id === id)?.label ?? id;
}

export function parsePlayerBoardRate(value: string | null): PlayerBoardRate {
  if (value && RATES.has(value)) return value as PlayerBoardRate;
  return "perGame";
}

export const PLAYER_BOARD_VIEW_COLUMNS: Record<
  PlayerBoardView,
  PlayerSeasonSortKey[]
> = {
  overview: [
    "gamesPlayed",
    "mpg",
    "ppg",
    "rpg",
    "apg",
    "spg",
    "bpg",
    "tov",
    "offensiveRebounds",
    "defensiveRebounds",
    "drbl100",
    "r1WinEquivalents",
  ],
  profile: [
    "gamesPlayed",
    "mpg",
    "age",
    "usagePct",
    "darkoDpm",
    "darkoOff",
    "darkoDef",
    "ppg",
    "apg",
    "rpg",
    "trueShootingPct",
    "relativeTrueShootingPct",
    "threePointPct",
    "spg",
    "bpg",
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
  impact: [
    "darkoDpm",
    "lebron",
    "drbl100",
    "r1WinEquivalents",
    "netRating",
    "offensiveRating",
    "defensiveRating",
  ],
  advanced: [
    "usagePct",
    "turnoverPct",
    "effectiveFieldGoalPct",
    "trueShootingPct",
    "offensiveRating",
    "defensiveRating",
    "netRating",
  ],
  defense: ["spg", "bpg", "defensiveRating", "darkoDpm"],
  ts: [
    "trueShootingPct",
    "relativeTrueShootingPct",
    "effectiveFieldGoalPct",
    "fieldGoalPct",
    "threePointPct",
    "freeThrowPct",
  ],
  /** Filled below as the deduped union of every category preset. */
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


export function filterPlayerBoardViewColumns(
  view: PlayerBoardView,
  flags: { hasDarko: boolean; hasLebron: boolean; hasDrbl: boolean }
): PlayerSeasonSortKey[] {
  return PLAYER_BOARD_VIEW_COLUMNS[view].filter((key) => {
    if (key === "drbl100" || key === "r1WinEquivalents") return flags.hasDrbl;
    if (view === "all") return true;
    if (key === "darkoDpm" || key === "darkoOff" || key === "darkoDef") {
      return flags.hasDarko;
    }
    if (key === "lebron") return flags.hasLebron;
    return true;
  });
}
