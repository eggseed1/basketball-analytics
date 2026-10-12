/**
 * Scoreboard outcome test for DRBL/100 and candidate replacements.
 *
 *   npm run drbl:outcome-test
 *
 * Needs data/drbl/normalized/{season}/{gameId}/ on disk for at least one
 * season (two consecutive seasons for the cross-season test). Manual only;
 * not part of CI. Writes reports/drbl-outcome-test/latest.{json,md}.
 *
 * Tests:
 * - Within season: ratings rebuilt with production code from the first 60%
 *   of games (DRBL_OUTCOME_EARLY_FRAC overrides; reports then go to
 *   early-{pct}/), scored on the rest.
 * - Cross season: shipped artifact ratings for season N scored on every
 *   game of season N+1.
 * Box ratings are rebuilt from the rating window; the blend's forward weights
 * and calibration are refit per test from blocks whose target possessions
 * precede the test games. A future replacement for published DRBL/100 should
 * beat it in every cross-season test and never trail it within season.
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { loadNormalizedGame } from "../drbl/evaluation/m16c-dataset";
import {
  PUBLISHED,
  anchoredInputOf,
  exposureOf,
  gameFeature,
  rawPlusMinus,
  rmse,
  cvPredict,
  scoreOutcomes,
  teamFeature,
  type OutcomeGame,
  type OutcomeReport,
  type Ratings,
} from "../drbl/evaluation/outcome-test";
import {
  ANCHORED_LINEUP_CONFIG,
  ANCHORED_LINEUP_VERSION,
  fitAnchoredLineup,
} from "../drbl/models/anchored-lineup";
import { requireEpvModel } from "../drbl/models/expected-points";
import {
  attributeGamePlayerValue,
  finalizePlayerSeasonRows,
} from "../drbl/models/player-value";
import {
  accumulateReplacementSignals,
  buildReplacementPool,
  finalizeRoleAccum,
} from "../drbl/models/replacement";
import { buildLineupRows, fitLineupModel, type LineupPossessionRow } from "../drbl/models/lineup-model";
import {
  accumulateBehaviorSignals,
  finalizeBehaviorRows,
  fitBehaviorModel,
} from "../drbl/models/behavior";
import {
  addBoxScoreToTotals,
  boxPriorFeatures,
  boxPriorFitFromWeights,
  fitBoxPrior,
  shrinkTowardBoxPrior,
  type BoxPriorTotals,
} from "../drbl/models/box-prior";
import { buildBoxPriorV2, calibrationAt, type BoxForwardCalibrationPoint } from "../drbl/models/box-forward";
import { BOX_BLEND_MODEL_VERSION } from "../drbl/models/published-rating";
import {
  blocksBefore,
  blocksThrough,
  fitForward,
  forwardTrainingData,
  type ForwardFit,
} from "../drbl/evaluation/box-forward-data";
import type { DrblBoxPlayer } from "../drbl/types";

const ROOT = process.cwd();
const EARLY_FRAC = Number(process.env.DRBL_OUTCOME_EARLY_FRAC ?? 0.6);
const OUT_DIR = path.join(
  ROOT,
  EARLY_FRAC === 0.6 ? "reports/drbl-outcome-test" : `reports/drbl-outcome-test/early-${Math.round(EARLY_FRAC * 100)}`
);
const INNER_FRAC = 2 / 3;
const MIN_GAMES = 500;
const RIDGE_LAMBDAS = [400, 800, 1600, 3200, 6400];
const ANCHORED = `Anchored lineup (${ANCHORED_LINEUP_VERSION})`;
const BOX_V1 = "Play-by-play rate shrunk toward same-season box rating (blend half)";
const BOX = `DRBL/100, box blend (${BOX_BLEND_MODEL_VERSION})`;

const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

const idPool = new Map<string, string>();
const canon = (id: string): string => {
  const hit = idPool.get(id);
  if (hit) return hit;
  idPool.set(id, id);
  return id;
};

async function localSeasons(): Promise<string[]> {
  const dir = path.join(ROOT, "data/drbl/normalized");
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (!e.isDirectory() || !/^\d{4}-\d{2}$/.test(e.name)) continue;
    const games = (await readdir(path.join(dir, e.name))).filter((n) => /^\d{10}$/.test(n));
    if (games.length >= MIN_GAMES) out.push(e.name);
  }
  return out.sort();
}

const boxByGame = new Map<string, DrblBoxPlayer[]>();

async function loadSeason(season: string): Promise<OutcomeGame[]> {
  const dir = path.join(ROOT, "data/drbl/normalized", season);
  const ids = (await readdir(dir)).filter((n) => /^\d{10}$/.test(n)).sort();
  const games: OutcomeGame[] = [];
  for (const id of ids) {
    const g = await loadNormalizedGame(season, id);
    if (!g) continue;
    const poss = [];
    for (const p of g.possessions) {
      const off = p.offensePlayerIds.filter(Boolean).map(canon);
      const def = p.defensePlayerIds.filter(Boolean).map(canon);
      if (!off.length || !def.length) continue;
      poss.push({ offenseIsHome: p.offenseTeamId === g.box.homeTeamId, off, def, points: p.points });
    }
    boxByGame.set(
      g.box.gameId,
      g.box.players.map((p) => ({ ...p, playerId: canon(p.playerId) }))
    );
    games.push({
      gameId: g.box.gameId,
      date: g.box.gameDate || "",
      homeTeamId: g.box.homeTeamId,
      awayTeamId: g.box.awayTeamId,
      margin: Number(g.box.homeScore) - Number(g.box.awayScore),
      poss,
    });
  }
  return games.sort((a, b) => a.date.localeCompare(b.date) || a.gameId.localeCompare(b.gameId));
}

/** Production DRBL components rebuilt only from the given games. */
async function drblComponents(season: string, window: readonly OutcomeGame[]) {
  const roleAccum = new Map();
  const behaviorAccum = new Map();
  const lnRows: LineupPossessionRow[] = [];
  let cutoff = "";
  for (const w of window) {
    const g = await loadNormalizedGame(season, w.gameId);
    if (!g) continue;
    accumulateReplacementSignals(g.box, g.events, g.possessions, roleAccum);
    accumulateBehaviorSignals(g.box, g.events, g.possessions, behaviorAccum);
    lnRows.push(...buildLineupRows(g.box, g.events, g.possessions));
    if (g.box.gameDate > cutoff) cutoff = g.box.gameDate;
  }
  const candidates = finalizeRoleAccum(roleAccum);
  const rolesByPlayer = new Map(candidates.map((c) => [c.playerId, c.role]));
  const replacementPool = buildReplacementPool(candidates, {
    cutoffDate: cutoff || "9999-12-31",
    level: "R1",
  });
  const acc = new Map();
  for (const w of window) {
    const g = await loadNormalizedGame(season, w.gameId);
    if (!g) continue;
    attributeGamePlayerValue(g.box, g.events, g.possessions, acc, { replacementPool, rolesByPlayer });
  }
  const ln = fitLineupModel(lnRows, { lambda: 800, holdoutFrac: 0.2 });
  const bRows = finalizeBehaviorRows(behaviorAccum, { minPossessions: 50 });
  const b =
    bRows.length >= 30
      ? fitBehaviorModel(bRows, { lambda: 40, holdoutFrac: 0.2, games: window.length })
      : null;
  const rows = finalizePlayerSeasonRows(acc, {
    minPossessions: 1,
    lineupRatingsPer100: ln.ratingsPer100,
    behaviorRatingsPer100: b?.ratingsPer100 ?? null,
  });
  const pick = (f: (r: (typeof rows)[number]) => number) =>
    new Map(rows.map((r) => [canon(r.playerId), f(r)]));
  return {
    published: pick((r) => r.drbl100),
    pRaw: pick((r) => r.rawAbilityRate),
    n: pick((r) => r.possessions),
    ln: pick((r) => r.drblLn ?? 0),
    b: pick((r) => r.drblB ?? 0),
  };
}

