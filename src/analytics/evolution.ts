import type { AnalyticalFinding, StatContext } from "@/analytics/types";
import { buildStatContext } from "@/analytics/context";
import type { PlayerSeason } from "@/data/types";
import { formatNumber, formatPct } from "@/lib/format";

export type EvolutionChange = {
  id: string;
  label: string;
  fromDisplay: string;
  toDisplay: string;
  /** Signed display for the delta (e.g. "+4.2%", "-1.1"). */
  deltaDisplay: string;
  /** Signed raw delta in native units (fractions for rates). */
  delta: number;
  /** Absolute importance score used for ranking. */
  magnitude: number;
  direction: "up" | "down" | "flat";
  context: StatContext;
};

export type PlayerEvolutionResult = {
  currentSeason: string;
  priorSeason: string;
  currentGames: number;
  priorGames: number;
  changes: EvolutionChange[];
  /** Top meaningful changes (small set). */
  topChanges: EvolutionChange[];
  finding: AnalyticalFinding | null;
};

type MetricDef = {
  id: string;
  label: string;
  pick: (row: PlayerSeason) => number | null;
  format: (v: number) => string;
  /** Multiply absolute delta for ranking importance. */
  weight: number;
  /** Format delta for display. */
  formatDelta: (d: number) => string;
  invert?: boolean;
  unit?: StatContext["unit"];
};

function perGame(row: PlayerSeason, key: keyof PlayerSeason): number {
  const raw = row[key];
  const total = typeof raw === "number" ? raw : 0;
  return total / Math.max(1, row.gamesPlayed);
}

function pctDelta(d: number): string {
  const pts = d * 100;
  const sign = pts >= 0 ? "+" : "";
  return `${sign}${pts.toFixed(1)} pts`;
}

function numDelta(d: number, digits = 1): string {
  const sign = d >= 0 ? "+" : "";
  return `${sign}${d.toFixed(digits)}`;
}

const METRICS: MetricDef[] = [
  {
    id: "darko",
    label: "DARKO DPM",
    pick: (r) => (r.darkoDpm != null ? r.darkoDpm : null),
    format: (v) => formatNumber(v, 2),
    weight: 3.5,
    formatDelta: (d) => numDelta(d, 2),
    unit: "per100",
  },
  {
    id: "darko-off",
    label: "DARKO offense",
    pick: (r) => (r.darkoOff != null ? r.darkoOff : null),
    format: (v) => formatNumber(v, 2),
    weight: 2.8,
    formatDelta: (d) => numDelta(d, 2),
    unit: "per100",
  },
  {
    id: "darko-def",
    label: "DARKO defense",
    pick: (r) => (r.darkoDef != null ? r.darkoDef : null),
    format: (v) => formatNumber(v, 2),
    weight: 2.8,
    formatDelta: (d) => numDelta(d, 2),
    unit: "per100",
  },
  {
    id: "usg",
    label: "Usage",
    pick: (r) => (r.usagePct > 0 ? r.usagePct : null),
    format: (v) => formatPct(v),
    weight: 2.4,
    formatDelta: pctDelta,
    unit: "pct",
  },
  {
    id: "ts",
    label: "True shooting",
    pick: (r) => (r.trueShootingPct > 0 ? r.trueShootingPct : null),
    format: (v) => formatPct(v),
    weight: 2.6,
    formatDelta: pctDelta,
    unit: "pct",
  },
  {
    id: "efg",
    label: "Effective FG%",
    pick: (r) => (r.effectiveFieldGoalPct > 0 ? r.effectiveFieldGoalPct : null),
    format: (v) => formatPct(v),
    weight: 2.2,
    formatDelta: pctDelta,
    unit: "pct",
  },
  {
    id: "fg3",
    label: "3P%",
    pick: (r) => (r.threePointPct > 0 ? r.threePointPct : null),
    format: (v) => formatPct(v),
    weight: 1.8,
    formatDelta: pctDelta,
    unit: "pct",
  },
  {
    id: "pts",
    label: "Points / game",
    pick: (r) => perGame(r, "points"),
    format: (v) => formatNumber(v, 1),
    weight: 1.6,
    formatDelta: (d) => numDelta(d, 1),
  },
  {
    id: "ast",
    label: "Assists / game",
    pick: (r) => perGame(r, "assists"),
    format: (v) => formatNumber(v, 1),
    weight: 1.5,
    formatDelta: (d) => numDelta(d, 1),
  },
  {
    id: "reb",
    label: "Rebounds / game",
    pick: (r) => perGame(r, "rebounds"),
    format: (v) => formatNumber(v, 1),
    weight: 1.3,
    formatDelta: (d) => numDelta(d, 1),
  },
  {
    id: "min",
    label: "Minutes / game",
    pick: (r) => perGame(r, "minutes"),
    format: (v) => formatNumber(v, 1),
    weight: 1.4,
    formatDelta: (d) => numDelta(d, 1),
  },
  {
    id: "ortg",
    label: "Offensive rating",
    pick: (r) => (r.offensiveRating > 0 ? r.offensiveRating : null),
    format: (v) => formatNumber(v, 1),
    weight: 1.7,
    formatDelta: (d) => numDelta(d, 1),
    unit: "per100",
  },
  {
    id: "drtg",
    label: "Defensive rating",
    pick: (r) => (r.defensiveRating > 0 ? r.defensiveRating : null),
    format: (v) => formatNumber(v, 1),
    weight: 1.7,
    formatDelta: (d) => numDelta(d, 1),
    invert: true,
    unit: "per100",
  },
  {
    id: "net",
    label: "Net rating",
    pick: (r) => (r.netRating !== 0 ? r.netRating : null),
    format: (v) => formatNumber(v, 1),
    weight: 2.0,
    formatDelta: (d) => numDelta(d, 1),
    unit: "per100",
  },
];

