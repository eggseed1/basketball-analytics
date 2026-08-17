/**
 * Remaster an existing season artifact under rankingFormulaVersion 2.0.0
 * without re-running possession attribution.
 *
 * Uses actual seasonalImpact (= totalValue) already stored, re-sorts the FULL
 * eligible population by the selected finalRankingScore, then truncates to top N.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  abilitySamplingSe,
  applyDisplayUncertaintyCap,
  combineStandardErrors,
  empiricalBayesRate,
  finalRankingScoreFor,
  seasonalImpactFromRawRate,
  stableSortPlayers,
  standardizedDisagreement,
  warFromImpact,
} from "../drbl/models/leaderboard";
import {
  defaultRankingConfig,
  RANKING_FORMULA_VERSION,
  type RankingMode,
} from "../drbl/models/ranking-config";
import {
  ABILITY_LINEAGE_VERSION,
  CANONICAL_ABILITY_INPUT,
  resolveFusedRateRaw,
  resolvePosteriorAbility,
} from "../drbl/models/ability-lineage";

type LegacyPlayer = {
  playerId: string;
  playerName: string;
  teamId: string;
  possessions: number;
  drbl100: number;
  drblP: number;
  drblLn: number;
  drblB: number;
  drblO?: number;
  drblD?: number;
  sdv100?: number;
  shotMaking100?: number;
  epvShootMean?: number;
  vContMean?: number;
  seasonalImpact: number;
  drblWar: number;
  drblL?: number;
  meanLeverage?: number;
  disagreement?: number;
  uncertainty?: number;
  intervalLo?: number;
  intervalHi?: number;
  [key: string]: unknown;
};

function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = xs.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function corr(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return NaN;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i]! - mx;
    const b = ys[i]! - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const den = Math.sqrt(dx * dy);
  return den > 0 ? num / den : NaN;
}

function esc(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows: Array<Record<string, unknown>>, cols: string[]): string {
  const lines = [cols.join(",")];
  for (const r of rows) {
    lines.push(cols.map((c) => esc(r[c])).join(","));
  }
  return lines.join("\n") + "\n";
}

async function main() {
  const season = process.argv[2] ?? "2024-25";
  const mode = (process.argv[3] as RankingMode | undefined) ?? "season_value";
  const ranking = defaultRankingConfig({ rankingMode: mode });

  const src = path.join(
    process.cwd(),
    "src/data/drbl/precomputed",
    `${season}.json`
  );
  const artifact = JSON.parse(await readFile(src, "utf8")) as {
    season?: string;
    version?: string;
    gamesProcessed?: number;
    players: LegacyPlayer[];
    [key: string]: unknown;
  };

  const legacy = artifact.players ?? [];
  const oldByDrbl = legacy
    .slice()
    .sort((a, b) => b.drbl100 - a.drbl100)
    .map((p, i) => ({ ...p, oldRank: i + 1 }));

  // Component scales for standardized disagreement.
  const pVals = legacy.map((p) => p.drblP);
  const lnVals = legacy.map((p) => p.drblLn);
  const bVals = legacy.map((p) => p.drblB);
  const mean = (xs: number[]) =>
    xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  const sd = (xs: number[]) => {
    if (xs.length < 2) return 1;
    const m = mean(xs);
    return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length) || 1;
  };
  const pMean = mean(pVals);
  const pSd = sd(pVals);
  const lnMean = mean(lnVals);
  const lnSd = sd(lnVals);
  const bMean = mean(bVals);
  const bSd = sd(bVals);

  type EvalRow = LegacyPlayer & {
    actualPossessions: number;
    rawAbilityRate: number;
    posteriorAbilityRate: number;
    fusedRateRaw: number;
    reliabilityWeight: number;
    priorMean: number;
    priorEquivalentPossessions: number;
    seasonWar: number;
    forecastPossessions: number;
    forecastImpact: number;
    forecastWar: number;
    replacementLevelRate: number;
    pointsPerWin: number;
    componentDisagreementIndex: number;
    abilityStandardError: number;
    displayUncertainty: number;
    intervalConfidence: number;
    rankingMode: RankingMode;
    finalRankingScore: number;
    eligibilityStatus: "eligible" | "insufficient_sample";
    eligibilityReason: string;
    rankingFormulaVersion: string;
    oldRank: number;
  };

  const evaluated: EvalRow[] = [];
  for (const p of oldByDrbl) {
    const n = Math.max(
      0,
      Number(p.actualPossessions ?? p.possessions) || 0
    );
    const seasonalImpact = Number(p.seasonalImpact) || 0;
    const rawAbilityRate =
      p.rawAbilityRate != null
        ? Number(p.rawAbilityRate)
        : n > 0
          ? (seasonalImpact * 100) / n
          : 0;
    // A2: never treat already-shrunk drbl100 as fusedRateRaw when fused exists.
    const fusedRateRaw = resolveFusedRateRaw(p);
    const priorMean = Number(p.priorMean) || 0;
    const priorEq =
      Number(p.priorEquivalentPossessions) ||
      ranking.priorEquivalentPossessions;
    const { posterior, reliability } = resolvePosteriorAbility({
      player: p,
      fusedRateRaw,
      possessions: n,
      priorMean,
      priorEquivalentPossessions: priorEq,
      empiricalBayes: empiricalBayesRate,
    });
    const componentDisagreementIndex = standardizedDisagreement([
      { value: p.drblP, mean: pMean, sd: pSd },
      { value: p.drblLn, mean: lnMean, sd: lnSd },
      { value: p.drblB, mean: bMean, sd: bSd },
    ]);
    const samplingSe = abilitySamplingSe(n);
    const modelSe = componentDisagreementIndex * 2;
    const abilityStandardError = combineStandardErrors(samplingSe, modelSe);
    const { trueHalfWidth, displayHalfWidth } = applyDisplayUncertaintyCap(
      abilityStandardError,
      ranking.intervalCriticalValue
    );
    const seasonWar = warFromImpact(seasonalImpact, ranking.pointsPerWin);
    const forecastPossessions = ranking.forecastPossessions;
    const forecastImpact = seasonalImpactFromRawRate(
      posterior - ranking.replacementLevelRate,
      forecastPossessions
    );
    const forecastWar = warFromImpact(forecastImpact, ranking.pointsPerWin);
    const eligible = n >= ranking.minimumActualPossessions;
    const finalRankingScore = finalRankingScoreFor(
      ranking.rankingMode,
      {
        posteriorAbilityRate: posterior,
        abilityStandardError,
        seasonWar,
        forecastWar,
      },
      ranking
    );

    evaluated.push({
      ...p,
      possessions: n,
      actualPossessions: n,
      rawAbilityRate: Number(rawAbilityRate.toFixed(4)),
      posteriorAbilityRate: Number(posterior.toFixed(4)),
      fusedRateRaw: Number(fusedRateRaw.toFixed(4)),
      drbl100: Number(posterior.toFixed(2)),
      reliabilityWeight: Number(reliability.toFixed(4)),
      abilityLineageVersion: ABILITY_LINEAGE_VERSION,
      publishedAbilityInput: CANONICAL_ABILITY_INPUT,
      priorMean,
      priorEquivalentPossessions: priorEq,
      seasonalImpact: Number(seasonalImpact.toFixed(2)),
      seasonWar: Number(seasonWar.toFixed(4)),
      drblWar: Number(seasonWar.toFixed(2)),
      forecastPossessions,
      forecastImpact: Number(forecastImpact.toFixed(2)),
      forecastWar: Number(forecastWar.toFixed(4)),
      replacementLevelRate: ranking.replacementLevelRate,
      pointsPerWin: ranking.pointsPerWin,
      disagreement: Number(componentDisagreementIndex.toFixed(2)),
      componentDisagreementIndex: Number(componentDisagreementIndex.toFixed(2)),
      abilityStandardError: Number(abilityStandardError.toFixed(4)),
      uncertainty: Number(trueHalfWidth.toFixed(2)),
      displayUncertainty: Number(displayHalfWidth.toFixed(2)),
      intervalLo: Number((posterior - trueHalfWidth).toFixed(2)),
      intervalHi: Number((posterior + trueHalfWidth).toFixed(2)),
      intervalConfidence: ranking.intervalConfidence,
      rankingMode: ranking.rankingMode,
      finalRankingScore,
      eligibilityStatus: eligible ? "eligible" : "insufficient_sample",
      eligibilityReason: eligible
        ? "ok"
        : `actualPossessions ${n} < minimum ${ranking.minimumActualPossessions}`,
      rankingFormulaVersion: RANKING_FORMULA_VERSION,
      oldRank: p.oldRank,
    });
  }

  const eligible = evaluated.filter((r) => r.eligibilityStatus === "eligible");
  const sorted = stableSortPlayers(eligible);
  const ranked = sorted.map((p, i) => ({
    ...p,
    rank: i + 1,
    finalRankingScore: Number(p.finalRankingScore.toFixed(6)),
  }));

  const top = ranked.slice(0, ranking.leaderboardSize);

  const outDir = path.join(process.cwd(), "reports", "ranking-audit");
  await mkdir(outDir, { recursive: true });

  const exportCols = [
    "rank",
    "playerId",
    "playerName",
    "teamId",
    "rankingMode",
    "finalRankingScore",
    "actualPossessions",
    "eligibilityStatus",
    "rawAbilityRate",
    "posteriorAbilityRate",
    "abilityStandardError",
    "uncertainty",
    "displayUncertainty",
    "intervalLo",
    "intervalHi",
    "intervalConfidence",
    "drbl100",
    "drblP",
    "drblLn",
    "drblB",
    "componentDisagreementIndex",
    "seasonalImpact",
    "seasonWar",
    "drblWar",
    "forecastPossessions",
    "forecastImpact",
    "forecastWar",
    "priorEquivalentPossessions",
    "reliabilityWeight",
    "pointsPerWin",
    "replacementLevelRate",
    "rankingFormulaVersion",
    "oldRank",
  ];

  const seasonKey = season.replace("-", "_");
  await writeFile(
    path.join(outDir, `top100_${seasonKey}_${mode}.csv`),
    toCsv(top as unknown as Array<Record<string, unknown>>, exportCols),
    "utf8"
  );

  // Ability / forecast alternate boards from same evaluated set.
  for (const alt of ["ability", "forecast_value"] as RankingMode[]) {
    const cfg = defaultRankingConfig({ rankingMode: alt });
    const rescored = evaluated
      .filter((r) => r.eligibilityStatus === "eligible")
      .map((r) => ({
        ...r,
        rankingMode: alt,
        finalRankingScore: finalRankingScoreFor(
          alt,
          {
            posteriorAbilityRate: r.posteriorAbilityRate,
            abilityStandardError: r.abilityStandardError,
            seasonWar: r.seasonWar,
            forecastWar: r.forecastWar,
          },
          cfg
        ),
      }));
    const altTop = stableSortPlayers(rescored)
      .slice(0, cfg.leaderboardSize)
      .map((p, i) => ({
        ...p,
        rank: i + 1,
        finalRankingScore: Number(p.finalRankingScore.toFixed(6)),
      }));
    await writeFile(
      path.join(outDir, `top100_${seasonKey}_${alt}.csv`),
      toCsv(altTop as unknown as Array<Record<string, unknown>>, exportCols),
      "utf8"
    );
  }

  const oldTop100 = oldByDrbl.slice(0, 100);
  const newIds = new Set(top.map((p) => p.playerId));
  const oldIds = new Set(oldTop100.map((p) => p.playerId));
  const entered = top.filter((p) => !oldIds.has(p.playerId));
  const left = oldTop100.filter((p) => !newIds.has(p.playerId));

  const comparison = ranked.map((p) => {
    const old = oldByDrbl.find((o) => o.playerId === p.playerId)!;
    return {
      player: p.playerName,
      playerId: p.playerId,
      oldRank: old.oldRank,
      newRank: p.rank,
      rankChange: old.oldRank - p.rank,
      oldRankingScore: old.drbl100,
      newRankingScore: p.finalRankingScore,
      actualPossessions: p.actualPossessions,
      posteriorAbilityRate: p.posteriorAbilityRate,
      abilityStandardError: p.abilityStandardError,
      seasonWar: p.seasonWar,
      eligibilityStatus: p.eligibilityStatus,
    };
  });

  await writeFile(
    path.join(outDir, `before_after_${seasonKey}.csv`),
    toCsv(comparison as unknown as Array<Record<string, unknown>>, [
      "player",
      "playerId",
      "oldRank",
      "newRank",
      "rankChange",
      "oldRankingScore",
      "newRankingScore",
      "actualPossessions",
      "posteriorAbilityRate",
      "abilityStandardError",
      "seasonWar",
      "eligibilityStatus",
    ]),
    "utf8"
  );

  const baseline = {
    season,
    rankingFormulaVersion: RANKING_FORMULA_VERSION,
    rankingMode: mode,
    gamesProcessed: artifact.gamesProcessed,
    totalPlayersInArtifact: legacy.length,
    eligibleAfterMinPossessions: eligible.length,
    excludedByMinPossessions: evaluated.length - eligible.length,
    old: {
      sortKey: "drbl100",
      top10: oldTop100.slice(0, 10).map((p) => ({
        player: p.playerName,
        possessions: p.possessions,
        drbl100: p.drbl100,
        drblWar: p.drblWar,
      })),
      medianPossessionsTop10: median(
        oldTop100.slice(0, 10).map((p) => p.possessions)
      ),
      medianPossessionsTop25: median(
        oldTop100.slice(0, 25).map((p) => p.possessions)
      ),
      medianPossessionsTop100: median(oldTop100.map((p) => p.possessions)),
      corrDrbl100Possessions: corr(
        oldTop100.map((p) => p.drbl100),
        oldTop100.map((p) => p.possessions)
      ),
      corrDrbl100War: corr(
        oldTop100.map((p) => p.drbl100),
        oldTop100.map((p) => p.drblWar)
      ),
      intervalsCrossingZero: oldTop100.filter(
        (p) => (p.intervalLo ?? 0) <= 0 && (p.intervalHi ?? 0) >= 0
      ).length,
    },
    corrected: {
      sortKey: "finalRankingScore",
      top10: top.slice(0, 10).map((p) => ({
        player: p.playerName,
        possessions: p.actualPossessions,
        finalRankingScore: p.finalRankingScore,
        posteriorAbilityRate: p.posteriorAbilityRate,
        seasonWar: p.seasonWar,
      })),
      medianPossessionsTop10: median(
        top.slice(0, 10).map((p) => p.actualPossessions)
      ),
      medianPossessionsTop25: median(
        top.slice(0, 25).map((p) => p.actualPossessions)
      ),
      medianPossessionsTop100: median(top.map((p) => p.actualPossessions)),
      corrPosteriorPossessions: corr(
        top.map((p) => p.posteriorAbilityRate),
        top.map((p) => p.actualPossessions)
      ),
      enteredTop100: entered.map((p) => p.playerName),
      leftTop100: left.map((p) => p.playerName),
      largestRises: comparison
        .slice()
        .sort((a, b) => b.rankChange - a.rankChange)
        .slice(0, 15),
      largestFalls: comparison
        .slice()
        .sort((a, b) => a.rankChange - b.rankChange)
        .slice(0, 15),
    },
  };

  await writeFile(
    path.join(outDir, `baseline_summary_${seasonKey}.json`),
    JSON.stringify(baseline, null, 2),
    "utf8"
  );

  // Update precomputed artifact in place (full eligible ranked list).
  const nextArtifact = {
    ...artifact,
    version: "drbl-ranking-v2",
    abilityLineageVersion: ABILITY_LINEAGE_VERSION,
    publishedAbilityInput: CANONICAL_ABILITY_INPUT,
    rankingFormulaVersion: RANKING_FORMULA_VERSION,
    rankingMode: mode,
    generatedAt: new Date().toISOString(),
    players: ranked.map(({ oldRank: _o, ...rest }) => rest),
  };
  await writeFile(src, JSON.stringify(nextArtifact, null, 2) + "\n", "utf8");

  // Also mirror post-m7 top100 path for continuity.
  const postM7Dir = path.join(process.cwd(), "reports", "post-m7");
  await mkdir(postM7Dir, { recursive: true });
  await writeFile(
    path.join(postM7Dir, `top100_${seasonKey}.csv`),
    toCsv(top as unknown as Array<Record<string, unknown>>, exportCols),
    "utf8"
  );

  console.log(
    JSON.stringify(
      {
        season,
        mode,
        rankingFormulaVersion: RANKING_FORMULA_VERSION,
        eligible: eligible.length,
        top5: top.slice(0, 5).map(
          (p) =>
            `${p.playerName} score=${p.finalRankingScore} war=${p.seasonWar} poss=${p.actualPossessions}`
        ),
        medianPossTop10: {
          old: baseline.old.medianPossessionsTop10,
          new: baseline.corrected.medianPossessionsTop10,
        },
        entered: entered.length,
        left: left.length,
        outDir,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