/**
 * Box ratings built from the rating window only. The same-season box weights
 * fall back to `fallbackBoxWeights` (fit on an earlier season) when the window
 * is too short; the blend also needs forward weights and a calibration fit
 * without the test games.
 */
function boxRatings(
  games: readonly OutcomeGame[],
  pbp: Ratings,
  raw: Ratings,
  n: Ratings,
  forward: ForwardFit | null,
  fallbackBoxWeights: number[] | null
): { v1: Ratings | null; blend: Ratings | null; fitSource: "season" | "frozen" | null } {
  const totals: BoxPriorTotals = new Map();
  for (const g of games) addBoxScoreToTotals(totals, boxByGame.get(g.gameId) ?? []);
  const input = anchoredInputOf(games);
  const boxFeatures = boxPriorFeatures(totals, input.appearances);
  const seasonFit = fitBoxPrior(input.rows, boxFeatures);
  const fit = seasonFit ?? (fallbackBoxWeights ? boxPriorFitFromWeights(boxFeatures, fallbackBoxWeights) : null);
  if (!fit) return { v1: null, blend: null, fitSource: null };
  const blend = forward
    ? buildBoxPriorV2({
        fit,
        boxFeatures,
        forwardWeightsPer100: forward.weightsPer100,
        calibration: calibrationAt(forward.calibration, games.length),
        playerShrinkK: forward.playerShrinkK,
        appearances: input.appearances,
        rows: input.rows,
        drblPbp100: pbp,
        rawAbilityRate: raw,
        possessions: n,
      }).ratings
    : null;
  return { v1: seasonFit ? shrinkTowardBoxPrior(raw, n, seasonFit.ratingsPer100) : null, blend, fitSource: seasonFit ? "season" : "frozen" };
}

