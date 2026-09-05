import type { CompactPlayerGameLogRow } from "@/data/history/player-game-log";

/**
 * Race-tracker metrics.
 *
 * - counting: cumulative box-score totals from baked game logs
 * - season_total: season additive value (WAR1, VORP, WS, R1 pts) paced by
 *   minutes into a cumulative race
 * - season_rate: season rate (DRBL/100, BPM, TS%, …) — reconstructed as a
 *   game-by-game ability path that settles on the published season number
 */
export type PlayerRaceMetricKind =
  | "counting"
  | "season_total"
  | "season_rate";

export type PlayerRaceMetricGroup =
  | "Scoring"
  | "Playmaking"
  | "Rebounding"
  | "Defense"
  | "Usage"
  | "Impact"
  | "Advanced";

export type PlayerRaceMetric =
  | "points"
  | "rebounds"
  | "offensiveRebounds"
  | "defensiveRebounds"
  | "assists"
  | "steals"
  | "blocks"
  | "turnovers"
  | "minutes"
  | "fgm"
  | "fga"
  | "threePm"
  | "threePa"
  | "ftm"
  | "fta"
  | "war1"
  | "r1Points"
  | "drbl100"
  | "darkoDpm"
  | "bpm"
  | "vorp"
  | "per"
  | "winShares"
  | "ws48"
  | "usagePct"
  | "trueShootingPct";

export type PlayerRaceMetricDef = {
  id: PlayerRaceMetric;
  label: string;
  shortLabel: string;
  group: PlayerRaceMetricGroup;
  kind: PlayerRaceMetricKind;
  /** Counting field on CompactPlayerGameLogRow (counting metrics only). */
  gameKey?: keyof CompactPlayerGameLogRow;
  /** Higher is better for sorting / axis (false for turnovers). */
  higherIsBetter?: boolean;
  /**
   * Season values can land below zero — race UI offers a Lowest end so
   * negative / trailing players are reachable without pinning.
   */
  canBeNegative?: boolean;
  /** Format hint for labels. */
  format?: "int" | "one" | "two" | "pct";
  description?: string;
};

/** Field size for the race chart (`all` = every ranked player with logs). */
export type PlayerRaceFieldSize = number | "all";

/**
 * Which end of the ranking to show.
 * `both` = leaders and trailers together (signed metrics: positive + negative).
 */
export type PlayerRaceRankEnd = "high" | "low" | "both";

export const PLAYER_RACE_TOP_N_OPTIONS = [25, 40, 60, 80] as const;
/** Default Explore visualizations to the full uncapped field. */
export const PLAYER_RACE_DEFAULT_FIELD_SIZE: PlayerRaceFieldSize = "all";
/** @deprecated Prefer PLAYER_RACE_DEFAULT_FIELD_SIZE (`all`). */
export const PLAYER_RACE_DEFAULT_TOP_N = 40;
/** Soft cap when not requesting the full league. */
export const PLAYER_RACE_MAX_TOP_N = 80;

export const PLAYER_RACE_METRICS: PlayerRaceMetricDef[] = [
  // Scoring
  {
    id: "points",
    label: "Points",
    shortLabel: "PTS",
    group: "Scoring",
    kind: "counting",
    gameKey: "points",
    format: "int",
  },
  {
    id: "fgm",
    label: "Field goals made",
    shortLabel: "FGM",
    group: "Scoring",
    kind: "counting",
    gameKey: "fgm",
    format: "int",
  },
  {
    id: "fga",
    label: "Field goals attempted",
    shortLabel: "FGA",
    group: "Scoring",
    kind: "counting",
    gameKey: "fga",
    format: "int",
  },
  {
    id: "threePm",
    label: "Threes made",
    shortLabel: "3PM",
    group: "Scoring",
    kind: "counting",
    gameKey: "threePm",
    format: "int",
  },
  {
    id: "threePa",
    label: "Threes attempted",
    shortLabel: "3PA",
    group: "Scoring",
    kind: "counting",
    gameKey: "threePa",
    format: "int",
  },
  {
    id: "ftm",
    label: "Free throws made",
    shortLabel: "FTM",
    group: "Scoring",
    kind: "counting",
    gameKey: "ftm",
    format: "int",
  },
  {
    id: "fta",
    label: "Free throws attempted",
    shortLabel: "FTA",
    group: "Scoring",
    kind: "counting",
    gameKey: "fta",
    format: "int",
  },
  {
    id: "trueShootingPct",
    label: "True shooting %",
    shortLabel: "TS%",
    group: "Scoring",
    kind: "season_rate",
    format: "pct",
    description:
      "Season true shooting — cumulative from game logs when available.",
  },
  // Playmaking
  {
    id: "assists",
    label: "Assists",
    shortLabel: "AST",
    group: "Playmaking",
    kind: "counting",
    gameKey: "assists",
    format: "int",
  },
  {
    id: "turnovers",
    label: "Turnovers",
    shortLabel: "TOV",
    group: "Playmaking",
    kind: "counting",
    gameKey: "turnovers",
    format: "int",
    higherIsBetter: false,
  },
  // Rebounding
  {
    id: "rebounds",
    label: "Rebounds",
    shortLabel: "REB",
    group: "Rebounding",
    kind: "counting",
    gameKey: "rebounds",
    format: "int",
  },
  {
    id: "offensiveRebounds",
    label: "Offensive rebounds",
    shortLabel: "ORB",
    group: "Rebounding",
    kind: "counting",
    gameKey: "orb",
    format: "int",
  },
  {
    id: "defensiveRebounds",
    label: "Defensive rebounds",
    shortLabel: "DRB",
    group: "Rebounding",
    kind: "counting",
    gameKey: "drb",
    format: "int",
  },
  // Defense
  {
    id: "steals",
    label: "Steals",
    shortLabel: "STL",
    group: "Defense",
    kind: "counting",
    gameKey: "steals",
    format: "int",
  },
  {
    id: "blocks",
    label: "Blocks",
    shortLabel: "BLK",
    group: "Defense",
    kind: "counting",
    gameKey: "blocks",
    format: "int",
  },
  // Usage
  {
    id: "minutes",
    label: "Minutes",
    shortLabel: "MIN",
    group: "Usage",
    kind: "counting",
    gameKey: "minutesNum",
    format: "one",
  },
  {
    id: "usagePct",
    label: "Usage %",
    shortLabel: "USG%",
    group: "Usage",
    kind: "season_rate",
    format: "pct",
    description:
      "Season usage rate — reconstructed path that settles on the published season rate.",
  },
  // Impact (DRBL / DARKO)
  {
    id: "war1",
    label: "WAR1",
    shortLabel: "WAR1",
    group: "Impact",
    kind: "season_total",
    format: "two",
    canBeNegative: true,
    description:
      "Season WAR1 (win equivalents) paced across games by minutes.",
  },
  {
    id: "r1Points",
    label: "R1 points",
    shortLabel: "R1 PTS",
    group: "Impact",
    kind: "season_total",
    format: "one",
    canBeNegative: true,
    description: "Season R1 points paced across games by minutes.",
  },
  {
    id: "drbl100",
    label: "DRBL/100",
    shortLabel: "DRBL",
    group: "Impact",
    kind: "season_rate",
    format: "two",
    canBeNegative: true,
    description:
      "Season DRBL ability per 100 — reconstructed path that settles on the published season rate.",
  },
  {
    id: "darkoDpm",
    label: "DARKO DPM",
    shortLabel: "DPM",
    group: "Impact",
    kind: "season_rate",
    format: "two",
    canBeNegative: true,
    description:
      "Season DARKO DPM — reconstructed path that settles on the published season rate.",
  },
  // Advanced (BRef)
  {
    id: "bpm",
    label: "BPM",
    shortLabel: "BPM",
    group: "Advanced",
    kind: "season_rate",
    format: "two",
    canBeNegative: true,
    description:
      "Season Box Plus/Minus — reconstructed path that settles on the published season rate.",
  },
  {
    id: "vorp",
    label: "VORP",
    shortLabel: "VORP",
    group: "Advanced",
    kind: "season_total",
    format: "two",
    canBeNegative: true,
    description: "Season VORP paced across games by minutes.",
  },
  {
    id: "per",
    label: "PER",
    shortLabel: "PER",
    group: "Advanced",
    kind: "season_rate",
    format: "one",
    canBeNegative: true,
    description:
      "Season PER — reconstructed path that settles on the published season rate.",
  },
  {
    id: "winShares",
    label: "Win shares",
    shortLabel: "WS",
    group: "Advanced",
    kind: "season_total",
    format: "two",
    canBeNegative: true,
    description: "Season win shares paced across games by minutes.",
  },
  {
    id: "ws48",
    label: "WS/48",
    shortLabel: "WS/48",
    group: "Advanced",
    kind: "season_rate",
    format: "two",
    canBeNegative: true,
    description:
      "Season win shares per 48 — reconstructed path that settles on the published season rate.",
  },
];

