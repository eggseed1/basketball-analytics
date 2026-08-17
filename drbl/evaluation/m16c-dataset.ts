/**
 * M16c evaluation dataset builder — TRAIN/VALIDATION only.
 * Reuses production earlyFrac future-block target construction.
 * Does NOT load RESERVED_TEST.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import type { DrblProcessedGame } from "../index";
import type { SplitGame } from "./splits";
import { hashGames } from "./splits";
import {
  attributeGamePlayerValue,
  finalizePlayerSeasonRows,
} from "../models/player-value";
import {
  accumulateReplacementSignals,
  buildReplacementPool,
  finalizeRoleAccum,
} from "../models/replacement";
import { buildLineupRows, fitLineupModel } from "../models/lineup-model";
import {
  accumulateBehaviorSignals,
  finalizeBehaviorRows,
  fitBehaviorModel,
} from "../models/behavior";
import type { FusionStackRow } from "../models/fusion";
import { accumulateShotDecisionComponents } from "../models/shot-components";
import { M6_VERSION } from "../models/shot-decision";
import { ELIGIBILITY_RULES } from "./protocol";

export const M16C_EARLY_FRAC = 0.7;
export const M16C_FUSION_LAMBDA = 8;
export const M16C_FUSION_FOLDS = 5;

/**
 * Production / M16c / M16d fusion constraint (prediction path).
 * Ridge coefficients are unconstrained (signed). Simplex is report-only.
 */
export const FUSION_CONSTRAINT_TYPE =
  "ridge_with_intercept" as const;
export const FUSION_CONSTRAINT_DETAIL =
  "fitFusionRidgeFull: unrestricted ridge on [1,P,LN,B,hasB] with λ on non-intercept terms; predictions use signed coefficients; toSimplexWeights() is diagnostic renormalization only and does not alter predictions";

export type EvalStackRow = FusionStackRow & {
  /** M6 public season field (points/100 FGA-equivalent SDV); null if unavailable. */
  sdv100: number | null;
  m6Coverage: boolean;
};

export type ComponentMask = {
  useP: boolean;
  useLn: boolean;
  useB: boolean;
};

export const CANDIDATE_MASKS: Record<string, ComponentMask> = {
  M16C_P: { useP: true, useLn: false, useB: false },
  M16C_LN: { useP: false, useLn: true, useB: false },
  M16C_B: { useP: false, useLn: false, useB: true },
  M16C_P_LN: { useP: true, useLn: true, useB: false },
  M16C_P_B: { useP: true, useLn: false, useB: true },
  M16C_LN_B: { useP: false, useLn: true, useB: true },
  M16C_P_LN_B: { useP: true, useLn: true, useB: true },
};

export function maskFusionRows(
  rows: FusionStackRow[],
  mask: ComponentMask
): FusionStackRow[] {
  return rows.map((r) => ({
    ...r,
    drblP: mask.useP ? r.drblP : 0,
    drblLn: mask.useLn ? r.drblLn : 0,
    drblB: mask.useB ? r.drblB : null,
  }));
}

export async function loadNormalizedGame(
  season: string,
  gameId: string
): Promise<DrblProcessedGame | null> {
  const dir = path.join(
    process.cwd(),
    "data",
    "drbl",
    "normalized",
    season,
    gameId
  );
  try {
    const [box, events, possessions, reconcile] = await Promise.all([
      readFile(path.join(dir, "box.json"), "utf8").then(JSON.parse),
      readFile(path.join(dir, "events.json"), "utf8").then(JSON.parse),
      readFile(path.join(dir, "possessions.json"), "utf8").then(JSON.parse),
      readFile(path.join(dir, "reconcile.json"), "utf8").then(JSON.parse),
    ]);
    if (reconcile?.quarantined) return null;
    return {
      meta: {
        season,
        gameId,
        gameDate: box.gameDate,
        homeTeamId: box.homeTeamId,
        awayTeamId: box.awayTeamId,
        homeScore: box.homeScore,
        awayScore: box.awayScore,
      },
      box,
      events,
      lineups: [],
      possessions,
      reconcile,
    };
  } catch {
    return null;
  }
}

export async function loadSplitGames(
  games: SplitGame[]
): Promise<DrblProcessedGame[]> {
  const out: DrblProcessedGame[] = [];
  for (const g of games) {
    const processed = await loadNormalizedGame(g.season, g.gameId);
    if (processed) out.push(processed);
  }
  return out;
}

/**
 * Build future_block_residual_per_100 stack rows from a game set.
 * Mirrors compute-season earlyFrac construction (formulas unchanged).
 */
