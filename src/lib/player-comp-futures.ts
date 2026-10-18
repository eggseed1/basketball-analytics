import { getBundledCompPool, type BundledCompPoolRow } from "@/data/runtime/bref-advanced-snapshot";
import { bundledDrblOverlayMeta } from "@/data/runtime/drbl-overlay-snapshot";
import type { PlayerSeason } from "@/data/types";
import { formatNumber } from "@/lib/format";
import { darkoDefense, darkoOffense, darkoTotal } from "@/lib/player-stat-sheet-registry";
import { hasValidDrblEstimate } from "@/data/queries/percentiles";

export const FUTURE_SEASONS = 5;
export const TABLE_LIMIT = 10;
export const FAN_LIMIT = 25;
export const AGE_WINDOW = 1;
export const QUALIFYING_GAMES = 10;
/** Below this many qualifying ratings, the horizon has no aggregate range. */
export const MIN_RATING_SAMPLE = 8;
/**
 * similarity = 100 * exp(-distance). Distance 0 is the only way to score 100.
 * Ranking and weights use this value unrounded.
 */
export const SIMILARITY_SCALE = 1;

/**
 * Group weights. Features inside a group split the group weight equally so
 * correlated stats in one group cannot outvote the others.
 */
export const COMP_MATCH_WEIGHTS = {
  impact: 2,
  balance: 1,
  trajectory: 1,
  production: 1,
  efficiency: 1,
  role: 1,
  body: 0.5,
  experience: 0.5,
  age: 0.35,
} as const;

export const COMP_METRICS = [
  { id: "drbl100", label: "DRBL/100", digits: 1, unit: "points per 100 possessions", baseline: "0 is average" },
  { id: "war1", label: "WAR1", digits: 1, unit: "a season total", baseline: "0 is average" },
  { id: "darko", label: "DARKO", digits: 2, unit: "points per 100 possessions", baseline: "0 is average" },
  { id: "bpm", label: "BPM", digits: 1, unit: "points per 100 possessions", baseline: "0 is average" },
  { id: "vorp", label: "VORP", digits: 1, unit: "wins above replacement", baseline: "0 is replacement" },
  { id: "raptor", label: "RAPTOR", digits: 2, unit: "points per 100 possessions", baseline: "0 is average" },
  { id: "drblO", label: "DRBL-O", digits: 1, unit: "points per 100 possessions", baseline: "0 is average" },
  { id: "drblD", label: "DRBL-D", digits: 1, unit: "points per 100 possessions", baseline: "0 is average" },
  { id: "darkoOff", label: "DARKO-O", digits: 2, unit: "points per 100 possessions", baseline: "0 is average" },
  { id: "darkoDef", label: "DARKO-D", digits: 2, unit: "points per 100 possessions", baseline: "0 is average" },
] as const;

export type CompMetricId = (typeof COMP_METRICS)[number]["id"];

export type CompSlotKind =
  | "anchor"
  | "qualifying"
  | "unrated"
  | "short"
  | "missing"
  | "unobserved"
  | "unavailable";

export type CompSlot = {
  season: string;
  games: number | null;
  value: number | null;
  kind: CompSlotKind;
};

export type CompFuturesPoint = {
  age: number;
  /** Elapsed seasons after the anchor. Negative numbers are the player's own history. */
  offset: number;
  season: string | null;
  focal: number | null;
  p10: number | null;
  p25: number | null;
  p50: number | null;
  p75: number | null;
  p90: number | null;
  /** Share of observed comps with 10+ games. Null when the horizon is unobserved. */
  participation: number | null;
  playedCount: number;
  observedCount: number;
  ratingCount: number;
  suppressed: boolean;
};

export type CompFuturesRow = {
  playerId: string;
  playerName: string;
  season: string;
  age: number;
  value: number;
  /** Full-precision similarity, 0 to 100. */
  similarity: number;
  slots: CompSlot[];
  future: Array<number | null>;
};

export type CompFanLine = {
  playerId: string;
  playerName: string;
  similarity: number;
  anchorSeason: string;
  anchorAge: number;
  anchorValue: number;
  slots: CompSlot[];
  values: Array<number | null>;
};