const METRIC_BY_ID = new Map(
  PLAYER_RACE_METRICS.map((row) => [row.id, row] as const)
);

export const PLAYER_RACE_METRIC_GROUPS: PlayerRaceMetricGroup[] = [
  "Impact",
  "Scoring",
  "Playmaking",
  "Rebounding",
  "Defense",
  "Usage",
  "Advanced",
];

export type PlayerRacePoint = {
  date: string;
  /** Series value — cumulative total, paced season total, or reconstructed rate. */
  value: number;
  games: number;
};

export type PlayerRacePlayer = {
  playerId: string;
  espnId: string | null;
  nbaId: string | null;
  displayName: string;
  shortName: string;
  teamId: string;
  teamAbbr: string;
  points: PlayerRacePoint[];
  currentValue: number;
  gamesPlayed: number;
  /** Regular-season minutes from baked game logs (qualification filter). */
  minutesPlayed: number;
};

export const PLAYER_RACE_MIN_MINUTES_OPTIONS = [
  0, 100, 200, 500, 1000, 1500,
] as const;
export const PLAYER_RACE_DEFAULT_MIN_MINUTES = 0;
/** Default peer floor for league scatters when `minmp` is omitted. */
export const VIZ_SCATTER_DEFAULT_MIN_MINUTES = 500;

export type PlayerRaceWindow = 7 | 14 | 30 | 60 | "all";

export type PlayerRaceChartRow = {
  date: string;
  label: string;
  [playerId: string]: string | number | null | undefined;
};

export type PlayerRaceNeighborGap = {
  playerId: string;
  shortName: string;
  value: number;
  /** Positive = this neighbor is ahead (higher cumulative total). */
  gap: number;
};

const COMBINED_TEAM = new Set(["TOT", "2TM", "3TM", "4TM"]);

export function isCombinedRaceTeam(team: string | null | undefined): boolean {
  return COMBINED_TEAM.has(String(team ?? "").toUpperCase().trim());
}

export function getPlayerRaceMetricDef(
  metric: PlayerRaceMetric
): PlayerRaceMetricDef {
  return METRIC_BY_ID.get(metric) ?? PLAYER_RACE_METRICS[0]!;
}

/** Overlay-backed metrics that need a season board/DRBL/DARKO total. */
export function playerRaceUsesSeasonOverlay(
  metric: PlayerRaceMetric
): boolean {
  const kind = getPlayerRaceMetricDef(metric).kind;
  return kind === "season_total" || kind === "season_rate";
}

export function playerRaceIsRateMetric(metric: PlayerRaceMetric): boolean {
  return getPlayerRaceMetricDef(metric).kind === "season_rate";
}

export function playerRaceAxisTitle(metric: PlayerRaceMetric): string {
  const short = playerRaceMetricShort(metric);
  const kind = getPlayerRaceMetricDef(metric).kind;
  if (kind === "season_rate") return short;
  if (kind === "season_total") return `Cumulative ${short}`;
  return `Cumulative ${short}`;
}

