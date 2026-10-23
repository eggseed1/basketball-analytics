/**
 * Bake the numbers behind the DRBL guide at /learn/drbl.
 *
 * Reads the published season artifacts, the latest outcome test and the
 * contract basis study, and writes src/data/runtime/drbl-guide-snapshot.json. The season artifacts are
 * too large to bundle into the page, so the guide reads only this summary.
 *
 * Run: npx tsx scripts/build-drbl-guide.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { listDrblSeasons } from "../src/data/drbl/season-registry";

const root = process.cwd();
const REGULAR = 2000;
const SCATTER_MIN = 500;
const PAIR_MIN = 500;
/** A season in progress would thin out every chart, so the guide uses finished ones. */
const COMPLETE_GAMES = 1000;

type ArtifactPlayer = {
  playerId: string;
  playerName: string;
  teamId: string;
  possessions: number;
  drbl100: number | null;
  drblPbp100?: number | null;
  drblO?: number | null;
  drblD?: number | null;
  r1WinEquivalents?: number | null;
};
type Artifact = { season: string; gameCount: number; gamesProcessed: number; players: ArtifactPlayer[] };

type OutcomeResult = { name: string; rmse: number; r2: number };
type OutcomeReport = { label: string; games: number; results: OutcomeResult[] };

const finite = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);
const round = (v: number, digits = 2) => Number(v.toFixed(digits));

function loadSeason(season: string): Artifact | null {
  const file = path.join(root, "src/data/drbl/precomputed", `${season}.json`);
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Artifact) : null;
}

function corr(xs: number[], ys: number[]): number {
  const n = xs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxy / Math.sqrt(sxx * syy);
}

const seasons = [...listDrblSeasons()].sort();
const loaded = seasons.map(loadSeason).filter((a): a is Artifact => a != null);
const artifacts = loaded.filter((a) => a.gamesProcessed >= COMPLETE_GAMES);
const latest = artifacts.at(-1);
if (!latest) throw new Error("no complete DRBL season artifacts");

const coverage = loaded.map((a) => ({
  season: a.season,
  games: a.gamesProcessed,
  players: a.players.filter((p) => p.possessions > 0 && finite(p.drbl100)).length,
}));

const regulars = latest.players.filter((p) => p.possessions >= REGULAR && finite(p.drbl100));
const BIN = 0.5;
const lo = Math.floor(Math.min(...regulars.map((p) => p.drbl100!)) / BIN) * BIN;
const hi = Math.ceil(Math.max(...regulars.map((p) => p.drbl100!)) / BIN) * BIN;
const bins = Array.from({ length: Math.round((hi - lo) / BIN) }, (_, i) => {
  const from = round(lo + i * BIN, 1);
  const to = round(from + BIN, 1);
  return { from, to, players: regulars.filter((p) => p.drbl100! >= from && p.drbl100! < to).length };
});
const allRated = latest.players.filter((p) => p.possessions > 0 && finite(p.drbl100));
const weight = allRated.reduce((s, p) => s + p.possessions, 0);
const weightedMean = allRated.reduce((s, p) => s + p.drbl100! * p.possessions, 0) / weight;
const weightedSd = Math.sqrt(allRated.reduce((s, p) => s + (p.drbl100! - weightedMean) ** 2 * p.possessions, 0) / weight);
const distribution = {
  season: latest.season,
  minPossessions: REGULAR,
  players: regulars.length,
  belowZero: regulars.filter((p) => p.drbl100! < 0).length,
  weightedMean: round(weightedMean, 3),
  weightedSd: round(weightedSd),
  bins,
};

const row = (p: ArtifactPlayer) => ({
  id: p.playerId,
  name: p.playerName,
  teamId: p.teamId,
  possessions: Math.round(p.possessions),
  drbl100: round(p.drbl100!),
  pbp100: finite(p.drblPbp100) ? round(p.drblPbp100) : null,
  offense: finite(p.drblO) ? round(p.drblO) : null,
  defense: finite(p.drblD) ? round(p.drblD) : null,
  war1: finite(p.r1WinEquivalents) ? round(p.r1WinEquivalents) : null,
});
const starters = latest.players.filter((p) => p.possessions >= 3000 && finite(p.drbl100) && finite(p.drblPbp100));
const leaders = [...starters].sort((a, b) => b.drbl100! - a.drbl100!).slice(0, 10).map(row);
const byLift = [...starters].sort((a, b) => b.drbl100! - b.drblPbp100! - (a.drbl100! - a.drblPbp100!));
const movers = { up: byLift.slice(0, 4).map(row), down: byLift.slice(-4).reverse().map(row) };

const scatter = {
  season: latest.season,
  minPossessions: SCATTER_MIN,
  points: latest.players
    .filter((p) => p.possessions >= SCATTER_MIN && finite(p.drbl100) && finite(p.r1WinEquivalents))
    .map((p) => [p.playerId, p.playerName, p.teamId, Math.round(p.possessions), round(p.drbl100!), round(p.r1WinEquivalents!)] as const),
};

