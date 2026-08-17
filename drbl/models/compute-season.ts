import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { listSeasonGames, processGame } from "../index";
import {
  attributeGamePlayerValue,
  finalizePlayerSeasonRows,
  summarizeLeverageFromAccumulators,
  SEQUENTIAL_ATTRIBUTION_VERSION,
  type DrblPlayerSeasonRow,
} from "./player-value";
import { warmEpvModel } from "./expected-points";
import {
  accumulateReplacementSignals,
  buildReplacementPool,
  finalizeRoleAccum,
  type RoleVector,
} from "./replacement";
import {
  buildLineupRows,
  fitLineupModel,
  type LineupPossessionRow,
} from "./lineup-model";
import {
  accumulateBehaviorSignals,
  finalizeBehaviorRows,
  fitBehaviorModel,
} from "./behavior";
import { fitFusionOof, estimatorDisagreement, type FusionStackRow } from "./fusion";
import {
  buildUncertaintyObservations,
  calibrateUncertainty,
} from "./uncertainty";
import { calibrateWar } from "./war";
import { buildLeverageModelArtifact } from "./leverage";
import { accumulateShotDecisionComponents } from "./shot-components";
import {
  ABILITY_LINEAGE_VERSION,
  CANONICAL_ABILITY_INPUT,
  makeArtifactGenerationId,
} from "./ability-lineage";
import { VALIDATED_ABILITY_MODEL_VERSION } from "./validated-ability-v1";
import {
  DRBL_PARSER_VERSION,
  DRBL_RECONSTRUCTION_VERSION,
} from "../constants";

export interface DrblSeasonArtifact {
  season: string;
  version:
    | "drbl-core-v0"
    | "drbl-p-approach-b-v1"
    | "drbl-p-ln-v1"
    | "drbl-p-ln-b-v1"
    | "drbl-fusion-oof-v1"
    | "drbl-calibrated-v1"
    | "drbl-war-v1"
    | "drbl-l-v1"
    | "drbl-post-m7-v1"
    | "drbl-ranking-v2";
  generatedAt: string;
  gamesProcessed: number;
  gamesFailed: number;
  gamesQuarantined: number;
  replacementLevel: "R1";
  lineupModel?: {
    version: string;
    lambda: number;
    trainMae: number;
    holdoutMae?: number;
    players: number;
  };
  behaviorModel?: {
    version: string;
    lambda: number;
    trainMae: number;
    holdoutMae?: number;
    players: number;
    missingXyRate: number;
  };
  fusionModel?: {
    version: string;
    lambda: number;
    folds: number;
    oofMae: number;
    equalMae: number;
    liteMae: number;
    improvedVsEqual: boolean;
    improvedVsLite: boolean;
    simplexWeights: { wP: number; wLn: number; wB: number };
  };
  uncertaintyModel?: {
    version: string;
    targetCoverage: number;
    scaleMultiplier: number;
    oofCoverage: number;
    calibrated: boolean;
    meanAbsError: number;
  };
  warModel?: {
    version: string;
    pointsToWins: number;
    provisionalPointsToWins: number;
    calibrated: boolean;
    reason: string;
    holdoutMae?: number;
    holdoutCorr?: number;
  };
  leverageModel?: {
    version: string;
    meanRawLambda: number;
    exampleClutchLambdaStar: number;
    possessions: number;
  };
  /** Post-M7 shot decision (SDV/C2) — not fused into drbl100. */
  shotDecisionModel?: {
    version: string;
    continueMaeC0: number;
    continueMaeC2: number;
    continueCorrC2: number;
    shotsScored: number;
    fusedIntoDrbl100: false;
  };
  /** Fusion target protocol. */
  fusionTarget?: {
    kind: "future_block_residual_per_100" | "same_season_residual_per_100";
    earlyFrac: number;
    notes: string;
  };
  behaviorRetrospectiveOnly?: boolean;
  /** Ranking semantics version (bumps when sort key / formulas change). */
  rankingFormulaVersion?: string;
  rankingMode?: string;
  sequentialAttributionVersion?: string;
  abilityLineageVersion?: string;
  publishedAbilityInput?: string;
  /** M16k1+ canonical validated ability model id. */
  abilityModelVersion?: string;
  artifactGenerationId?: string;
  gameCount?: string | number;
  preprocessingVersion?: string;
  reconstructionVersion?: string;
  players: DrblPlayerSeasonRow[];
}