export function playerRaceModeLabel(metric: PlayerRaceMetric): string {
  const kind = getPlayerRaceMetricDef(metric).kind;
  if (kind === "season_rate") return "reconstructed season rate";
  if (kind === "season_total") return "paced cumulative";
  return "cumulative";
}

export function parsePlayerRaceMetric(
  raw: string | null | undefined
): PlayerRaceMetric {
  const value = String(raw ?? "").trim();
  if (METRIC_BY_ID.has(value as PlayerRaceMetric)) {
    return value as PlayerRaceMetric;
  }
  const lower = value.toLowerCase();
  if (lower === "reb" || lower === "trb") return "rebounds";
  if (lower === "ast") return "assists";
  if (lower === "stl") return "steals";
  if (lower === "blk") return "blocks";
  if (lower === "min" || lower === "mins") return "minutes";
  if (lower === "tov" || lower === "to") return "turnovers";
  if (lower === "drbl" || lower === "drbl/100") return "drbl100";
  if (lower === "dpm" || lower === "darko") return "darkoDpm";
  if (lower === "ws") return "winShares";
  if (lower === "r1" || lower === "r1points") return "r1Points";
  return "points";
}

export function playerRaceMetricCanBeNegative(metric: PlayerRaceMetric): boolean {
  return getPlayerRaceMetricDef(metric).canBeNegative === true;
}

export function parsePlayerRaceFieldSize(
  raw: string | number | null | undefined
): PlayerRaceFieldSize {
  if (raw == null || raw === "") return PLAYER_RACE_DEFAULT_FIELD_SIZE;
  if (typeof raw === "string") {
    const trimmed = raw.trim().toLowerCase();
    if (trimmed === "all" || trimmed === "league" || trimmed === "full") {
      return "all";
    }
    const n = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(n)) return PLAYER_RACE_DEFAULT_FIELD_SIZE;
    return Math.min(
      PLAYER_RACE_MAX_TOP_N,
      Math.max(5, Math.floor(n))
    );
  }
  if (!Number.isFinite(raw)) return PLAYER_RACE_DEFAULT_FIELD_SIZE;
  return Math.min(PLAYER_RACE_MAX_TOP_N, Math.max(5, Math.floor(raw)));
}

export function parsePlayerRaceRankEnd(
  raw: string | null | undefined,
  metric: PlayerRaceMetric
): PlayerRaceRankEnd {
  if (!playerRaceMetricCanBeNegative(metric)) return "high";
  const value = String(raw ?? "").trim().toLowerCase();
  if (
    value === "low" ||
    value === "bottom" ||
    value === "tail" ||
    value === "negative" ||
    value === "neg"
  ) {
    return "low";
  }
  if (
    value === "high" ||
    value === "top" ||
    value === "leaders" ||
    value === "positive" ||
    value === "pos"
  ) {
    return "high";
  }
  // Default for signed metrics: both ends so positive and negative show together.
  return "both";
}

/**
 * Pick a field from a high→low sorted pool.
 * `both` takes half from each end (leaders + trailers) so signed races show
 * positive and negative values at once.
 */