function scoreboardRidge(games: readonly OutcomeGame[], lambda: number): Ratings {
  return fitAnchoredLineup(anchoredInputOf(games), new Map(), {
    ...ANCHORED_LINEUP_CONFIG,
    priorWeight: 0,
    lambda,
  }).ratingsPer100;
}

function anchored(games: readonly OutcomeGame[], published: Ratings): Ratings {
  return fitAnchoredLineup(anchoredInputOf(games), published).ratingsPer100;
}

/** Ridge λ picked on an inner split of the rating window only. */
function selectRidgeLambda(window: readonly OutcomeGame[]): { lambda: number; trace: Record<string, number> } {
  const innerEnd = Math.floor(window.length * INNER_FRAC);
  const train = window.slice(0, innerEnd);
  const test = window.slice(innerEnd);
  const exp = exposureOf(train);
  const y = test.map((g) => g.margin);
  const trace: Record<string, number> = {};
  let best = { lambda: RIDGE_LAMBDAS[0]!, v: Infinity };
  for (const lambda of RIDGE_LAMBDAS) {
    const v = rmse(cvPredict([gameFeature(test, scoreboardRidge(train, lambda), exp)], y), y);
    trace[`lambda_${lambda}`] = Number(v.toFixed(4));
    if (v < best.v) best = { lambda, v };
  }
  return { lambda: best.lambda, trace };
}

async function withinSeason(
  season: string,
  games: OutcomeGame[],
  forward: ForwardFit | null,
  fallbackBoxWeights: number[] | null
) {
  const end = Math.floor(games.length * EARLY_FRAC);
  const train = games.slice(0, end);
  const test = games.slice(end);
  log(season, `within: rating window ${train.length} games, test ${test.length}`);
  const { lambda, trace } = selectRidgeLambda(train);
  const comps = await drblComponents(season, train);
  const exp = exposureOf(train);
  const f = (r: Ratings) => gameFeature(test, r, exp);
  const box = boxRatings(train, comps.published, comps.pRaw, comps.n, forward, fallbackBoxWeights);
  const features: Record<string, number[]> = {
    [PUBLISHED]: f(comps.published),
    "DRBL-P raw rate (unshrunk)": f(comps.pRaw),
    "DRBL-LN (stored lineup)": f(comps.ln),
    "DRBL-B (box)": f(comps.b),
    "Raw on-court +/- per 100": f(rawPlusMinus(train)),
    [`Scoreboard lineup ridge (λ=${lambda})`]: f(scoreboardRidge(train, lambda)),
    [ANCHORED]: f(anchored(train, comps.published)),
  };
  if (box.v1) features[BOX_V1] = f(box.v1);
  if (box.blend) features[box.fitSource === "frozen" ? `${BOX} with last season's box weights` : BOX] = f(box.blend);
  const pctOf = (f: number) => `${Math.round(f * 100)}%`;
  const report = scoreOutcomes(
    `${season}: first ${pctOf(EARLY_FRAC)} of games → last ${pctOf(1 - EARLY_FRAC)}`,
    test,
    features,
    teamFeature(train, test)
  );
  return { report, ridgeSelection: { lambda, trace }, boxFitSource: box.fitSource };
}