const BUCKETS = [
  { label: "500-1,500", min: 500, max: 1500 },
  { label: "1,500-3,000", min: 1500, max: 3000 },
  { label: "3,000-6,000", min: 3000, max: 6000 },
  { label: "6,000 and up", min: 6000, max: Infinity },
];
type Pair = { poss: number; pbp: number; blend: number; nextPbp: number; nextBlend: number };
const pairs: Pair[] = [];
for (let i = 0; i + 1 < artifacts.length; i++) {
  const next = new Map(artifacts[i + 1].players.map((p) => [p.playerId, p]));
  for (const p of artifacts[i].players) {
    const q = next.get(p.playerId);
    if (!q || p.possessions < PAIR_MIN || q.possessions < PAIR_MIN) continue;
    if (![p.drbl100, p.drblPbp100, q.drbl100, q.drblPbp100].every(finite)) continue;
    pairs.push({ poss: p.possessions, pbp: p.drblPbp100!, blend: p.drbl100!, nextPbp: q.drblPbp100!, nextBlend: q.drbl100! });
  }
}
const carryover = BUCKETS.map((b) => {
  const inBucket = pairs.filter((p) => p.poss >= b.min && p.poss < b.max);
  return {
    label: b.label,
    pairs: inBucket.length,
    pbpToNextPbp: round(corr(inBucket.map((p) => p.pbp), inBucket.map((p) => p.nextPbp)), 3),
    blendToNextPbp: round(corr(inBucket.map((p) => p.blend), inBucket.map((p) => p.nextPbp)), 3),
    blendToNextBlend: round(corr(inBucket.map((p) => p.blend), inBucket.map((p) => p.nextBlend)), 3),
  };
});

const outcomeFile = path.join(root, "reports/drbl-outcome-test/latest.json");
const outcome = JSON.parse(readFileSync(outcomeFile, "utf8")) as { generatedAt: string; reports: OutcomeReport[] };
const pick = (r: OutcomeReport, prefix: string) => r.results.find((x) => x.name.startsWith(prefix));
const tests = outcome.reports.flatMap((r) => {
  const home = pick(r, "Home court only");
  const pbp = pick(r, "Play-by-play DRBL/100");
  const blend = pick(r, "DRBL/100, box blend");
  if (!home || !pbp || !blend) return [];
  const ahead = /^Shipped (\d{4}-\d{2}) ratings .* every (\d{4}-\d{2}) game/.exec(r.label);
  const within = /^(\d{4}-\d{2}): first 60%/.exec(r.label);
  if (!ahead && !within) return [];
  return [
    {
      kind: ahead ? ("season-ahead" as const) : ("within-season" as const),
      label: ahead ? `${ahead[1]} → ${ahead[2]}` : `${within![1]}`,
      games: r.games,
      homeRmse: round(home.rmse),
      pbpRmse: round(pbp.rmse),
      blendRmse: round(blend.rmse),
      pbpR2: round(pbp.r2, 3),
      blendR2: round(blend.r2, 3),
    },
  ];
});

type BasisResult = { name: string; r2: number; vsWar1?: { verdict: string } | null };
type BasisStudy = {
  generatedAt: string;
  scoreboard: Array<{ season: string; games: number; results: BasisResult[] }>;
  pooled: BasisResult[];
  team: Array<{ name: string; n: number; r: number }> | null;
};
const BASIS_ROWS = [
  { key: "war1", name: "WAR1 only" },
  { key: "mix", name: "Mix 50% DRBL" },
  { key: "drbl", name: "DRBL/100 only, [3,2,1] K15000 (shipped)" },
] as const;
const basisFile = path.join(root, "reports/contract-basis-study/latest.json");
const basisStudy = existsSync(basisFile) ? (JSON.parse(readFileSync(basisFile, "utf8")) as BasisStudy) : null;
const contractBasis =
  basisStudy && basisStudy.scoreboard.length
    ? {
        generatedAt: basisStudy.generatedAt,
        seasons: basisStudy.scoreboard.map((s) => s.season),
        games: basisStudy.scoreboard.reduce((s, x) => s + x.games, 0),
        teamSeasons: basisStudy.team?.[0]?.n ?? null,
        drblBetterSeasons: basisStudy.scoreboard.filter(
          (s) => s.results.find((r) => r.name === BASIS_ROWS[2].name)?.vsWar1?.verdict === "better"
        ).length,
        rows: BASIS_ROWS.map((b) => ({
          key: b.key,
          r2: round(basisStudy.pooled.find((r) => r.name === b.name)?.r2 ?? NaN, 3),
          teamR: basisStudy.team ? round(basisStudy.team.find((r) => r.name === b.name)?.r ?? NaN, 3) : null,
        })),
      }
    : null;

const out = {
  version: 1,
  generatedAt: new Date().toISOString(),
  latestSeason: latest.season,
  coverage,
  distribution,
  leaders,
  movers,
  scatter,
  carryover: { minPossessions: PAIR_MIN, seasons: `${artifacts[0].season} to ${latest.season}`, buckets: carryover },
  outcome: { generatedAt: outcome.generatedAt, tests },
  contractBasis,
};
{
  const body = JSON.stringify(out);
  const srcOut = path.join(root, "src/data/runtime/drbl-guide-snapshot.json");
  const publicOut = path.join(root, "public/runtime/drbl-guide-snapshot.json");
  writeFileSync(srcOut, body);
  mkdirSync(path.dirname(publicOut), { recursive: true });
  writeFileSync(publicOut, body);
}
console.log(
  `drbl-guide: season=${latest.season} regulars=${regulars.length} sd=${distribution.weightedSd} pairs=${pairs.length} tests=${tests.length}`
);
console.table(carryover);
console.table(tests);