export function takePlayerRaceFieldSlice<T>(
  sortedHighFirst: T[],
  n: number,
  rankEnd: PlayerRaceRankEnd,
  keyOf: (item: T) => string
): T[] {
  if (n <= 0 || !sortedHighFirst.length) return [];
  if (sortedHighFirst.length <= n) return [...sortedHighFirst];

  if (rankEnd === "low") {
    return sortedHighFirst.slice(-n);
  }
  if (rankEnd !== "both") {
    return sortedHighFirst.slice(0, n);
  }

  const out: T[] = [];
  const seen = new Set<string>();
  const highTarget = Math.ceil(n / 2);
  for (const item of sortedHighFirst) {
    if (out.length >= highTarget) break;
    const key = keyOf(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  for (let i = sortedHighFirst.length - 1; i >= 0 && out.length < n; i -= 1) {
    const item = sortedHighFirst[i]!;
    const key = keyOf(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/**
 * Evenly sample `n` players across a high→low sorted pool.
 * Used when "all players" must be capped for log-load cost without
 * leaving a hole around replacement level (top+bottom slice).
 */
export function samplePlayerRaceFieldEvenly<T>(
  sortedHighFirst: T[],
  n: number,
  keyOf: (item: T) => string
): T[] {
  if (n <= 0 || !sortedHighFirst.length) return [];
  if (sortedHighFirst.length <= n) return [...sortedHighFirst];

  const out: T[] = [];
  const seen = new Set<string>();
  const last = sortedHighFirst.length - 1;

  for (let i = 0; i < n; i += 1) {
    const index =
      n === 1 ? 0 : Math.round((i * last) / (n - 1));
    const item = sortedHighFirst[index]!;
    const key = keyOf(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }

  return out;
}

export function parsePlayerRaceMinMinutes(
  raw: string | number | null | undefined
): number {
  if (raw == null || raw === "") return PLAYER_RACE_DEFAULT_MIN_MINUTES;
  const n =
    typeof raw === "number" ? raw : Number.parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(5000, Math.floor(n));
}

/** Scatter views default to 500 MP when the URL omits `minmp`. */
export function parseVizScatterMinMinutes(
  raw: string | number | null | undefined
): number {
  if (raw == null || raw === "") return VIZ_SCATTER_DEFAULT_MIN_MINUTES;
  return parsePlayerRaceMinMinutes(raw);
}

export function playerRaceFieldSizeParam(size: PlayerRaceFieldSize): string {
  return size === "all" ? "all" : String(size);
}

export function playerRaceMetricLabel(metric: PlayerRaceMetric): string {
  return getPlayerRaceMetricDef(metric).label;
}

export function playerRaceMetricShort(metric: PlayerRaceMetric): string {
  return getPlayerRaceMetricDef(metric).shortLabel;
}

export function shortPlayerRaceName(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "Player";
  if (parts.length === 1) return parts[0]!;
  return parts[parts.length - 1]!;
}

function isRegularSeasonGame(game: CompactPlayerGameLogRow): boolean {
  const raw = String(game.seasonType ?? "").trim().toLowerCase();
  if (!raw || raw === "regular" || raw === "2" || raw.includes("reg")) {
    return true;
  }
  if (!(raw === "playoffs" || raw === "3" || raw.includes("post"))) {
    return true;
  }
  // ESPN bake bug: seasontype=3 sometimes dumps Oct–Apr games labeled playoffs.
  // Keep true spring/summer playoffs out of the regular-season race.
  const stamp = String(game.date ?? "");
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(stamp);
  if (!match) return false;
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month >= 10 || month <= 3) return true;
  if (month === 4 && day < 15) return true;
  return false;
}

function orderedRegularGames(
  games: CompactPlayerGameLogRow[]
): CompactPlayerGameLogRow[] {
  return games
    .filter(
      (game) =>
        game &&
        game.date &&
        game.gameId &&
        isRegularSeasonGame(game) &&
        Number(game.minutesNum ?? 0) >= 0
    )
    .slice()
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        String(a.gameId).localeCompare(String(b.gameId))
    );
}

export function sumPlayerRaceMinutes(
  games: CompactPlayerGameLogRow[]
): number {
  return orderedRegularGames(games).reduce(
    (sum, game) => sum + Math.max(0, Number(game.minutesNum ?? 0)),
    0
  );
}

function countingDelta(
  game: CompactPlayerGameLogRow,
  metric: PlayerRaceMetric
): number {
  const def = getPlayerRaceMetricDef(metric);
  if (def.kind !== "counting" || !def.gameKey) return 0;
  const raw = game[def.gameKey];
  // ORB/DRB may be null on older bakes — fall back when possible.
  if (metric === "offensiveRebounds" || metric === "defensiveRebounds") {
    const n = Number(raw ?? 0);
    return Number.isFinite(n) ? n : 0;
  }
  if (metric === "rebounds") {
    const reb = Number(game.rebounds ?? 0);
    if (reb > 0) return reb;
    const orb = Number(game.orb ?? 0);
    const drb = Number(game.drb ?? 0);
    if (orb > 0 || drb > 0) return orb + drb;
    return Number.isFinite(reb) ? reb : 0;
  }
  const value = Number(raw ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function roundRaceValue(value: number, metric: PlayerRaceMetric): number {
  const format = getPlayerRaceMetricDef(metric).format ?? "int";
  if (format === "pct") return Math.round(value * 1000) / 1000;
  if (format === "two") return Math.round(value * 100) / 100;
  if (format === "one") return Math.round(value * 10) / 10;
  return Math.round(value * 10) / 10;
}

/** Build the on-court race / level series for one player. */
export function buildPlayerRaceSeries(
  games: CompactPlayerGameLogRow[],
  metric: PlayerRaceMetric,
  options?: { seasonTotal?: number | null; playerId?: string }
): PlayerRacePoint[] {
  const def = getPlayerRaceMetricDef(metric);
  const ordered = orderedRegularGames(games);

  if (def.kind === "season_rate") {
    const rate = Number(options?.seasonTotal ?? Number.NaN);
    if (!Number.isFinite(rate) || ordered.length === 0) return [];
    if (metric === "trueShootingPct") {
      const fromBox = buildCumulativeTrueShootingSeries(
        ordered,
        metric,
        rate
      );
      // Prefer box TS when it actually moves; otherwise reconstructed path.
      if (fromBox.length >= 3 && seriesValueRange(fromBox) > 0.012) {
        return fromBox;
      }
    }
    return buildSeasonRateProgressionSeries({
      games: ordered,
      metric,
      seasonRate: rate,
      playerId: options?.playerId ?? "",
    });
  }

  // Pace from a published season total when provided (overlay / full-field path).
  // Counting races still accumulate box deltas when seasonTotal is omitted.
  const pacedTotal = Number(options?.seasonTotal ?? Number.NaN);
  if (
    (def.kind === "season_total" || def.kind === "counting") &&
    Number.isFinite(pacedTotal) &&
    ordered.length > 0
  ) {
    const seasonTotal = pacedTotal;
    const minutes = ordered.map((g) => Math.max(0, Number(g.minutesNum ?? 0)));
    const minuteSum = minutes.reduce((a, b) => a + b, 0);
    const baseWeights =
      minuteSum > 0
        ? minutes.map((m) => m / minuteSum)
        : ordered.map(() => 1 / ordered.length);

    // Mild zero-sum jitter so paced totals aren't perfectly linear ramps.
    const rng = mulberry32(
      hashStringSeed(
        `${options?.playerId ?? ""}|${metric}|${ordered[0]!.date}|total`
      )
    );
    const jitter = baseWeights.map(() => (rng() - 0.5) * 0.22);
    const jitterSum = jitter.reduce((a, b) => a + b, 0);
    const weights = baseWeights.map((w, i) =>
      Math.max(0.02 / ordered.length, w + (jitter[i] ?? 0) - jitterSum / ordered.length)
    );
    const weightSum = weights.reduce((a, b) => a + b, 0);
    const normalized = weights.map((w) => w / weightSum);

    let total = 0;
    let gamesPlayed = 0;
    const byDate = new Map<string, PlayerRacePoint>();
    for (let i = 0; i < ordered.length; i++) {
      const game = ordered[i]!;
      total += seasonTotal * (normalized[i] ?? 0);
      gamesPlayed += 1;
      byDate.set(game.date, {
        date: game.date,
        value: roundRaceValue(total, metric),
        games: gamesPlayed,
      });
    }
    const points = [...byDate.values()].sort((a, b) =>
      a.date.localeCompare(b.date)
    );
    if (points.length) {
      points[points.length - 1] = {
        ...points[points.length - 1]!,
        value: roundRaceValue(seasonTotal, metric),
      };
    }
    return downsampleRacePoints(points);
  }

  let total = 0;
  let gamesPlayed = 0;
  const byDate = new Map<string, PlayerRacePoint>();
  for (const game of ordered) {
    total += countingDelta(game, metric);
    gamesPlayed += 1;
    byDate.set(game.date, {
      date: game.date,
      value: roundRaceValue(total, metric),
      games: gamesPlayed,
    });
  }
  return downsampleRacePoints(
    [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
  );
}

/**
 * Reliability prior for reconstructed season-rate paths.
 * Visual K is softer than production EB so mid-season movement stays visible;
 * the series still snaps to the published season rate at the end.
 */
function seasonRatePrior(metric: PlayerRaceMetric): {
  k: number;
  priorMean: number;
  noiseAmp: number;
} {
  switch (metric) {
    case "drbl100":
      return { k: 420, priorMean: 0, noiseAmp: 2.6 };
    case "darkoDpm":
      return { k: 360, priorMean: 0, noiseAmp: 2.2 };
    case "bpm":
      return { k: 320, priorMean: 0, noiseAmp: 2.4 };
    case "per":
      return { k: 300, priorMean: 15, noiseAmp: 3.8 };
    case "ws48":
      return { k: 280, priorMean: 0.1, noiseAmp: 0.085 };
    case "usagePct":
      return { k: 220, priorMean: 0.2, noiseAmp: 0.075 };
    case "trueShootingPct":
      return { k: 220, priorMean: 0.55, noiseAmp: 0.065 };
    default:
      return { k: 320, priorMean: 0, noiseAmp: 2 };
  }
}

/** Normalize board pct rates that may be stored as 0–1 or 0–100. */
export function normalizeRaceSeasonRate(
  metric: PlayerRaceMetric,
  raw: number
): number {
  if (!Number.isFinite(raw)) return raw;
  const format = getPlayerRaceMetricDef(metric).format;
  if (format === "pct" && raw > 1.5) return raw / 100;
  return raw;
}

/** On-court possession proxy from minutes (team ~100 poss / 48 min). */
function possessionProxyFromMinutes(minutes: number): number {
  return Math.max(0.5, minutes * (100 / 48));
}

function seasonRateSampleWeight(
  metric: PlayerRaceMetric,
  minutes: number
): number {
  if (metric === "drbl100") return possessionProxyFromMinutes(minutes);
  return Math.max(0.5, minutes);
}

function hashStringSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seriesValueRange(points: PlayerRacePoint[]): number {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    if (!Number.isFinite(point.value)) continue;
    min = Math.min(min, point.value);
    max = Math.max(max, point.value);
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return 0;
  return max - min;
}

/**
 * Reconstruct a season-rate path from game logs that ends exactly on the
 * published season rate. Uses a responsive EWMA of noisy game observations
 * so mid-season movement stays visible (not true PBP recompute).
 */
export function buildSeasonRateProgressionSeries(options: {
  games: CompactPlayerGameLogRow[];
  metric: PlayerRaceMetric;
  seasonRate: number;
  playerId: string;
}): PlayerRacePoint[] {
  const { games, metric, playerId } = options;
  if (!games.length) return [];
  const seasonRate = normalizeRaceSeasonRate(metric, options.seasonRate);
  if (!Number.isFinite(seasonRate)) return [];

  const { k, priorMean, noiseAmp } = seasonRatePrior(metric);
  const weights = games.map((g) =>
    seasonRateSampleWeight(metric, Number(g.minutesNum ?? 0))
  );
  const totalW = weights.reduce((a, b) => a + b, 0);
  if (!(totalW > 0)) return [];

  const avgW = totalW / games.length;
  const rng = mulberry32(
    hashStringSeed(`${playerId}|${metric}|${games[0]!.date}|rate-v2`)
  );
  const randn = () => {
    const u = Math.max(1e-12, rng());
    const v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  // EWMA of noisy observations around the season rate — stays lively mid-year.
  const alpha = Math.min(0.28, Math.max(0.12, 3.2 / Math.max(8, games.length)));
  let ewma = priorMean + (seasonRate - priorMean) * 0.15;
  let wCum = 0;
  let gamesPlayed = 0;
  const rawPoints: PlayerRacePoint[] = [];

  for (let i = 0; i < games.length; i++) {
    const game = games[i]!;
    const w = weights[i] ?? avgW;
    // Milder weight dampening than 1/sqrt(minutes) so noise remains visible.
    const noise =
      (randn() * noiseAmp) / Math.sqrt(Math.max(0.65, w / Math.max(12, avgW)));
    const obs = seasonRate + noise;
    ewma = alpha * obs + (1 - alpha) * ewma;
    wCum += w;
    gamesPlayed += 1;

    // Blend responsive form with a soft reliability pull toward the season rate.
    const reliability = wCum / (wCum + k);
    const form = ewma;
    const anchored = (1 - reliability * 0.55) * form + reliability * 0.55 * seasonRate;
    const value = (1 - reliability) * (priorMean * 0.35 + form * 0.65) + reliability * anchored;

    rawPoints.push({
      date: game.date,
      value,
      games: gamesPlayed,
    });
  }

  // Collapse same-date games, then affine-nudge so the finale matches published.
  const byDate = new Map<string, PlayerRacePoint>();
  for (const point of rawPoints) byDate.set(point.date, point);
  let points = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  if (!points.length) return [];

  const last = points[points.length - 1]!;
  const drift = seasonRate - last.value;
  if (Math.abs(drift) > 1e-9) {
    const denom = Math.max(1, points.length - 1);
    points = points.map((point, index) => ({
      ...point,
      value: point.value + drift * (index / denom),
    }));
  }

  points = points.map((point, index) => ({
    ...point,
    value:
      index === points.length - 1
        ? roundRaceValue(seasonRate, metric)
        : roundRaceValue(point.value, metric),
  }));

  // Safety: if rounding flattened the path, re-seed a visible wobble.
  const minRange = Math.max(
    Math.abs(seasonRate - priorMean) * 0.12,
    noiseAmp * 0.45,
    getPlayerRaceMetricDef(metric).format === "pct" ? 0.02 : 0.35
  );
  if (seriesValueRange(points) < minRange && points.length >= 3) {
    const wobbleRng = mulberry32(
      hashStringSeed(`${playerId}|${metric}|wobble`)
    );
    points = points.map((point, index) => {
      if (index === 0 || index === points.length - 1) return point;
      const t = index / (points.length - 1);
      const wave =
        Math.sin(t * Math.PI * 2.2 + wobbleRng() * 0.7) * minRange * 0.55;
      return {
        ...point,
        value: roundRaceValue(point.value + wave, metric),
      };
    });
    points[points.length - 1] = {
      ...points[points.length - 1]!,
      value: roundRaceValue(seasonRate, metric),
    };
  }

  return downsampleRacePoints(points);
}

/** Cumulative true shooting from box scores (lands near season TS%). */
function buildCumulativeTrueShootingSeries(
  games: CompactPlayerGameLogRow[],
  metric: PlayerRaceMetric,
  seasonRate?: number
): PlayerRacePoint[] {
  let pts = 0;
  let tsa = 0;
  let gamesPlayed = 0;
  const byDate = new Map<string, PlayerRacePoint>();
  for (const game of games) {
    pts += Number(game.points ?? 0);
    tsa += Number(game.fga ?? 0) + 0.44 * Number(game.fta ?? 0);
    gamesPlayed += 1;
    if (tsa <= 0) continue;
    byDate.set(game.date, {
      date: game.date,
      value: roundRaceValue(pts / (2 * tsa), metric),
      games: gamesPlayed,
    });
  }
  if (!byDate.size) return [];
  let points = downsampleRacePoints(
    [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
  );
  if (
    seasonRate != null &&
    Number.isFinite(seasonRate) &&
    points.length
  ) {
    const target = normalizeRaceSeasonRate(metric, seasonRate);
    points = points.map((point, index) =>
      index === points.length - 1
        ? { ...point, value: roundRaceValue(target, metric) }
        : point
    );
  }
  return points;
}

/** Synthetic game shells when baked logs are missing — still get a lively rate path. */
export function synthesizePlayerRaceRateGames(options: {
  startDate: string;
  endDate: string;
  gamesPlayed?: number;
  minutesPlayed?: number;
  playerId: string;
}): CompactPlayerGameLogRow[] {
  const startMs = Date.parse(`${options.startDate}T12:00:00`);
  const endMs = Date.parse(`${options.endDate}T12:00:00`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return [];
  }
  const n = Math.max(
    16,
    Math.min(72, Math.round(options.gamesPlayed ?? 60))
  );
  const totalMin = Math.max(0, options.minutesPlayed ?? n * 28);
  const baseMpg = totalMin > 0 ? totalMin / n : 28;
  const rng = mulberry32(hashStringSeed(`${options.playerId}|synth-games`));
  const span = Math.max(1, endMs - startMs);
  const games: CompactPlayerGameLogRow[] = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1);
    const date = new Date(startMs + span * t).toISOString().slice(0, 10);
    const minutesNum = Math.max(
      8,
      baseMpg * (0.82 + rng() * 0.36)
    );
    games.push({
      gameId: `synth-${options.playerId}-${i}`,
      season: "",
      date,
      teamNbaId: "",
      opponentNbaId: "",
      teamAbbr: "",
      opponentAbbr: "",
      homeAway: i % 2 === 0 ? "home" : "away",
      result: "W",
      starter: true,
      minutes: null,
      minutesNum,
      points: 0,
      rebounds: 0,
      assists: 0,
      steals: 0,
      blocks: 0,
      turnovers: 0,
      fgm: 0,
      fga: 0,
      threePm: 0,
      threePa: 0,
      ftm: 0,
      fta: 0,
      orb: null,
      drb: null,
      pf: null,
      plusMinus: null,
      seasonType: "regular",
    });
  }
  return games;
}

/** Keep race payloads small — chart forward-fills between kept dates. */
function downsampleRacePoints(
  points: PlayerRacePoint[],
  maxPoints = 28
): PlayerRacePoint[] {
  if (points.length <= maxPoints) return points;
  const out: PlayerRacePoint[] = [];
  const lastIdx = points.length - 1;
  const step = lastIdx / (maxPoints - 1);
  let prev = -1;
  for (let i = 0; i < maxPoints; i++) {
    const idx = i === maxPoints - 1 ? lastIdx : Math.round(i * step);
    if (idx === prev) continue;
    out.push(points[idx]!);
    prev = idx;
  }
  return out;
}

export function buildPlayerRacePlayer(options: {
  playerId: string;
  espnId?: string | null;
  nbaId?: string | null;
  displayName: string;
  teamId: string;
  teamAbbr: string;
  games: CompactPlayerGameLogRow[];
  metric: PlayerRaceMetric;
  seasonTotal?: number | null;
}): PlayerRacePlayer {
  const points = buildPlayerRaceSeries(options.games, options.metric, {
    seasonTotal: options.seasonTotal,
    playerId: options.playerId,
  });
  const last = points[points.length - 1];
  return {
    playerId: options.playerId,
    espnId: options.espnId ?? null,
    nbaId: options.nbaId ?? null,
    displayName: options.displayName,
    shortName: shortPlayerRaceName(options.displayName),
    teamId: options.teamId,
    teamAbbr: options.teamAbbr,
    points,
    currentValue: last?.value ?? 0,
    gamesPlayed: last?.games ?? 0,
    minutesPlayed: sumPlayerRaceMinutes(options.games),
  };
}

/**
 * Fallback path when game logs are missing (or full-league field must stay
 * fast) — synthesize a game timeline and pace / reconstruct from the season
 * total or rate.
 */
export function buildPlayerRaceOverlayPlayer(options: {
  playerId: string;
  espnId?: string | null;
  nbaId?: string | null;
  displayName: string;
  teamId: string;
  teamAbbr: string;
  metric: PlayerRaceMetric;
  seasonTotal: number;
  startDate: string;
  endDate: string;
  gamesPlayed?: number;
  minutesPlayed?: number;
}): PlayerRacePlayer | null {
  const kind = getPlayerRaceMetricDef(options.metric).kind;
  if (
    kind !== "season_rate" &&
    kind !== "season_total" &&
    kind !== "counting"
  ) {
    return null;
  }
  if (!Number.isFinite(options.seasonTotal)) return null;
  if (!options.startDate || !options.endDate) return null;

  const games = synthesizePlayerRaceRateGames({
    startDate: options.startDate,
    endDate: options.endDate,
    gamesPlayed: options.gamesPlayed,
    minutesPlayed: options.minutesPlayed,
    playerId: options.playerId,
  });
  if (!games.length) return null;

  return buildPlayerRacePlayer({
    playerId: options.playerId,
    espnId: options.espnId,
    nbaId: options.nbaId,
    displayName: options.displayName,
    teamId: options.teamId,
    teamAbbr: options.teamAbbr,
    games,
    metric: options.metric,
    seasonTotal: options.seasonTotal,
  });
}

/** @deprecated Prefer buildPlayerRaceOverlayPlayer — kept for call-site clarity. */
export function buildPlayerRaceRateOverlayPlayer(
  options: Parameters<typeof buildPlayerRaceOverlayPlayer>[0]
): PlayerRacePlayer | null {
  return buildPlayerRaceOverlayPlayer(options);
}

/** Approximate regular-season window for overlay-only rate races. */
export function approxPlayerRaceSeasonWindow(
  season: string,
  now = new Date()
): { startDate: string; endDate: string } {
  const startYear = Number(season.slice(0, 4));
  const startDate = `${startYear}-10-15`;
  const seasonEnd = `${startYear + 1}-04-15`;
  const today = now.toISOString().slice(0, 10);
  const endDate = today < seasonEnd && today > startDate ? today : seasonEnd;
  return { startDate, endDate };
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function formatPlayerRaceAxisDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString(undefined, { month: "numeric", day: "numeric" });
}

/** Merge player curves onto a shared timeline with forward-filled totals. */
export function buildPlayerRaceChartRows(
  players: PlayerRacePlayer[],
  window: PlayerRaceWindow
): PlayerRaceChartRow[] {
  if (!players.length) return [];

  const dateSet = new Set<string>();
  for (const player of players) {
    for (const point of player.points) dateSet.add(point.date);
  }

  let dates = [...dateSet].sort();
  if (!dates.length) return [];

  if (window !== "all") {
    const end = dates[dates.length - 1]!;
    const start = addDays(end, -(window - 1));
    dates = dates.filter((date) => date >= start);
    if (!dates.length) dates = [end];
  }

  // Dense fields: keep ~40 timeline steps so Recharts stays responsive.
  if (players.length > 60 && dates.length > 45) {
    const step = Math.max(1, Math.ceil(dates.length / 40));
    const sampled: string[] = [];
    for (let i = 0; i < dates.length; i += step) {
      sampled.push(dates[i]!);
    }
    const last = dates[dates.length - 1]!;
    if (sampled[sampled.length - 1] !== last) sampled.push(last);
    dates = sampled;
  }

  const cursors = players.map(() => 0);
  const latest = players.map(() => null as number | null);

  return dates.map((date) => {
    const row: PlayerRaceChartRow = {
      date,
      label: formatPlayerRaceAxisDate(date),
    };
    for (let i = 0; i < players.length; i++) {
      const points = players[i]!.points;
      let cursor = cursors[i]!;
      while (cursor < points.length && points[cursor]!.date <= date) {
        latest[i] = points[cursor]!.value;
        cursor += 1;
      }
      cursors[i] = cursor;
      row[players[i]!.playerId] = latest[i];
    }
    return row;
  });
}

export function sortPlayerRacePlayers(
  players: PlayerRacePlayer[],
  metric: PlayerRaceMetric = "points",
  rankEnd: PlayerRaceRankEnd = "high"
): PlayerRacePlayer[] {
  const higher = getPlayerRaceMetricDef(metric).higherIsBetter !== false;
  // `both` sorts like Highest so the list reads top → bottom (pos → neg).
  const preferHigh = rankEnd !== "low";
  return [...players].sort((a, b) => {
    if (a.currentValue !== b.currentValue) {
      const asc = a.currentValue - b.currentValue;
      const bestFirst = higher ? -asc : asc;
      return preferHigh ? bestFirst : -bestFirst;
    }
    return a.displayName.localeCompare(b.displayName);
  });
}

export function playerRaceYAxisStep(span: number): number {
  const s = Math.max(1e-6, Math.abs(span));
  // Prefer ~7–8 ticks so mid-range races (WAR1 ~15–20 span) use step 2/2.5, not 5/10.
  const rough = s / 7.5;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const scaled = rough / pow;
  let nice: number;
  if (scaled <= 1) nice = 1;
  else if (scaled <= 2) nice = 2;
  else if (scaled <= 2.5) nice = 2.5;
  else if (scaled <= 5) nice = 5;
  else nice = 10;
  return nice * pow;
}

/**
 * Fit the Y axis tightly to the field's observed min/max so dense races
 * (especially "All players" with negatives) aren't crushed by empty padding.
 */
export function playerRaceYAxisDomain(
  rows: PlayerRaceChartRow[],
  playerIds: string[],
  metric: PlayerRaceMetric = "points"
): [number, number] {
  let dataMax = Number.NEGATIVE_INFINITY;
  let dataMin = Number.POSITIVE_INFINITY;
  for (const row of rows) {
    for (const playerId of playerIds) {
      const value = row[playerId];
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      dataMax = Math.max(dataMax, value);
      dataMin = Math.min(dataMin, value);
    }
  }
  if (!Number.isFinite(dataMax) || !Number.isFinite(dataMin)) return [0, 1];

  const rate = playerRaceIsRateMetric(metric);
  // Non-negative counting / paced totals still pin the floor at 0 (race start).
  // Once any series dips below 0, fit both ends to the data.
  const pinFloorZero = !rate && dataMin >= -1e-9;

  if (dataMax === dataMin) {
    const pad = Math.max(rate ? 0.35 : 0.5, Math.abs(dataMax) * 0.08 || 0.35);
    if (pinFloorZero) return [0, Math.max(pad, dataMax + pad)];
    return [dataMin - pad, dataMax + pad];
  }

  const lo = pinFloorZero ? 0 : dataMin;
  const hi = dataMax;
  const span = Math.max(rate ? 0.25 : 0.5, hi - lo);
  const pad = Math.max(span * 0.03, rate ? 0.05 : 0.1);
  const paddedLo = pinFloorZero ? 0 : lo - pad;
  const paddedHi = hi + pad;

  const step = playerRaceYAxisStep(paddedHi - paddedLo);
  let domainLo = pinFloorZero ? 0 : Math.floor(paddedLo / step) * step;
  let domainHi = Math.ceil(paddedHi / step) * step;
  if (domainHi <= domainLo) domainHi = domainLo + step;

  // Drop an empty outer tick band when rounding left a large blank region.
  while (
    domainHi - step + 1e-9 >= dataMax &&
    domainHi - dataMax > step * 0.45 &&
    domainHi - step > domainLo + 1e-9
  ) {
    domainHi -= step;
  }
  while (
    !pinFloorZero &&
    domainLo + step - 1e-9 <= dataMin &&
    dataMin - domainLo > step * 0.45 &&
    domainHi > domainLo + step + 1e-9
  ) {
    domainLo += step;
  }

  if (domainHi < dataMax) domainHi = Math.ceil(dataMax / step) * step;
  if (!pinFloorZero && domainLo > dataMin) {
    domainLo = Math.floor(dataMin / step) * step;
  }
  if (domainHi <= domainLo) domainHi = domainLo + step;

  return [domainLo, domainHi];
}

export function playerRaceYAxisTicks(domain: [number, number]): number[] {
  const [min, max] = domain;
  const span = Math.max(1e-6, max - min);
  let step = playerRaceYAxisStep(span);
  if (span / step > 8) {
    step = playerRaceYAxisStep(span / 6);
  }
  const ticks: number[] = [];
  const start = Math.round(min / step) * step;
  for (let v = start; v <= max + step * 1e-6; v += step) {
    const rounded = Math.round(v * 1000) / 1000;
    if (rounded + step * 1e-6 >= min && rounded - step * 1e-6 <= max) {
      ticks.push(rounded);
    }
    if (ticks.length > 12) break;
  }
  if (!ticks.length) return [min, max];
  if (Math.abs(ticks[0]! - min) > step * 0.01) ticks.unshift(min);
  if (Math.abs(ticks[ticks.length - 1]! - max) > step * 0.01) ticks.push(max);
  return ticks;
}

export function formatPlayerRaceYTick(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1000) {
    return Math.round(value).toLocaleString();
  }
  if (Math.abs(value) >= 10) {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export function formatPlayerRaceValue(
  value: number,
  metric: PlayerRaceMetric
): string {
  if (!Number.isFinite(value)) return "—";
  const format = getPlayerRaceMetricDef(metric).format ?? "int";
  if (format === "pct") {
    const pct = value <= 1.5 ? value * 100 : value;
    return `${pct.toFixed(1)}%`;
  }
  if (format === "two") {
    return value.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  }
  if (format === "one" || metric === "minutes") {
    return value.toLocaleString(undefined, {
      maximumFractionDigits: 1,
    });
  }
  return Math.round(value).toLocaleString();
}

/** Pick the player line closest to the pointer at a chart row. */
export function nearestPlayerRaceAtPointer(
  players: PlayerRacePlayer[],
  row: PlayerRaceChartRow,
  pointerY: number,
  yDomain: [number, number],
  plot: { top: number; height: number }
): string | null {
  const [yMin, yMax] = yDomain;
  const span = yMax - yMin;
  if (!Number.isFinite(span) || span <= 0 || plot.height <= 0) return null;

  let bestId: string | null = null;
  let bestDist = Infinity;
  let bestValue = -Infinity;

  for (const player of players) {
    const value = row[player.playerId];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;

    const pointY = plot.top + ((yMax - value) / span) * plot.height;
    const dist = Math.abs(pointerY - pointY);

    if (
      dist < bestDist - 1e-6 ||
      (Math.abs(dist - bestDist) <= 1e-6 && value > bestValue)
    ) {
      bestDist = dist;
      bestValue = value;
      bestId = player.playerId;
    }
  }

  return bestId;
}

export function playerRaceNeighborsAt(
  players: PlayerRacePlayer[],
  playerId: string,
  row: PlayerRaceChartRow | null | undefined
): { above: PlayerRaceNeighborGap | null; below: PlayerRaceNeighborGap | null } {
  if (!row) return { above: null, below: null };

  const selfValue = row[playerId];
  if (typeof selfValue !== "number" || !Number.isFinite(selfValue)) {
    return { above: null, below: null };
  }

  let above: { player: PlayerRacePlayer; value: number } | null = null;
  let below: { player: PlayerRacePlayer; value: number } | null = null;

  for (const player of players) {
    if (player.playerId === playerId) continue;
    const value = row[player.playerId];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;

    if (value > selfValue) {
      if (
        !above ||
        value < above.value - 1e-9 ||
        (Math.abs(value - above.value) <= 1e-9 &&
          player.shortName.localeCompare(above.player.shortName) < 0)
      ) {
        above = { player, value };
      }
    } else if (value < selfValue) {
      if (
        !below ||
        value > below.value + 1e-9 ||
        (Math.abs(value - below.value) <= 1e-9 &&
          player.shortName.localeCompare(below.player.shortName) < 0)
      ) {
        below = { player, value };
      }
    }
  }

  return {
    above: above
      ? {
          playerId: above.player.playerId,
          shortName: above.player.shortName,
          value: above.value,
          gap: above.value - selfValue,
        }
      : null,
    below: below
      ? {
          playerId: below.player.playerId,
          shortName: below.player.shortName,
          value: below.value,
          gap: selfValue - below.value,
        }
      : null,
  };
}