/**
 * Season compute:
 * 1) Process + quarantine filter
 * 2) Build R1 replacement pool
 * 3) Attribute DRBL-P (Approach B)
 * 4) Fit DRBL-LN ridge lineup model
 * 5) Fit DRBL-B behavioral ridge (optional; never blocks P/LN)
 * 6) OOF-stack P+LN+B → published drbl100 (M11)
 * 7) Calibrate ± uncertainty intervals from OOF residuals (M12)
 * 8) Team-level WAR calibration (M13)
 * 9) Formal WP leverage → DRBL-L (M14; independent of WAR)
 */
export async function computeSeasonDrbl(
  season: string,
  options: {
    limit?: number;
    delayMs?: number;
    force?: boolean;
    minPossessions?: number;
  } = {}
): Promise<DrblSeasonArtifact> {
  let games = await listSeasonGames(season);
  if (options.limit && options.limit > 0) {
    games = games.slice(0, options.limit);
  }

  await warmEpvModel();

  const processedGames: Awaited<ReturnType<typeof processGame>>[] = [];
  let gamesFailed = 0;
  let gamesQuarantined = 0;

  for (let i = 0; i < games.length; i++) {
    const meta = games[i]!;
    try {
      const processed = await processGame(meta, {
        force: options.force,
        persist: true,
      });
      if (processed.reconcile.quarantined) {
        gamesQuarantined += 1;
        gamesFailed += 1;
      } else {
        processedGames.push(processed);
      }
    } catch {
      gamesFailed += 1;
    }
    if (options.delayMs && i < games.length - 1) {
      await new Promise((r) => setTimeout(r, options.delayMs));
    }
  }

  const roleAccum = new Map();
  const behaviorAccum = new Map();
  let cutoffDate = "";
  const lineupRows: LineupPossessionRow[] = [];

  for (const g of processedGames) {
    accumulateReplacementSignals(g.box, g.events, g.possessions, roleAccum);
    accumulateBehaviorSignals(g.box, g.events, g.possessions, behaviorAccum);
    lineupRows.push(...buildLineupRows(g.box, g.events, g.possessions));
    if (g.box.gameDate && g.box.gameDate > cutoffDate) {
      cutoffDate = g.box.gameDate;
    }
  }

  const candidates = finalizeRoleAccum(roleAccum);
  const rolesByPlayer = new Map<string, RoleVector>(
    candidates.map((c) => [c.playerId, c.role])
  );
  const replacementPool = buildReplacementPool(candidates, {
    cutoffDate: cutoffDate || "9999-12-31",
    level: "R1",
  });

  // Full-season attribution (published P / O / D / L / WAR base).
  const accumulators = new Map();
  for (const g of processedGames) {
    attributeGamePlayerValue(g.box, g.events, g.possessions, accumulators, {
      replacementPool,
      rolesByPlayer,
    });
  }

  // Post-M7: SDV = ÊPV_shoot − V_cont(C2); ShotMaking separate (not fused).
  const shotDecision = accumulateShotDecisionComponents(
    processedGames,
    accumulators,
    { holdoutFrac: 0.2 }
  );

  const lineupModel =
    lineupRows.length >= 50
      ? fitLineupModel(lineupRows, { lambda: 800, holdoutFrac: 0.2 })
      : null;

  const behaviorRows = finalizeBehaviorRows(behaviorAccum, {
    minPossessions: options.minPossessions ?? 50,
  });
  const behaviorModel =
    behaviorRows.length >= 30
      ? fitBehaviorModel(behaviorRows, {
          lambda: 40,
          holdoutFrac: 0.2,
          games: processedGames.length,
        })
      : null;

  const modelDir = path.join(process.cwd(), "data", "drbl", "models");
  await mkdir(modelDir, { recursive: true });

  if (lineupModel) {
    const { ratingsPer100: _r, ...serializable } = lineupModel;
    await writeFile(
      path.join(modelDir, `lineup-${season}.json`),
      JSON.stringify(serializable, null, 2),
      "utf8"
    );
  }
  if (behaviorModel) {
    const { ratingsPer100: _r, ...serializable } = behaviorModel;
    await writeFile(
      path.join(modelDir, `behavior-${season}.json`),
      JSON.stringify(
        {
          ...serializable,
          retrospectiveOnly: true,
          note: "Post-game box features — retrospective DRBL-B only; not live-safe",
        },
        null,
        2
      ),
      "utf8"
    );
  }

  // --- Future-block fusion target (PM7-004) ---
  // Early chrono games → stack features (P/LN/B); late games → Y residual/100.
  const earlyFrac = 0.7;
  const sortedGames = processedGames
    .slice()
    .sort(
      (a, b) =>
        (a.box.gameDate || "").localeCompare(b.box.gameDate || "") ||
        a.box.gameId.localeCompare(b.box.gameId)
    );
  const earlyCut = Math.max(1, Math.floor(sortedGames.length * earlyFrac));
  const earlyGames = sortedGames.slice(0, earlyCut);
  const lateGames = sortedGames.slice(earlyCut);

  const earlyAccum = new Map();
  for (const g of earlyGames) {
    attributeGamePlayerValue(g.box, g.events, g.possessions, earlyAccum, {
      replacementPool,
      rolesByPlayer,
    });
  }
  const lateAccum = new Map();
  for (const g of lateGames) {
    attributeGamePlayerValue(g.box, g.events, g.possessions, lateAccum, {
      replacementPool,
      rolesByPlayer,
    });
  }

  const earlyLineupRows = earlyGames.flatMap((g) =>
    buildLineupRows(g.box, g.events, g.possessions)
  );
  const earlyLineupModel =
    earlyLineupRows.length >= 50
      ? fitLineupModel(earlyLineupRows, { lambda: 800, holdoutFrac: 0.2 })
      : lineupModel;

  const earlyBehaviorAccum = new Map();
  for (const g of earlyGames) {
    accumulateBehaviorSignals(g.box, g.events, g.possessions, earlyBehaviorAccum);
  }
  const earlyBehaviorRows = finalizeBehaviorRows(earlyBehaviorAccum, {
    minPossessions: options.minPossessions ?? 50,
  });
  const earlyBehaviorModel =
    earlyBehaviorRows.length >= 30
      ? fitBehaviorModel(earlyBehaviorRows, {
          lambda: 40,
          holdoutFrac: 0.2,
          games: earlyGames.length,
        })
      : behaviorModel;

  const earlyPlayers = finalizePlayerSeasonRows(earlyAccum, {
    minPossessions: options.minPossessions ?? 50,
    lineupRatingsPer100: earlyLineupModel?.ratingsPer100 ?? null,
    behaviorRatingsPer100: earlyBehaviorModel?.ratingsPer100 ?? null,
  });

  const stackRows: FusionStackRow[] = [];
  for (const p of earlyPlayers) {
    const late = lateAccum.get(p.playerId);
    if (!late || late.possessions < 20) continue;
    const futureTarget = (100 * late.totalValue) / late.possessions;
    stackRows.push({
      playerId: p.playerId,
      drblP: p.drblP,
      drblLn: p.drblLn,
      drblB:
        earlyBehaviorModel?.ratingsPer100.has(p.playerId) ? p.drblB : null,
      targetPer100: futureTarget,
      possessions: p.possessions,
      asOfDate: earlyGames[earlyGames.length - 1]?.box.gameDate || cutoffDate,
    });
  }

  const fusionModel =
    stackRows.length >= 20
      ? fitFusionOof(stackRows, { lambda: 8, folds: 5 })
      : null;

  if (fusionModel) {
    const {
      oofRatingsPer100: _o,
      oofProvenance,
      ...serializable
    } = fusionModel;
    await writeFile(
      path.join(modelDir, `fusion-${season}.json`),
      JSON.stringify(
        {
          ...serializable,
          finalFitWeights: fusionModel.finalFitWeights ?? fusionModel.weights,
          targetKind: "future_block_residual_per_100",
          earlyFrac,
        },
        null,
        2
      ),
      "utf8"
    );
    // M16b: serialize OOF provenance (predictions unchanged).
    const oofDir = path.join(process.cwd(), "data", "drbl", "models", "oof");
    await mkdir(oofDir, { recursive: true });
    await writeFile(
      path.join(oofDir, `fusion-oof-${season}.json`),
      JSON.stringify(
        {
          season,
          earlyFrac,
          lambda: fusionModel.lambda,
          folds: fusionModel.folds,
          ...oofProvenance,
        },
        null,
        2
      ),
      "utf8"
    );
  }

  const uncertaintyObs = buildUncertaintyObservations(
    stackRows.map((r) => ({
      playerId: r.playerId,
      possessions: r.possessions,
      disagreement: estimatorDisagreement(r.drblP, r.drblLn, r.drblB),
      asOfDate: r.asOfDate,
      targetPer100: r.targetPer100,
      fusedPer100:
        fusionModel?.oofRatingsPer100.get(r.playerId) ??
        (r.drblB != null
          ? (r.drblP + r.drblLn + r.drblB) / 3
          : (r.drblP + r.drblLn) / 2),
    }))
  );

  const uncertaintyModel =
    uncertaintyObs.length >= 20
      ? calibrateUncertainty(uncertaintyObs, {
          targetCoverage: 0.8,
          folds: 5,
        })
      : null;

  if (uncertaintyModel) {
    await writeFile(
      path.join(modelDir, `uncertainty-${season}.json`),
      JSON.stringify(uncertaintyModel, null, 2),
      "utf8"
    );
  }

  const warModel =
    processedGames.length >= 20
      ? calibrateWar(processedGames, {
          replacementPool,
          rolesByPlayer,
          holdoutFrac: 0.25,
          minTeams: 8,
          minGamesForCalibration: 200,
        })
      : null;

  if (warModel) {
    await writeFile(
      path.join(modelDir, `war-${season}.json`),
      JSON.stringify(warModel, null, 2),
      "utf8"
    );
  }

  const levSummary = summarizeLeverageFromAccumulators(accumulators);
  const leverageModel = buildLeverageModelArtifact(levSummary.meanRawLambda, {
    minRawLambda: levSummary.minRawLambda,
    maxRawLambda: levSummary.maxRawLambda,
    possessions: levSummary.possessions,
  });
  await writeFile(
    path.join(modelDir, `leverage-${season}.json`),
    JSON.stringify(leverageModel, null, 2),
    "utf8"
  );

  // Map early-block OOF fusion ratings onto full-season player ids where available.
  const generatedAt = new Date().toISOString();
  const artifactGenerationId = makeArtifactGenerationId(
    season,
    processedGames.length,
    generatedAt
  );
  const players = finalizePlayerSeasonRows(accumulators, {
    minPossessions: options.minPossessions ?? 50,
    lineupRatingsPer100: lineupModel?.ratingsPer100 ?? null,
    behaviorRatingsPer100: behaviorModel?.ratingsPer100 ?? null,
    fusionRatingsPer100: fusionModel?.oofRatingsPer100 ?? null,
    uncertaintyCalibration: uncertaintyModel,
    pointsToWins: warModel?.pointsToWins ?? null,
  }).map((p) => ({
    ...p,
    season,
    gameCount: processedGames.length,
    gamesProcessed: processedGames.length,
    artifactGenerationId,
    preprocessingVersion: DRBL_PARSER_VERSION,
    reconstructionVersion: DRBL_RECONSTRUCTION_VERSION,
    publishedAbilityInput: CANONICAL_ABILITY_INPUT,
    abilityLineageVersion: ABILITY_LINEAGE_VERSION,
    abilityModelVersion: VALIDATED_ABILITY_MODEL_VERSION,
  }));

  return {
    season,
    version: "drbl-ranking-v2",
    sequentialAttributionVersion: SEQUENTIAL_ATTRIBUTION_VERSION,
    abilityLineageVersion: ABILITY_LINEAGE_VERSION,
    publishedAbilityInput: CANONICAL_ABILITY_INPUT,
    abilityModelVersion: VALIDATED_ABILITY_MODEL_VERSION,
    rankingMode: "season_value",
    rankingFormulaVersion: "2.0.0",
    generatedAt,
    artifactGenerationId,
    gameCount: processedGames.length,
    preprocessingVersion: DRBL_PARSER_VERSION,
    reconstructionVersion: DRBL_RECONSTRUCTION_VERSION,
    gamesProcessed: processedGames.length,
    gamesFailed,
    gamesQuarantined,
    replacementLevel: "R1",
    behaviorRetrospectiveOnly: true,
    fusionTarget: {
      kind: "future_block_residual_per_100",
      earlyFrac,
      notes:
        "Stack features from early chrono games; Y = late-block residual/100. SDV not in fusion.",
    },
    shotDecisionModel: {
      version: "drbl-m7-cv-c2-in-season",
      continueMaeC0: shotDecision.continueMaeC0,
      continueMaeC2: shotDecision.continueMaeC2,
      continueCorrC2: shotDecision.continueCorrC2,
      shotsScored: shotDecision.shotsScored,
      fusedIntoDrbl100: false,
    },
    lineupModel: lineupModel
      ? {
          version: lineupModel.version,
          lambda: lineupModel.lambda,
          trainMae: lineupModel.train.mae,
          holdoutMae: lineupModel.holdout?.mae,
          players: lineupModel.playerIds.length,
        }
      : undefined,
    behaviorModel: behaviorModel
      ? {
          version: behaviorModel.version,
          lambda: behaviorModel.lambda,
          trainMae: behaviorModel.train.mae,
          holdoutMae: behaviorModel.holdout?.mae,
          players: behaviorModel.provenance.coverage.players,
          missingXyRate: behaviorModel.provenance.coverage.missingXyRate,
        }
      : undefined,
    fusionModel: fusionModel
      ? {
          version: fusionModel.version,
          lambda: fusionModel.lambda,
          folds: fusionModel.folds,
          oofMae: fusionModel.oof.mae,
          equalMae: fusionModel.oof.equalMae,
          liteMae: fusionModel.oof.liteMae,
          improvedVsEqual: fusionModel.oof.improvedVsEqual,
          improvedVsLite: fusionModel.oof.improvedVsLite,
          simplexWeights: fusionModel.simplexWeights,
        }
      : undefined,
    uncertaintyModel: uncertaintyModel
      ? {
          version: uncertaintyModel.version,
          targetCoverage: uncertaintyModel.targetCoverage,
          scaleMultiplier: uncertaintyModel.scaleMultiplier,
          oofCoverage: uncertaintyModel.oof.coverage,
          calibrated: uncertaintyModel.oof.calibrated,
          meanAbsError: uncertaintyModel.oof.meanAbsError,
        }
      : undefined,
    warModel: warModel
      ? {
          version: warModel.version,
          pointsToWins: warModel.pointsToWins,
          provisionalPointsToWins: warModel.provisionalPointsToWins,
          calibrated: warModel.calibrated,
          reason: warModel.reason,
          holdoutMae: warModel.holdout?.mae,
          holdoutCorr: warModel.holdout?.corr,
        }
      : undefined,
    leverageModel: {
      version: leverageModel.version,
      meanRawLambda: leverageModel.meanRawLambda,
      exampleClutchLambdaStar: leverageModel.exampleClutchLambdaStar,
      possessions: leverageModel.possessions,
    },
    players,
  };
}

export async function writeSeasonDrblArtifact(
  artifact: DrblSeasonArtifact,
  options?: { sitePath?: string; offlinePath?: string }
): Promise<{ offlinePath: string; sitePath: string }> {
  const offlinePath =
    options?.offlinePath ??
    path.join(
      process.cwd(),
      "data",
      "drbl",
      "normalized",
      artifact.season,
      "player_season.json"
    );
  const sitePath =
    options?.sitePath ??
    path.join(
      process.cwd(),
      "src",
      "data",
      "drbl",
      "precomputed",
      `${artifact.season}.json`
    );

  await mkdir(path.dirname(offlinePath), { recursive: true });
  await mkdir(path.dirname(sitePath), { recursive: true });
  const json = JSON.stringify(artifact, null, 2);
  await writeFile(offlinePath, json, "utf8");
  await writeFile(sitePath, json, "utf8");
  return { offlinePath, sitePath };
}