export function buildFutureBlockStackRows(
  processedGames: DrblProcessedGame[],
  options: {
    earlyFrac?: number;
    minPossessions?: number;
    minFuturePossessions?: number;
    /** When true, accumulate early-block M6 (sdv100) without late-game leakage. */
    includeM6?: boolean;
  } = {}
): {
  rows: EvalStackRow[];
  earlyFrac: number;
  earlyGameCount: number;
  lateGameCount: number;
  validationRowsUsedInFit: 0;
  m6Version: string | null;
  m6ShotsScored: number;
} {
  const earlyFrac = options.earlyFrac ?? M16C_EARLY_FRAC;
  const minPoss = options.minPossessions ?? ELIGIBILITY_RULES.minPossessions;
  const minFuture =
    options.minFuturePossessions ?? ELIGIBILITY_RULES.minFutureObservations;

  const sortedGames = processedGames
    .slice()
    .sort(
      (a, b) =>
        (a.box.gameDate || "").localeCompare(b.box.gameDate || "") ||
        a.box.gameId.localeCompare(b.box.gameId)
    );

  // Full-set replacement / roles (same as production season compute).
  const roleAccum = new Map();
  let cutoffDate = "";
  for (const g of sortedGames) {
    accumulateReplacementSignals(g.box, g.events, g.possessions, roleAccum);
    if (g.box.gameDate && g.box.gameDate > cutoffDate) cutoffDate = g.box.gameDate;
  }
  const candidates = finalizeRoleAccum(roleAccum);
  const rolesByPlayer = new Map(candidates.map((c) => [c.playerId, c.role]));
  const replacementPool = buildReplacementPool(candidates, {
    cutoffDate: cutoffDate || "9999-12-31",
    level: "R1",
  });

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
  let m6ShotsScored = 0;
  let m6Version: string | null = null;
  if (options.includeM6) {
    // Early games only — same feature cutoff as P/LN/B (no late-block leakage).
    const m6 = accumulateShotDecisionComponents(earlyGames, earlyAccum, {
      holdoutFrac: 0.2,
    });
    m6ShotsScored = m6.shotsScored;
    m6Version = M6_VERSION;
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
      : null;

  const earlyBehaviorAccum = new Map();
  for (const g of earlyGames) {
    accumulateBehaviorSignals(g.box, g.events, g.possessions, earlyBehaviorAccum);
  }
  const earlyBehaviorRows = finalizeBehaviorRows(earlyBehaviorAccum, {
    minPossessions: minPoss,
  });
  const earlyBehaviorModel =
    earlyBehaviorRows.length >= 30
      ? fitBehaviorModel(earlyBehaviorRows, {
          lambda: 40,
          holdoutFrac: 0.2,
          games: earlyGames.length,
        })
      : null;

  const earlyPlayers = finalizePlayerSeasonRows(earlyAccum, {
    minPossessions: minPoss,
    lineupRatingsPer100: earlyLineupModel?.ratingsPer100 ?? null,
    behaviorRatingsPer100: earlyBehaviorModel?.ratingsPer100 ?? null,
  });

  const rows: EvalStackRow[] = [];
  for (const p of earlyPlayers) {
    const late = lateAccum.get(p.playerId);
    if (!late || late.possessions < minFuture) continue;
    const futureTarget = (100 * late.totalValue) / late.possessions;
    const acc = earlyAccum.get(p.playerId);
    const m6Coverage = options.includeM6 ? !!(acc && acc.sdvN > 0) : false;
    rows.push({
      playerId: p.playerId,
      drblP: p.drblP,
      drblLn: p.drblLn,
      drblB: earlyBehaviorModel?.ratingsPer100.has(p.playerId)
        ? p.drblB
        : null,
      targetPer100: futureTarget,
      possessions: p.possessions,
      asOfDate: earlyGames[earlyGames.length - 1]?.box.gameDate || "",
      sdv100: options.includeM6 && m6Coverage ? p.sdv100 : null,
      m6Coverage,
    });
  }

  return {
    rows,
    earlyFrac,
    earlyGameCount: earlyGames.length,
    lateGameCount: lateGames.length,
    validationRowsUsedInFit: 0,
    m6Version,
    m6ShotsScored,
  };
}

export function verifyFrozenSplitHashes(args: {
  train: SplitGame[];
  validation: SplitGame[];
  reservedTestHashExpected: string;
  trainHashExpected: string;
  validationHashExpected: string;
  reservedTestGamesForHashOnly?: SplitGame[];
}): { ok: boolean; reason?: string; trainHash: string; validationHash: string } {
  const trainHash = hashGames(args.train);
  const validationHash = hashGames(args.validation);
  if (trainHash !== args.trainHashExpected) {
    return {
      ok: false,
      reason: `EVALUATION_PROTOCOL_DRIFT train hash ${trainHash} != ${args.trainHashExpected}`,
      trainHash,
      validationHash,
    };
  }
  if (validationHash !== args.validationHashExpected) {
    return {
      ok: false,
      reason: `EVALUATION_PROTOCOL_DRIFT validation hash ${validationHash} != ${args.validationHashExpected}`,
      trainHash,
      validationHash,
    };
  }
  if (args.reservedTestGamesForHashOnly) {
    const rh = hashGames(args.reservedTestGamesForHashOnly);
    if (rh !== args.reservedTestHashExpected) {
      return {
        ok: false,
        reason: `EVALUATION_PROTOCOL_DRIFT reserved hash ${rh} != ${args.reservedTestHashExpected}`,
        trainHash,
        validationHash,
      };
    }
  }
  return { ok: true, trainHash, validationHash };
}

export function describeDistribution(xs: number[]): Record<string, number> {
  const vals = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  const missing = xs.length - vals.length;
  const q = (p: number) => {
    if (!vals.length) return NaN;
    const i = Math.min(
      vals.length - 1,
      Math.max(0, Math.floor((p / 100) * vals.length))
    );
    return vals[i]!;
  };
  const mean = vals.length
    ? vals.reduce((a, b) => a + b, 0) / vals.length
    : NaN;
  const sd =
    vals.length > 1
      ? Math.sqrt(
          vals.reduce((s, x) => s + (x - mean) ** 2, 0) / vals.length
        )
      : NaN;
  return {
    count: vals.length,
    missing,
    mean,
    sd,
    median: q(50),
    p5: q(5),
    p25: q(25),
    p75: q(75),
    p95: q(95),
    min: vals[0] ?? NaN,
    max: vals[vals.length - 1] ?? NaN,
  };
}