export type CompFutures = {
  metricId: CompMetricId;
  metricLabel: string;
  digits: number;
  unit: string;
  baseline: string;
  versionNote: string;
  coverageStart: string;
  coverageEnd: string;
  focalName: string;
  focalSeason: string;
  focalAge: number;
  focalValue: number;
  rank: number;
  poolSize: number;
  closestName: string;
  closestSeason: string;
  fanCount: number;
  ageWindow: number;
  points: CompFuturesPoint[];
  table: CompFuturesRow[];
  fan: CompFanLine[];
};

export type CompFuturesBundle = {
  defaultId: CompMetricId;
  items: CompFutures[];
};

export type CompFocalProfile = {
  off: number | null;
  def: number | null;
  lag1: number | null;
  lag2: number | null;
  pts36: number | null;
  trb36: number | null;
  ast36: number | null;
  heightInches: number | null;
  positionCode: number | null;
  experience: number | null;
};

const EMPTY_PROFILE: CompFocalProfile = {
  off: null,
  def: null,
  lag1: null,
  lag2: null,
  pts36: null,
  trb36: null,
  ast36: null,
  heightInches: null,
  positionCode: null,
  experience: null,
};

function meanStd(values: number[]): { mean: number; std: number } {
  const n = values.length;
  if (!n) return { mean: 0, std: 1 };
  const mean = values.reduce((s, v) => s + v, 0) / n;
  let varSum = 0;
  for (const v of values) varSum += (v - mean) ** 2;
  const std = Math.sqrt(varSum / n);
  return { mean, std: std > 1e-6 ? std : 1 };
}

function z(value: number, mean: number, std: number): number {
  return (value - mean) / std;
}

/** Smallest value whose cumulative weight reaches `p` of the total weight. */
export function weightedPercentile(
  items: Array<{ value: number; weight: number }>,
  p: number
): number | null {
  const sorted = items
    .filter((item) => Number.isFinite(item.value) && item.weight > 0)
    .sort((a, b) => a.value - b.value || b.weight - a.weight);
  const total = sorted.reduce((sum, item) => sum + item.weight, 0);
  if (!sorted.length || total <= 0) return null;
  const target = Math.min(Math.max(p, 0), 1) * total;
  let acc = 0;
  for (const item of sorted) {
    acc += item.weight;
    if (acc >= target) return item.value;
  }
  return sorted[sorted.length - 1]!.value;
}

export function similarityIndex(distance: number): number {
  if (!Number.isFinite(distance) || distance < 0) return 0;
  return 100 * Math.exp(-distance / SIMILARITY_SCALE);
}

export function shiftSeason(season: string, years: number): string | null {
  const match = /^(\d{4})-(\d{2})$/.exec(season);
  if (!match) return null;
  const start = Number(match[1]) + years;
  if (!Number.isFinite(start)) return null;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

function byPlayerSeason(pool: BundledCompPoolRow[]): Map<string, BundledCompPoolRow[]> {
  const map = new Map<string, BundledCompPoolRow[]>();
  for (const row of pool) {
    const list = map.get(row.playerId);
    if (list) list.push(row);
    else map.set(row.playerId, [row]);
  }
  for (const list of map.values()) list.sort((a, b) => a.season.localeCompare(b.season));
  return map;
}

export function poolMetricValue(
  row: BundledCompPoolRow,
  metricId: CompMetricId
): number | null {
  const raw = row[metricId];
  return raw != null && Number.isFinite(raw) ? raw : null;
}

function finiteOrNull(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) ? value : null;
}

function seasonMetricValue(
  row: PlayerSeason,
  pooled: BundledCompPoolRow | undefined,
  metricId: CompMetricId
): number | null {
  const fromPool = pooled ? poolMetricValue(pooled, metricId) : null;
  const prefer = (value: number | null | undefined) =>
    value != null && Number.isFinite(value) ? value : fromPool;
  switch (metricId) {
    case "drbl100":
      return hasValidDrblEstimate(row) && Number.isFinite(row.drbl100)
        ? row.drbl100
        : fromPool;
    case "war1":
      return prefer(row.r1WinEquivalents);
    case "darko":
      return darkoTotal(row) ?? fromPool;
    case "darkoOff":
      return darkoOffense(row) ?? fromPool;
    case "darkoDef":
      return darkoDefense(row) ?? fromPool;
    case "bpm":
      return prefer(row.bpm);
    case "vorp":
      return prefer(row.vorp);
    case "raptor":
      return prefer(row.raptor);
    case "drblO":
      return hasValidDrblEstimate(row) && Number.isFinite(row.drblO) ? row.drblO : fromPool;
    case "drblD":
      return hasValidDrblEstimate(row) && Number.isFinite(row.drblD) ? row.drblD : fromPool;
    default:
      return fromPool;
  }
}