async function artifactRatings(season: string) {
  const raw = await readFile(path.join(ROOT, "src/data/drbl/precomputed", `${season}.json`), "utf8");
  const artifact = JSON.parse(raw) as { version?: string; players: Record<string, unknown>[] };
  const players = artifact.players;
  const pick = (k: string): Map<string, number> => {
    const m = new Map<string, number>();
    for (const p of players) {
      const v = p[k];
      if (typeof v === "number" && Number.isFinite(v)) m.set(canon(String(p.playerId)), v);
    }
    return m;
  };
  const pbp = pick("drblPbp100");
  return {
    version: artifact.version ?? "unknown version",
    pbp: pbp.size > 0 ? pbp : pick("drbl100"),
    pRaw: pick("rawAbilityRate"),
    n: pick("possessions"),
    ln: pick("drblLn"),
    b: pick("drblB"),
    anchored: pick("drblAnchored100"),
  };
}

async function darko(season: string): Promise<Map<string, number>> {
  const snap = JSON.parse(
    await readFile(path.join(ROOT, "src/data/runtime/impact-overlay-snapshot.json"), "utf8")
  ) as { darko?: Record<string, [string | number, string, number | null][]> };
  const m = new Map<string, number>();
  for (const row of snap.darko?.[season] ?? [])
    if (row[2] != null) m.set(canon(String(row[0])), Number(row[2]));
  return m;
}

async function crossSeason(
  from: string,
  fromGames: OutcomeGame[],
  to: string,
  toGames: OutcomeGame[],
  lambda: number,
  forward: ForwardFit | null
) {
  log(`cross: ${from} ratings → ${to} games`);
  const art = await artifactRatings(from);
  const exp = exposureOf(fromGames);
  const f = (r: Ratings) => gameFeature(toGames, r, exp);
  const box = boxRatings(fromGames, art.pbp, art.pRaw, art.n, forward, null);
  const features: Record<string, number[]> = {
    [PUBLISHED]: f(art.pbp),
    "DRBL-P raw rate (unshrunk)": f(art.pRaw),
    "DRBL-LN (stored lineup)": f(art.ln),
    "DRBL-B (box)": f(art.b),
    "Raw on-court +/- per 100": f(rawPlusMinus(fromGames)),
    [`Scoreboard lineup ridge (λ=${lambda})`]: f(scoreboardRidge(fromGames, lambda)),
    [ANCHORED]: f(art.anchored.size > 0 ? art.anchored : anchored(fromGames, art.pbp)),
  };
  if (box.v1) features[BOX_V1] = f(box.v1);
  if (box.blend) features[BOX] = f(box.blend);
  const d = await darko(from);
  if (d.size > 0) features[`DARKO ${from} (external)`] = f(d);
  return scoreOutcomes(
    `Shipped ${from} ratings (${art.version}) → every ${to} game`,
    toGames,
    features,
    teamFeature(fromGames, toGames)
  );
}