const MIN_GAMES = 10;
/** Ignore tiny noise. */
const MIN_MAGNITUDE = 0.35;

function pickPriorSeason(
  career: PlayerSeason[],
  currentSeason: string
): PlayerSeason | null {
  const bySeason = new Map<string, PlayerSeason>();
  for (const row of career) {
    const existing = bySeason.get(row.season);
    if (!existing || row.gamesPlayed > existing.gamesPlayed) {
      bySeason.set(row.season, row);
    }
  }
  const seasons = [...bySeason.keys()].sort((a, b) => b.localeCompare(a));
  const idx = seasons.indexOf(currentSeason);
  const priorKey =
    idx >= 0 ? seasons[idx + 1] : seasons.find((s) => s < currentSeason);
  if (!priorKey) return null;
  return bySeason.get(priorKey) ?? null;
}

function buildFinding(
  top: EvolutionChange[],
  currentSeason: string,
  priorSeason: string,
  playerId: string
): AnalyticalFinding | null {
  if (!top.length) return null;
  const lead = top[0]!;
  const second = top[1];
  const bodyParts = [
    `Largest measurable change vs ${priorSeason}: ${lead.label} (${lead.deltaDisplay}).`,
  ];
  if (second) {
    bodyParts.push(
      `Also notable: ${second.label} (${second.deltaDisplay}).`
    );
  }
  bodyParts.push(
    "These are measured season-to-season deltas, not causal explanations."
  );
  return {
    id: `yoy-${playerId}-${currentSeason}`,
    eyebrow: "What changed",
    title: lead.label,
    body: bodyParts.join(" "),
    level: 3,
    playerIds: [playerId],
  };
}

/**
 * Deterministic current-vs-prior season evolution from career rows.
 * Only uses metrics present on PlayerSeason.
 */
export function computePlayerEvolution(options: {
  playerId: string;
  current: PlayerSeason;
  career: PlayerSeason[];
}): PlayerEvolutionResult | null {
  const { playerId, current, career } = options;
  const prior = pickPriorSeason(career, current.season);
  if (!prior) return null;
  if (current.gamesPlayed < MIN_GAMES || prior.gamesPlayed < MIN_GAMES) {
    return {
      currentSeason: current.season,
      priorSeason: prior.season,
      currentGames: current.gamesPlayed,
      priorGames: prior.gamesPlayed,
      changes: [],
      topChanges: [],
      finding: {
        id: `yoy-sample-${playerId}`,
        eyebrow: "What changed",
        title: "Not enough games yet",
        body: `Need at least ${MIN_GAMES} games in both ${prior.season} (${prior.gamesPlayed} GP) and ${current.season} (${current.gamesPlayed} GP) before ranking season-to-season changes.`,
        level: 3,
        playerIds: [playerId],
      },
    };
  }

  const changes: EvolutionChange[] = [];
  for (const m of METRICS) {
    const from = m.pick(prior);
    const to = m.pick(current);
    if (from == null || to == null) continue;
    if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
    const rawDelta = to - from;
    const signed = m.invert ? -rawDelta : rawDelta;
    const magnitude = Math.abs(rawDelta) * m.weight;
    if (magnitude < MIN_MAGNITUDE) continue;
    const direction =
      Math.abs(rawDelta) < 1e-9 ? "flat" : signed > 0 ? "up" : "down";
    changes.push({
      id: m.id,
      label: m.label,
      fromDisplay: m.format(from),
      toDisplay: m.format(to),
      deltaDisplay: m.formatDelta(rawDelta),
      delta: rawDelta,
      magnitude,
      direction,
      context: buildStatContext({
        display: m.format(to),
        value: to,
        unit: m.unit,
        vsPrior: rawDelta,
        timeframe: `${prior.season} → ${current.season}`,
        sourceLabel: m.label,
        sampleSize: current.gamesPlayed,
      }),
    });
  }

  changes.sort((a, b) => b.magnitude - a.magnitude);
  const topChanges = changes.slice(0, 5);

  return {
    currentSeason: current.season,
    priorSeason: prior.season,
    currentGames: current.gamesPlayed,
    priorGames: prior.gamesPlayed,
    changes,
    topChanges,
    finding: buildFinding(topChanges, current.season, prior.season, playerId),
  };
}