function balanceOf(row: BundledCompPoolRow, metricId: CompMetricId): {
  off: number | null;
  def: number | null;
} {
  if (metricId === "drbl100" || metricId === "drblO" || metricId === "drblD" || metricId === "war1") {
    return { off: finiteOrNull(row.drblO), def: finiteOrNull(row.drblD) };
  }
  if (metricId === "darko" || metricId === "darkoOff" || metricId === "darkoDef") {
    return { off: finiteOrNull(row.darkoOff), def: finiteOrNull(row.darkoDef) };
  }
  return { off: finiteOrNull(row.obpm), def: finiteOrNull(row.dbpm) };
}

export function classifySlot(
  row: BundledCompPoolRow | undefined,
  season: string,
  metricId: CompMetricId,
  seasonsInPool: Set<string>,
  maxSeason: string,
  anchor: boolean
): CompSlot {
  if (!seasonsInPool.has(season)) {
    return {
      season,
      games: null,
      value: null,
      kind: season > maxSeason ? "unobserved" : "unavailable",
    };
  }
  if (!row) {
    return { season, games: null, value: null, kind: "missing" };
  }
  const value = poolMetricValue(row, metricId);
  if (anchor) {
    return { season, games: row.gamesPlayed, value, kind: "anchor" };
  }
  if (row.gamesPlayed < QUALIFYING_GAMES) {
    return { season, games: row.gamesPlayed, value, kind: "short" };
  }
  if (value == null) {
    return { season, games: row.gamesPlayed, value: null, kind: "unrated" };
  }
  return { season, games: row.gamesPlayed, value, kind: "qualifying" };
}

function slotsForPlayer(
  career: BundledCompPoolRow[],
  anchorSeason: string,
  metricId: CompMetricId,
  seasonsInPool: Set<string>,
  maxSeason: string
): CompSlot[] {
  const bySeason = new Map(career.map((row) => [row.season, row]));
  const slots: CompSlot[] = [];
  for (let offset = 0; offset <= FUTURE_SEASONS; offset++) {
    const season = shiftSeason(anchorSeason, offset);
    if (!season) {
      slots.push({ season: anchorSeason, games: null, value: null, kind: "unavailable" });
      continue;
    }
    slots.push(
      classifySlot(
        bySeason.get(season),
        season,
        metricId,
        seasonsInPool,
        maxSeason,
        offset === 0
      )
    );
  }
  return slots;
}

type FeatureDef = {
  group: keyof typeof COMP_MATCH_WEIGHTS;
  focal: number | null;
  read: (row: BundledCompPoolRow, career: BundledCompPoolRow[]) => number | null | undefined;
};

function lagValue(
  career: BundledCompPoolRow[],
  season: string,
  back: number,
  metricId: CompMetricId,
  published: Set<string>
): number | null | undefined {
  const prior = shiftSeason(season, -back);
  if (!prior || !published.has(prior)) return undefined;
  const row = career.find((item) => item.season === prior);
  if (!row) return null;
  const value = poolMetricValue(row, metricId);
  return value == null ? undefined : value;
}