const pct = (v: number) => `${(100 * v).toFixed(1)}%`;
const signed = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(3)}`;

function markdown(reports: OutcomeReport[], generatedAt: string): string {
  const lines = [
    "# DRBL outcome test",
    "",
    `Generated ${generatedAt} by \`npm run drbl:outcome-test\`.`,
    "",
    `R² is the share of final-margin variance explained beyond home court, out of sample. Slope is the final margin regressed on the margin the rating implies (on-court rating differences summed over every possession, per 100); 1 means the rating is in real points per 100, below 1 means it is spread too wide. ΔRMSE is the rating's error minus the error of ${PUBLISHED} in points, with a 95% game-bootstrap interval. Negative means the rating predicts margins better.`,
    "",
    `Published DRBL/100 is ${BOX}. Its baseline here is the play-by-play-only rate it replaced in October 2026, which the artifacts keep as \`drblPbp100\`. A future replacement should beat published DRBL/100 in every cross-season test and never trail it within season. ${BOX_V1} is the same-season half of the blend, and ${ANCHORED} is stored as the shadow field \`drblAnchored100\`.`,
    "",
    "Cross-season rows use each season's shipped artifact; the section title names its pipeline version. Both box rows are rebuilt here from the rating window instead of read from the artifact. The blend's forward weights and calibration are refit for each test on earlier possessions only: through the rating season for cross-season tests, through the season before for within-season tests. The first local season has nothing earlier, so its within-season test has no blend row. When a within-season window is too short to fit its own box weights, the blend uses the previous season's, as the nightly compute does in opening week, and the row says so.",
  ];
  for (const r of reports) {
    lines.push("", `## ${r.label}`, "", `${r.games} games.`, "", "| Rating | R² | RMSE | Slope | ΔRMSE vs play-by-play DRBL/100 [95% CI] | Verdict |", "|---|---|---|---|---|---|");
    for (const s of r.results) {
      const d = s.vsPublished;
      lines.push(
        `| ${s.name} | ${pct(s.r2)} | ${s.rmse.toFixed(2)} | ${s.slope == null ? "—" : s.slope.toFixed(2)} | ${d ? `${signed(d.delta)} [${signed(d.lo)}, ${signed(d.hi)}]` : "—"} | ${d ? d.verdict : "baseline"} |`
      );
    }
    lines.push("", "Added on top of play-by-play DRBL/100 (two slopes):", "", "| Combination | R² | ΔRMSE [95% CI] | Verdict |", "|---|---|---|---|");
    for (const s of r.incremental) {
      const d = s.vsPublished!;
      lines.push(`| ${s.name} | ${pct(s.r2)} | ${signed(d.delta)} [${signed(d.lo)}, ${signed(d.hi)}] | ${d.verdict} |`);
    }
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const seasons = await localSeasons();
  if (seasons.length === 0) {
    throw new Error(`no season under data/drbl/normalized has ≥${MIN_GAMES} games`);
  }
  log("seasons with local possessions:", seasons.join(", "));
  await requireEpvModel();
  const forwardData = await forwardTrainingData(seasons, ROOT, (s) => log(s, "forward box blocks"));
  const forwardBlocks = forwardData.blocks;

  const reports: OutcomeReport[] = [];
  const selections: Record<string, unknown> = {};
  const boxForward: Record<
    string,
    {
      blocks: string[];
      playerShrinkK: number;
      sseByShrinkK: Record<string, number>;
      calibration: BoxForwardCalibrationPoint[];
      boxFit: string | null;
    } | null
  > = {};
  const describe = (fit: ForwardFit | null, boxFit: string | null) =>
    fit
      ? {
          blocks: fit.blocks,
          playerShrinkK: fit.playerShrinkK,
          sseByShrinkK: fit.sseByShrinkK,
          calibration: fit.calibration.map((p) => ({ games: p.games, calibration: Number(p.calibration.toFixed(4)) })),
          boxFit,
        }
      : null;
  let prev: { season: string; games: OutcomeGame[]; lambda: number } | null = null;
  for (const season of seasons) {
    const games = await loadSeason(season);
    log(season, "games", games.length);
    const within = fitForward(blocksBefore(forwardBlocks, season));
    const prevSeason = `${Number(season.slice(0, 4)) - 1}-${season.slice(2, 4)}`;
    const w = await withinSeason(season, games, within, forwardData.seasonBoxWeights.get(prevSeason) ?? null);
    reports.push(w.report);
    selections[season] = w.ridgeSelection;
    boxForward[w.report.label] = describe(within, w.boxFitSource);
    if (prev && Number(season.slice(0, 4)) === Number(prev.season.slice(0, 4)) + 1) {
      const cross = fitForward(blocksThrough(forwardBlocks, prev.season));
      const r = await crossSeason(prev.season, prev.games, season, games, prev.lambda, cross);
      reports.push(r);
      boxForward[r.label] = describe(cross, "season");
    }
    prev = { season, games, lambda: w.ridgeSelection.lambda };
  }

  const generatedAt = new Date().toISOString();
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(
    path.join(OUT_DIR, "latest.json"),
    `${JSON.stringify(
      {
        generatedAt,
        anchoredLineup: { version: ANCHORED_LINEUP_VERSION, config: ANCHORED_LINEUP_CONFIG },
        ridgeSelection: selections,
        boxForwardTrainingBlocks: boxForward,
        reports,
      },
      null,
      2
    )}\n`
  );
  await writeFile(path.join(OUT_DIR, "latest.md"), markdown(reports, generatedAt));
  log("wrote", path.relative(ROOT, OUT_DIR));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
