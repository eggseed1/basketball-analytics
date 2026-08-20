/**
 * M16e1 deploy - WAR 4.0.1 unit repair only.
 *
 * Freezes LOO slope / replacement / PPW from the existing 2024-25 artifact.
 * Changes only the exposure basis for calibrated WAR:
 *   N_paired = combinedPossessionAppearances / 2
 *
 * Does NOT touch 2025-26 provisional WAR (raw × combined is already coherent).
 * Does NOT refit calibration.
 *
 *   npm run drbl:war-unit-repair
 */
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";

import {
  computeWAR,
  pairedOnCourtPossessionsFromCombined,
  WAR_EXPOSURE_UNIT,
  WAR_FORMULA_VERSION,
  WAR_FORMULA_VERSION_PREVIOUS,
} from "../drbl/models/pipeline-value";

const ROOT = process.cwd();
const SEASON = "2024-25";
const ART =
  path.join(ROOT, "src/data/drbl/precomputed", `${SEASON}.json`);
const OUT = path.join(ROOT, "reports", "m16e1-deploy");

function sha256(buf: Buffer | string): string {
  return createHash("sha256").update(buf).digest("hex");
}

async function main() {
  await mkdir(path.join(OUT, "freeze"), { recursive: true });

  const gitCommit = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  const gitDirty =
    execSync("git status --porcelain", { encoding: "utf8" }).trim().length > 0;

  const beforeBuf = await readFile(ART);
  const beforeHash = sha256(beforeBuf);
  await copyFile(ART, path.join(OUT, "freeze", `${SEASON}-pre-4.0.1.json`));

  const artifact = JSON.parse(beforeBuf.toString("utf8")) as {
    players: Array<Record<string, unknown>>;
    warModel?: Record<string, unknown>;
    warFormulaVersion?: string;
    [k: string]: unknown;
  };

  const wm = artifact.warModel ?? {};
  const slope = Number(wm.calibrationSlope);
  const intercept = Number(wm.calibrationIntercept ?? 0);
  const repl = Number(wm.replacementLevelDRBL100);
  const ppw = Number(wm.pointsPerWin);

  if (![slope, repl, ppw].every((x) => Number.isFinite(x) && x !== 0)) {
    throw new Error("Frozen WAR constants missing from artifact warModel");
  }

  // Refuse if already repaired
  if (
    artifact.warFormulaVersion === WAR_FORMULA_VERSION ||
    wm.warFormulaVersion === WAR_FORMULA_VERSION
  ) {
    throw new Error(`Already at ${WAR_FORMULA_VERSION}; refusing double repair`);
  }

  let maxRatioDev = 0;
  let halfMatch = 0;
  const samples: Array<Record<string, unknown>> = [];

  const players = artifact.players.map((p) => {
    const nCombined = Number(p.actualPossessions ?? p.possessions ?? 0);
    const nPaired = pairedOnCourtPossessionsFromCombined(nCombined);
    const finalAbility = Number(p.finalAbilityDRBL100);
    const replP = Number(p.replacementLevelRate ?? repl);
    const ppwP = Number(p.pointsPerWin ?? ppw);
    const oldWar = Number(p.drblWar ?? 0);

    const war = computeWAR({
      finalAbilityDRBL100: finalAbility,
      replacementLevelDRBL100: replP,
      pairedOnCourtPossessions: nPaired,
      pointsPerWin: ppwP,
    });

    const expectedHalf = oldWar / 2;
    const ratio = Math.abs(oldWar) > 1e-9 ? war.war / oldWar : NaN;
    if (Number.isFinite(ratio)) {
      maxRatioDev = Math.max(maxRatioDev, Math.abs(ratio - 0.5));
    }
    if (Math.abs(war.war - expectedHalf) < 1e-9) halfMatch++;

    const name = String(p.playerName ?? "");
    if (
      /joki|gilgeous|wagner|wembanyama|pritchard|zubac|derozan|braun/i.test(
        name
      )
    ) {
      samples.push({
        player: name,
        warV400: oldWar,
        warV401: war.war,
        ratio: war.war / oldWar,
        combinedPossessionAppearances: nCombined,
        pairedOnCourtPossessions: nPaired,
        finalAbility,
        replacement: replP,
        pointsPerWin: ppwP,
      });
    }

    return {
      ...p,
      combinedPossessionAppearances: nCombined,
      pairedOnCourtPossessions: nPaired,
      // Keep actualPossessions as combined for raw-rate identity / EB n
      actualPossessions: nCombined,
      possessions: nCombined,
      seasonImpactAboveReplacement: war.impactAboveReplacement,
      aboveReplacementDRBL100: war.aboveReplacementRate,
      drblWar: war.war,
      seasonWar: war.war,
      finalRankingScore: war.war,
      drblWaa:
        ppwP > 0 ? (finalAbility * nPaired) / 100 / ppwP : Number(p.drblWaa ?? 0),
      warFormulaVersion: WAR_FORMULA_VERSION,
      warFormulaVersionPrevious: WAR_FORMULA_VERSION_PREVIOUS,
      warExposureUnit: WAR_EXPOSURE_UNIT,
      warV400Audit: oldWar,
      // Frozen calib fields unchanged
      rateCalibrationSlope: Number(p.rateCalibrationSlope ?? slope),
      calibrationIntercept: Number(p.calibrationIntercept ?? intercept),
      replacementLevelRate: replP,
      pointsPerWin: ppwP,
      finalAbilityDRBL100: finalAbility,
    };
  });

  players.sort((a, b) => Number(b.drblWar) - Number(a.drblWar));
  players.forEach((p, i) => {
    (p as { rank?: number }).rank = i + 1;
  });

  const updated = {
    ...artifact,
    generatedAt: new Date().toISOString(),
    warFormulaVersion: WAR_FORMULA_VERSION,
    warFormulaVersionPrevious: WAR_FORMULA_VERSION_PREVIOUS,
    warExposureUnit: WAR_EXPOSURE_UNIT,
    warUnitRepair: {
      version: WAR_FORMULA_VERSION,
      previousVersion: WAR_FORMULA_VERSION_PREVIOUS,
      kind: "exposure_unit_repair_only",
      frozenCalibrationSlope: slope,
      frozenCalibrationIntercept: intercept,
      frozenReplacement: repl,
      frozenPointsPerWin: ppw,
      warExposureUnit: WAR_EXPOSURE_UNIT,
      note:
        "N_combined/N_paired ≡ 2 by definition of paired=(off+def)/2; independent evidence is LOO netRating units × former combined exposure",
      repairedAt: new Date().toISOString(),
      preRepairArtifactHash: beforeHash,
    },
    warModel: {
      ...wm,
      calibrationSlope: slope,
      calibrationIntercept: intercept,
      replacementLevelDRBL100: repl,
      pointsPerWin: ppw,
      pointsToWins: 1 / ppw,
      warExposureUnit: WAR_EXPOSURE_UNIT,
      warFormulaVersion: WAR_FORMULA_VERSION,
      warFormulaVersionPrevious: WAR_FORMULA_VERSION_PREVIOUS,
      reason:
        "v4.0.1 unit repair: frozen LOO/repl/PPW; exposure = pairedOnCourtPossessions",
    },
    players,
  };

  const outText = JSON.stringify(updated);
  await writeFile(ART, outText);
  const afterHash = sha256(outText);
  await copyFile(ART, path.join(OUT, "freeze", `${SEASON}-post-4.0.1.json`));

  // Also patch m16a full artifact if present (research freeze copy)
  const m16aPath = path.join(
    ROOT,
    "reports/m16a/artifacts",
    `full-${SEASON}.json`
  );
  try {
    const m16aBuf = await readFile(m16aPath);
    const m16a = JSON.parse(m16aBuf.toString("utf8")) as typeof artifact;
    if (m16a.warFormulaVersion !== WAR_FORMULA_VERSION) {
      await copyFile(
        m16aPath,
        path.join(OUT, "freeze", `m16a-full-${SEASON}-pre-4.0.1.json`)
      );
      // Reuse same player WAR fields from updated site artifact by id
      const byId = new Map(
        players.map((p) => [String(p.playerId), p] as const)
      );
      m16a.players = (m16a.players ?? []).map((p) => {
        const u = byId.get(String(p.playerId));
        return u ? { ...p, ...pickWarFields(u) } : p;
      });
      m16a.warFormulaVersion = WAR_FORMULA_VERSION;
      m16a.warFormulaVersionPrevious = WAR_FORMULA_VERSION_PREVIOUS;
      m16a.warExposureUnit = WAR_EXPOSURE_UNIT;
      m16a.warModel = {
        ...(m16a.warModel ?? {}),
        ...updated.warModel,
      };
      m16a.warUnitRepair = updated.warUnitRepair;
      m16a.generatedAt = updated.generatedAt;
      await writeFile(m16aPath, JSON.stringify(m16a));
    }
  } catch {
    // optional
  }

  const report = {
    milestone: "M16e1-deploy",
    kind: "WAR_UNIT_REPAIR_ONLY",
    gitCommit,
    gitDirty,
    season: SEASON,
    beforeHash,
    afterHash,
    warFormulaVersion: WAR_FORMULA_VERSION,
    warFormulaVersionPrevious: WAR_FORMULA_VERSION_PREVIOUS,
    warExposureUnit: WAR_EXPOSURE_UNIT,
    frozen: { slope, intercept, repl, ppw },
    players: players.length,
    exactHalfMatches: halfMatch,
    maxAbsRatioDeviationFromHalf: maxRatioDev,
    samples,
    unchanged: [
      "calibrationSlope",
      "calibrationIntercept",
      "replacementLevel",
      "pointsPerWin",
      "posterior",
      "P",
      "M6",
      "2025-26 provisional WAR",
    ],
    nuance:
      "combined/paired ratio ≡ 2 by definition; bug confirmed by LOO netRating units × former combined exposure, equivalence of paired/combined formulations, and team-wins slope 0.555→1.109",
    PRODUCTION_WAR_CHANGED: true,
    PRODUCTION_DRBL_RATE_CHANGED: false,
    CALIBRATION_REFIT: false,
  };

  await writeFile(
    path.join(OUT, "00_unit_repair_deploy.json"),
    JSON.stringify(report, null, 2)
  );
  await writeFile(
    path.join(OUT, "01_representative_war.csv"),
    [
      "player,warV400,warV401,ratio,combined,paired",
      ...samples.map(
        (s) =>
          `${JSON.stringify(s.player)},${s.warV400},${s.warV401},${s.ratio},${s.combinedPossessionAppearances},${s.pairedOnCourtPossessions}`
      ),
    ].join("\n") + "\n"
  );

  await writeFile(
    path.join(OUT, "02_deploy_notes.md"),
    `# WAR 4.0.1 unit repair deployed

## Scope

Exposure-only unit repair for **2024-25** calibrated WAR.

\`\`\`text
WAR = (finalAbilityPaired - replacementPaired) × pairedOnCourtPossessions / 100 / PPW
pairedOnCourtPossessions = combinedPossessionAppearances / 2
\`\`\`

Frozen (unchanged):

- slope = ${slope}
- intercept = ${intercept}
- replacement = ${repl}
- pointsPerWin = ${ppw}

## Naming

- \`combinedPossessionAppearances\` = N_off + N_def (raw rate denominator; board \`actualPossessions\`)
- \`pairedOnCourtPossessions\` = (N_off + N_def) / 2 (WAR exposure)

## Nuance

\`N_combined / N_paired ≡ 2\` by definition of the paired formula.
Independent confirmation of the bug remains: LOO netRating units × former combined exposure, candidate equivalence, team-wins slope improvement.

## WAR model calibration

**Not solved.** Remaining empirical factor ≈ 2.918 still open.

## Verification

exactHalfMatches=${halfMatch}/${players.length}
maxAbsRatioDeviationFromHalf=${maxRatioDev}

## Next

Freeze WAR. Proceed to Approach A vs B on research base P.
`
  );

  // Update m16e1 repair candidate status
  await writeFile(
    path.join(ROOT, "reports/m16e1/12_war_repair_candidate.md"),
    `# WAR_REPAIR_CANDIDATE_V1 - DEPLOYED as WAR 4.0.1

Status: **DEPLOYED** (unit repair only; ${new Date().toISOString()})

## What changed

Exposure basis only: \`pairedOnCourtPossessions = combinedPossessionAppearances / 2\`.

Frozen: LOO slope ${slope}, replacement ${repl}, PPW ${ppw}.

## What did NOT change

- WAR model calibration (remaining ~2.918 factor)
- Replacement definition/semantics
- PPW
- Posterior / P / M6
- 2025-26 provisional WAR

## Nuance

\`mean combined/paired ratio = 2\` is **by definition**, not independent evidence.
Independent evidence: LOO netRating units × prior combined exposure; formulation equivalence; team-wins slope 0.555 → 1.109.

See \`reports/m16e1-deploy/\`.
`
  );

  console.log(JSON.stringify(report, null, 2));
}

function pickWarFields(u: Record<string, unknown>) {
  return {
    combinedPossessionAppearances: u.combinedPossessionAppearances,
    pairedOnCourtPossessions: u.pairedOnCourtPossessions,
    seasonImpactAboveReplacement: u.seasonImpactAboveReplacement,
    aboveReplacementDRBL100: u.aboveReplacementDRBL100,
    drblWar: u.drblWar,
    seasonWar: u.seasonWar,
    finalRankingScore: u.finalRankingScore,
    drblWaa: u.drblWaa,
    warFormulaVersion: u.warFormulaVersion,
    warFormulaVersionPrevious: u.warFormulaVersionPrevious,
    warExposureUnit: u.warExposureUnit,
    warV400Audit: u.warV400Audit,
    rank: u.rank,
  };
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