function buildFeatures(
  metricId: CompMetricId,
  focalValue: number,
  focalTs: number,
  focalUsg: number,
  focalAstPct: number,
  focalRebPct: number,
  focalAge: number,
  profile: CompFocalProfile,
  published: Set<string>
): FeatureDef[] {
  const impactIsOff = metricId === "drblO" || metricId === "darkoOff";
  const impactIsDef = metricId === "drblD" || metricId === "darkoDef";
  return [
    {
      group: "impact",
      focal: focalValue,
      read: (row) => poolMetricValue(row, metricId),
    },
    {
      group: "balance",
      focal: impactIsOff ? null : profile.off,
      read: (row) => (impactIsOff ? null : balanceOf(row, metricId).off),
    },
    {
      group: "balance",
      focal: impactIsDef ? null : profile.def,
      read: (row) => (impactIsDef ? null : balanceOf(row, metricId).def),
    },
    {
      group: "trajectory",
      focal: profile.lag1,
      read: (row, career) => lagValue(career, row.season, 1, metricId, published),
    },
    {
      group: "trajectory",
      focal: profile.lag2,
      read: (row, career) => lagValue(career, row.season, 2, metricId, published),
    },
    {
      group: "trajectory",
      focal: profile.lag1 == null ? null : focalValue - profile.lag1,
      read: (row, career) => {
        const prior = lagValue(career, row.season, 1, metricId, published);
        if (prior === undefined) return undefined;
        const current = poolMetricValue(row, metricId);
        if (prior == null || current == null) return null;
        return current - prior;
      },
    },
    {
      group: "production",
      focal: profile.pts36,
      read: (row) => finiteOrNull(row.pts36),
    },
    {
      group: "production",
      focal: profile.trb36,
      read: (row) => finiteOrNull(row.trb36),
    },
    {
      group: "production",
      focal: profile.ast36,
      read: (row) => finiteOrNull(row.ast36),
    },
    {
      group: "efficiency",
      focal: focalTs > 0 ? focalTs : null,
      read: (row) => (row.trueShootingPct > 0 ? row.trueShootingPct : null),
    },
    {
      group: "role",
      focal: focalUsg > 0 ? focalUsg : null,
      read: (row) => (row.usagePct > 0 ? row.usagePct : null),
    },
    {
      group: "role",
      focal: focalAstPct > 0 ? focalAstPct : null,
      read: (row) => (row.assistPct > 0 ? row.assistPct : null),
    },
    {
      group: "role",
      focal: focalRebPct > 0 ? focalRebPct : null,
      read: (row) => (row.reboundPct > 0 ? row.reboundPct : null),
    },
    {
      group: "role",
      focal: profile.positionCode,
      read: (row) => finiteOrNull(row.positionCode),
    },
    {
      group: "body",
      focal: profile.heightInches,
      read: (row) => {
        const height = finiteOrNull(row.heightInches);
        return height == null ? undefined : height;
      },
    },
    {
      group: "experience",
      focal: profile.experience,
      read: (row) => (Number.isFinite(row.experience) ? row.experience : null),
    },
    {
      group: "age",
      focal: focalAge,
      read: (row) => row.age,
    },
  ];
}

function featureDistance(
  row: BundledCompPoolRow,
  career: BundledCompPoolRow[],
  features: FeatureDef[],
  stats: Array<{ mean: number; std: number } | null>
): number {
  const byGroup = new Map<string, number[]>();
  features.forEach((feature, index) => {
    if (feature.focal == null || !stats[index]) return;
    const raw = feature.read(row, career);
    if (raw === undefined) return;
    const stat = stats[index]!;
    const delta =
      raw == null
        ? 1
        : z(raw, stat.mean, stat.std) - z(feature.focal, stat.mean, stat.std);
    const list = byGroup.get(feature.group) ?? [];
    list.push(delta * delta);
    byGroup.set(feature.group, list);
  });
  let sum = 0;
  for (const [group, deltas] of byGroup) {
    const weight = COMP_MATCH_WEIGHTS[group as keyof typeof COMP_MATCH_WEIGHTS];
    const share = weight / deltas.length;
    for (const delta of deltas) sum += share * delta;
  }
  return byGroup.size ? Math.sqrt(sum) : Number.POSITIVE_INFINITY;
}

function coverageFor(metricId: CompMetricId, pool: BundledCompPoolRow[]): {
  start: string;
  end: string;
  versionNote: string;
} {
  const seasons = [
    ...new Set(
      pool
        .filter((row) => poolMetricValue(row, metricId) != null)
        .map((row) => row.season)
    ),
  ].sort();
  const start = seasons[0] ?? "1996-97";
  const end = seasons[seasons.length - 1] ?? start;
  const metric = COMP_METRICS.find((item) => item.id === metricId)!;
  if (metricId === "drbl100" || metricId === "drblO" || metricId === "drblD" || metricId === "war1") {
    const meta = bundledDrblOverlayMeta();
    return {
      start,
      end,
      versionNote: `DRBL overlay v${meta.version}`,
    };
  }
  return {
    start,
    end,
    versionNote: `${metric.label}, ${metric.baseline}`,
  };
}

