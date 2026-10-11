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
 *   of games, scored on the last 40%.
 * - Cross season: shipped artifact ratings for season N scored on every
 *   game of season N+1.
 * A candidate is eligible to replace published DRBL/100 only if its ΔRMSE
 * interval sits below 0 in every cross-season test and never above 0
 * within season.
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
import { warmEpvModel } from "../drbl/models/expected-points";
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
  BOX_PRIOR_VERSION,
  addBoxScoreToTotals,
  boxPriorFeatures,
  fitBoxPrior,
  shrinkTowardBoxPrior,
  type BoxPriorTotals,
} from "../drbl/models/box-prior";
import type { DrblBoxPlayer } from "../drbl/types";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "reports/drbl-outcome-test");
const EARLY_FRAC = 0.6;
const INNER_FRAC = 2 / 3;
const MIN_GAMES = 500;
const RIDGE_LAMBDAS = [400, 800, 1600, 3200, 6400];
const ANCHORED = `Anchored lineup (${ANCHORED_LINEUP_VERSION})`;
const BOX = `DRBL-P shrunk toward box rating (${BOX_PRIOR_VERSION})`;

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
    ln: pick((r) => r.drblLn),
    b: pick((r) => r.drblB),
  };
}

/** Box weights fit on the rating window only; empty when the window is too small to fit. */
function boxShrunk(games: readonly OutcomeGame[], raw: Ratings, n: Ratings): Ratings {
  const totals: BoxPriorTotals = new Map();
  for (const g of games) addBoxScoreToTotals(totals, boxByGame.get(g.gameId) ?? []);
  const input = anchoredInputOf(games);
  const fit = fitBoxPrior(input.rows, boxPriorFeatures(totals, input.appearances));
  return fit ? shrinkTowardBoxPrior(raw, n, fit.ratingsPer100) : new Map();
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

async function withinSeason(season: string, games: OutcomeGame[]) {
  const end = Math.floor(games.length * EARLY_FRAC);
  const train = games.slice(0, end);
  const test = games.slice(end);
  log(season, `within: rating window ${train.length} games, test ${test.length}`);
  const { lambda, trace } = selectRidgeLambda(train);
  const comps = await drblComponents(season, train);
  const exp = exposureOf(train);
  const f = (r: Ratings) => gameFeature(test, r, exp);
  const report = scoreOutcomes(
    `${season}: first 60% of games → last 40%`,
    test,
    {
      [PUBLISHED]: f(comps.published),
      "DRBL-P raw rate (unshrunk)": f(comps.pRaw),
      "DRBL-LN (stored lineup)": f(comps.ln),
      "DRBL-B (box)": f(comps.b),
      "Raw on-court +/- per 100": f(rawPlusMinus(train)),
      [`Scoreboard lineup ridge (λ=${lambda})`]: f(scoreboardRidge(train, lambda)),
      [ANCHORED]: f(anchored(train, comps.published)),
      [BOX]: f(boxShrunk(train, comps.pRaw, comps.n)),
    },
    teamFeature(train, test)
  );
  return { report, ridgeSelection: { lambda, trace } };
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
  return {
    version: artifact.version ?? "unknown version",
    published: pick("drbl100"),
    pRaw: pick("rawAbilityRate"),
    n: pick("possessions"),
    ln: pick("drblLn"),
    b: pick("drblB"),
    anchored: pick("drblAnchored100"),
    box: pick("drblBox100"),
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

async function crossSeason(from: string, fromGames: OutcomeGame[], to: string, toGames: OutcomeGame[], lambda: number) {
  log(`cross: ${from} ratings → ${to} games`);
  const art = await artifactRatings(from);
  const exp = exposureOf(fromGames);
  const f = (r: Ratings) => gameFeature(toGames, r, exp);
  const features: Record<string, number[]> = {
    [PUBLISHED]: f(art.published),
    "DRBL-P raw rate (unshrunk)": f(art.pRaw),
    "DRBL-LN (stored lineup)": f(art.ln),
    "DRBL-B (box)": f(art.b),
    "Raw on-court +/- per 100": f(rawPlusMinus(fromGames)),
    [`Scoreboard lineup ridge (λ=${lambda})`]: f(scoreboardRidge(fromGames, lambda)),
    [ANCHORED]: f(art.anchored.size > 0 ? art.anchored : anchored(fromGames, art.published)),
    [BOX]: f(art.box.size > 0 ? art.box : boxShrunk(fromGames, art.pRaw, art.n)),
  };
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
    "R² is the share of final-margin variance explained beyond home court, out of sample. ΔRMSE is the candidate's error minus published DRBL/100's error in points, with a 95% game-bootstrap interval. Negative means the candidate predicts margins better.",
    "",
    `Promotion rule: a candidate can replace published DRBL/100 only if its interval sits below 0 in every cross-season test and never above 0 within season. Passing makes it eligible; switching is still a product decision. ${ANCHORED} and ${BOX} are stored as the shadow fields \`drblAnchored100\` and \`drblBox100\`.`,
    "",
    "Cross-season rows use each season's shipped artifact as is; the section title names its pipeline version.",
  ];
  for (const r of reports) {
    lines.push("", `## ${r.label}`, "", `${r.games} games.`, "", "| Rating | R² | RMSE | ΔRMSE vs published [95% CI] | Verdict |", "|---|---|---|---|---|");
    for (const s of r.results) {
      const d = s.vsPublished;
      lines.push(
        `| ${s.name} | ${pct(s.r2)} | ${s.rmse.toFixed(2)} | ${d ? `${signed(d.delta)} [${signed(d.lo)}, ${signed(d.hi)}]` : "—"} | ${d ? d.verdict : "baseline"} |`
      );
    }
    lines.push("", "Added on top of published (two slopes):", "", "| Combination | R² | ΔRMSE [95% CI] | Verdict |", "|---|---|---|---|");
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
  await warmEpvModel();

  const reports: OutcomeReport[] = [];
  const selections: Record<string, unknown> = {};
  let prev: { season: string; games: OutcomeGame[]; lambda: number } | null = null;
  for (const season of seasons) {
    const games = await loadSeason(season);
    log(season, "games", games.length);
    const w = await withinSeason(season, games);
    reports.push(w.report);
    selections[season] = w.ridgeSelection;
    if (prev && Number(season.slice(0, 4)) === Number(prev.season.slice(0, 4)) + 1) {
      reports.push(await crossSeason(prev.season, prev.games, season, games, prev.lambda));
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