export function buildCompFutures(options: {
  metricId: CompMetricId;
  focalPlayerId: string;
  focalName: string;
  focalSeason: string;
  focalAge: number;
  focalValue: number;
  focalTs: number;
  focalUsg: number;
  focalAstPct: number;
  focalRebPct: number;
  profile?: Partial<CompFocalProfile>;
  career: Array<{ age: number; value: number }>;
  pool: BundledCompPoolRow[];
}): CompFutures | null {
  const metric = COMP_METRICS.find((item) => item.id === options.metricId);
  if (!metric) return null;
  const age = Math.round(options.focalAge);
  if (!Number.isFinite(age) || !Number.isFinite(options.focalValue)) return null;
  const profile: CompFocalProfile = { ...EMPTY_PROFILE, ...options.profile };

  const careers = byPlayerSeason(options.pool);
  const seasonsInPool = new Set(options.pool.map((row) => row.season));
  const maxSeason = [...seasonsInPool].sort().at(-1) ?? options.focalSeason;

  const eligible = options.pool.filter((row) => {
    if (row.playerId === options.focalPlayerId) return false;
    if (row.gamesPlayed < QUALIFYING_GAMES) return false;
    if (Math.abs(row.age - age) > AGE_WINDOW) return false;
    return poolMetricValue(row, options.metricId) != null;
  });
  if (eligible.length < MIN_RATING_SAMPLE) return null;

  const published = new Set(
    options.pool
      .filter((row) => poolMetricValue(row, options.metricId) != null)
      .map((row) => row.season)
  );
  const features = buildFeatures(
    options.metricId,
    options.focalValue,
    options.focalTs,
    options.focalUsg,
    options.focalAstPct,
    options.focalRebPct,
    age,
    profile,
    published
  );
  const stats = features.map((feature) => {
    if (feature.focal == null) return null;
    const values = eligible.flatMap((row) => {
      const raw = feature.read(row, careers.get(row.playerId) ?? []);
      return raw == null ? [] : [raw];
    });
    return values.length >= 8 ? meanStd(values) : null;
  });

  const scored = eligible
    .map((row) => {
      const dist = featureDistance(row, careers.get(row.playerId) ?? [], features, stats);
      return { row, dist, similarity: similarityIndex(dist) };
    })
    .sort((a, b) => a.dist - b.dist || b.similarity - a.similarity);

  const unique: typeof scored = [];
  const seen = new Set<string>();
  for (const hit of scored) {
    if (seen.has(hit.row.playerId)) continue;
    seen.add(hit.row.playerId);
    unique.push(hit);
    if (unique.length >= FAN_LIMIT) break;
  }
  if (unique.length < MIN_RATING_SAMPLE) return null;

  const fan: CompFanLine[] = unique.map((hit) => ({
    playerId: hit.row.playerId,
    playerName: hit.row.playerName,
    similarity: hit.similarity,
    anchorSeason: hit.row.season,
    anchorAge: hit.row.age,
    anchorValue: poolMetricValue(hit.row, options.metricId)!,
    slots: slotsForPlayer(
      careers.get(hit.row.playerId) ?? [],
      hit.row.season,
      options.metricId,
      seasonsInPool,
      maxSeason
    ),
    values: [],
  }));

  const careerAges = options.career.map((point) => point.age).filter((n) => Number.isFinite(n));
  const minAge = careerAges.length ? Math.min(...careerAges) : age;
  const ages: number[] = [];
  for (let a = minAge; a <= age + FUTURE_SEASONS; a++) ages.push(a);

  const focalByAge = new Map<number, number>();
  for (const point of options.career) {
    if (!Number.isFinite(point.age) || !Number.isFinite(point.value)) continue;
    if (Math.round(point.age) <= age) focalByAge.set(Math.round(point.age), point.value);
  }

  for (const line of fan) {
    line.values = ages.map((chartAge) => {
      const offset = chartAge - age;
      if (offset < 0 || offset > FUTURE_SEASONS) return null;
      const slot = line.slots[offset];
      return slot?.value ?? null;
    });
  }

  const points: CompFuturesPoint[] = ages.map((chartAge) => {
    const offset = chartAge - age;
    const season = offset >= 0 ? shiftSeason(options.focalSeason, offset) : null;
    const focalValue = offset < 0 ? (focalByAge.get(chartAge) ?? null) : offset === 0 ? options.focalValue : null;
    if (offset < 0) {
      return {
        age: chartAge,
        offset,
        season,
        focal: focalValue,
        p10: null,
        p25: null,
        p50: null,
        p75: null,
        p90: null,
        participation: null,
        playedCount: 0,
        observedCount: 0,
        ratingCount: 0,
        suppressed: false,
      };
    }
    if (offset === 0) {
      return {
        age: chartAge,
        offset,
        season,
        focal: options.focalValue,
        p10: options.focalValue,
        p25: options.focalValue,
        p50: options.focalValue,
        p75: options.focalValue,
        p90: options.focalValue,
        participation: null,
        playedCount: 0,
        observedCount: 0,
        ratingCount: 0,
        suppressed: false,
      };
    }
    const observed = fan.flatMap((line) => {
      const slot = line.slots[offset];
      if (!slot) return [];
      if (slot.kind === "unobserved" || slot.kind === "unavailable") return [];
      return [{ line, slot }];
    });
    const played = observed.filter(
      (item) => item.slot.kind === "qualifying" || item.slot.kind === "unrated"
    );
    const rated = observed.filter(
      (item) => item.slot.kind === "qualifying" && item.slot.value != null
    );
    const observedWeight = observed.reduce((sum, item) => sum + item.line.similarity, 0);
    const playedWeight = played.reduce((sum, item) => sum + item.line.similarity, 0);
    const changes = rated.flatMap((item) => {
      const anchor = item.line.slots[0]?.value;
      if (anchor == null || !Number.isFinite(anchor) || item.slot.value == null) return [];
      return [{ value: item.slot.value - anchor, weight: item.line.similarity }];
    });
    const suppressed = changes.length < MIN_RATING_SAMPLE;
    const fromMark = (p: number) => {
      const change = weightedPercentile(changes, p);
      return change == null ? null : options.focalValue + change;
    };
    return {
      age: chartAge,
      offset,
      season,
      focal: null,
      p10: suppressed ? null : fromMark(0.1),
      p25: suppressed ? null : fromMark(0.25),
      p50: suppressed ? null : fromMark(0.5),
      p75: suppressed ? null : fromMark(0.75),
      p90: suppressed ? null : fromMark(0.9),
      participation: observedWeight > 0 ? playedWeight / observedWeight : null,
      playedCount: played.length,
      observedCount: observed.length,
      ratingCount: changes.length,
      suppressed,
    };
  });

  const table: CompFuturesRow[] = fan.slice(0, TABLE_LIMIT).map((line) => ({
    playerId: line.playerId,
    playerName: line.playerName,
    season: line.anchorSeason,
    age: line.anchorAge,
    value: line.anchorValue,
    similarity: line.similarity,
    slots: line.slots,
    future: line.slots.slice(1).map((slot) => slot.value),
  }));

  const sameAgePeers = options.pool.filter((row) => {
    if (row.playerId === options.focalPlayerId && row.season === options.focalSeason) return false;
    if (row.age !== age || row.gamesPlayed < QUALIFYING_GAMES) return false;
    return poolMetricValue(row, options.metricId) != null;
  });
  const ranked = [
    ...sameAgePeers.map((row) => ({
      playerId: `${row.playerId}|${row.season}`,
      value: poolMetricValue(row, options.metricId)!,
    })),
    { playerId: `${options.focalPlayerId}|${options.focalSeason}`, value: options.focalValue },
  ].sort((a, b) => b.value - a.value || a.playerId.localeCompare(b.playerId));
  const rankKey = `${options.focalPlayerId}|${options.focalSeason}`;
  const rank = ranked.findIndex((row) => row.playerId === rankKey) + 1;
  const coverage = coverageFor(options.metricId, options.pool);
  const closest = fan[0]!;

  return {
    metricId: metric.id,
    metricLabel: metric.label,
    digits: metric.digits,
    unit: metric.unit,
    baseline: metric.baseline,
    versionNote: coverage.versionNote,
    coverageStart: coverage.start,
    coverageEnd: coverage.end,
    focalName: options.focalName,
    focalSeason: options.focalSeason,
    focalAge: age,
    focalValue: options.focalValue,
    rank: rank > 0 ? rank : ranked.length,
    poolSize: ranked.length,
    closestName: closest.playerName,
    closestSeason: closest.anchorSeason,
    fanCount: fan.length,
    ageWindow: AGE_WINDOW,
    points,
    table,
    fan,
  };
}

function profileFromPool(
  rows: BundledCompPoolRow[],
  season: string,
  metricId: CompMetricId
): CompFocalProfile {
  const current = rows.find((row) => row.season === season);
  if (!current) return EMPTY_PROFILE;
  const balance = balanceOf(current, metricId);
  const published = new Set(
    rows.filter((row) => poolMetricValue(row, metricId) != null).map((row) => row.season)
  );
  const lag1 = lagValue(rows, season, 1, metricId, published);
  const lag2 = lagValue(rows, season, 2, metricId, published);
  return {
    off: balance.off,
    def: balance.def,
    lag1: lag1 ?? null,
    lag2: lag2 ?? null,
    pts36: finiteOrNull(current.pts36),
    trb36: finiteOrNull(current.trb36),
    ast36: finiteOrNull(current.ast36),
    heightInches: finiteOrNull(current.heightInches),
    positionCode: finiteOrNull(current.positionCode),
    experience: Number.isFinite(current.experience) ? current.experience : null,
  };
}

export function loadCompFutures(
  focal: PlayerSeason | null | undefined,
  career: PlayerSeason[],
  espnId: string | null | undefined,
  metricId: CompMetricId
): CompFutures | null {
  if (!focal) return null;
  const pool = getBundledCompPool();
  const ids = [espnId, focal.playerId].map((id) => String(id ?? "").trim()).filter(Boolean);
  const pooled =
    pool.find((row) => ids.includes(row.playerId) && row.season === focal.season) ??
    pool.find((row) => ids.includes(row.playerId));
  const poolId = pooled?.playerId || ids[0];
  if (!poolId) return null;
  const age = focal.age ?? pooled?.age;
  const value = seasonMetricValue(focal, pooled, metricId);
  if (age == null || !Number.isFinite(age) || value == null) return null;
  const playerRows = pool
    .filter((row) => row.playerId === poolId)
    .sort((a, b) => a.season.localeCompare(b.season));
  const fromPool = playerRows.flatMap((row) => {
    const v = poolMetricValue(row, metricId);
    return v == null ? [] : [{ age: row.age, value: v }];
  });
  const fromCareer = career.flatMap((row) => {
    const peer = playerRows.find((item) => item.season === row.season);
    const v = seasonMetricValue(row, peer, metricId);
    if (row.age == null || v == null) return [];
    return [{ age: Math.round(row.age), value: v }];
  });
  const careerPoints = fromPool.length >= 2 ? fromPool : fromCareer;
  return buildCompFutures({
    metricId,
    focalPlayerId: poolId,
    focalName: focal.playerName,
    focalSeason: focal.season,
    focalAge: age,
    focalValue: value,
    focalTs: focal.trueShootingPct || pooled?.trueShootingPct || 0,
    focalUsg: focal.usagePct || pooled?.usagePct || 0,
    focalAstPct: focal.assistPct || pooled?.assistPct || 0,
    focalRebPct: focal.reboundPct || pooled?.reboundPct || 0,
    profile: profileFromPool(playerRows, focal.season, metricId),
    career: careerPoints,
    pool,
  });
}

export function loadCompFuturesBundle(
  focal: PlayerSeason | null | undefined,
  career: PlayerSeason[],
  espnId?: string | null
): CompFuturesBundle | null {
  const items = COMP_METRICS.flatMap((metric) => {
    const data = loadCompFutures(focal, career, espnId, metric.id);
    return data ? [data] : [];
  });
  if (!items.length) return null;
  const defaultId =
    COMP_METRICS.find((metric) => items.some((item) => item.metricId === metric.id))?.id ??
    items[0]!.metricId;
  return { defaultId, items };
}

export function formatCompValue(value: number, digits = 1): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumber(value, digits)}`;
}

export function formatSimilarity(similarity: number): string {
  return similarity.toFixed(1);
}
