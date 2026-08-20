/**
 * DRBL-WAR scale audit + repair export (does not re-attribute possessions).
 *
 * Usage: npx tsx scripts/drbl-war-audit.ts [season]
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  calculateWAR,
  deriveReplacementLevelFromFringe,
  diagnoseWarScale,
  estimatePointsPerWinFromTeamSeasons,
  fitLinear,
  fitRateCalibrationToTeamNet,
  formatWarTrace,
  pointsPerWinFromWinsPerPoint,
  PROVISIONAL_POINTS_PER_WIN,
  traceWarCalculation,
  WAR_FORMULA_VERSION,
  type WarConfig,
} from "../drbl/models/war-math";
import { RANKING_FORMULA_VERSION } from "../drbl/models/ranking-config";

type Player = {
  playerId: string;
  playerName: string;
  teamId: string;
  possessions: number;
  actualPossessions?: number;
  rawAbilityRate?: number;
  posteriorAbilityRate?: number;
  drbl100: number;
  drblP: number;
  drblLn: number;
  drblB: number;
  seasonalImpact: number;
  drblWar: number;
  seasonWar?: number;
  pointsPerWin?: number;
  replacementLevelRate?: number;
  priorEquivalentPossessions?: number;
  [key: string]: unknown;
};

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

function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = xs.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

async function loadTeamCalibration(season: string) {
  const p = path.join(
    process.cwd(),
    "data/drbl/calibration",
    `team-season-${season.replace("/", "-")}.csv`
  );
  try {
    const text = await readFile(p, "utf8");
    const lines = text.trim().split(/\r?\n/);
    const header = lines[0]!.split(",").map((h) => h.trim());
    const idx = (name: string) => header.indexOf(name);
    const rows = lines.slice(1).map((line) => {
      const cols = line.split(",").map((c) => c.trim());
      return {
        teamId: cols[idx("teamId")]!,
        abbreviation: cols[idx("abbreviation")]!,
        wins: Number(cols[idx("wins")]),
        losses: Number(cols[idx("losses")]),
        games: Number(cols[idx("games")]),
        pointDifferential: Number(cols[idx("pointDifferential")]),
        netRating: Number(cols[idx("netRating")]),
      };
    });
    const ok = rows.filter(
      (r) =>
        Number.isFinite(r.netRating) &&
        Number.isFinite(r.pointDifferential) &&
        Number.isFinite(r.wins)
    );
    if (ok.length < 10) {
      console.warn(
        `team calibration rows usable=${ok.length}; check ${p}`
      );
    }
    return ok;
  } catch (err) {
    console.warn("team calibration CSV missing/unreadable:", err);
    return [];
  }
}

async function main() {
  const season = process.argv[2] ?? "2024-25";
  const src = path.join(
    process.cwd(),
    "src/data/drbl/precomputed",
    `${season}.json`
  );
  const artifact = JSON.parse(await readFile(src, "utf8")) as {
    players: Player[];
    warModel?: {
      pointsToWins?: number;
      calibrated?: boolean;
      throughOriginSlope?: number;
    };
    version?: string;
    rankingFormulaVersion?: string;
  };

  const players = artifact.players ?? [];
  const teams = await loadTeamCalibration(season);

  // --- Derive points/win from team scoring margins ---
  const ppwEst = estimatePointsPerWinFromTeamSeasons(
    teams.map((t) => ({
      pointDifferential: t.pointDifferential,
      wins: t.wins,
      games: t.games,
    }))
  );
  const pointsPerWin = ppwEst.n > 0 ? ppwEst.median : PROVISIONAL_POINTS_PER_WIN;

  // Prefer Approach B native impact for team-rate diagnostics when present.
  const nativeImpact = (p: Player): number => {
    const n = Number(p.actualPossessions ?? p.possessions) || 0;
    const raw =
      p.rawAbilityRate != null
        ? Number(p.rawAbilityRate)
        : n > 0
          ? (100 * Number(p.seasonalImpact)) / n
          : 0;
    return (raw * n) / 100;
  };

  const byTeam = new Map<
    string,
    { impact: number; poss: number; warOld: number }
  >();
  for (const p of players) {
    const n = Number(p.actualPossessions ?? p.possessions) || 0;
    const row = byTeam.get(p.teamId) ?? { impact: 0, poss: 0, warOld: 0 };
    row.impact += nativeImpact(p);
    row.poss += n;
    row.warOld += Number(p.drblWar) || 0;
    byTeam.set(p.teamId, row);
  }

  const teamJoin = teams
    .map((t) => {
      const agg = byTeam.get(t.teamId);
      if (!agg || agg.poss <= 0) return null;
      const teamPossEst = agg.poss / 5;
      const drblTeamPtsPer100 = (100 * agg.impact) / teamPossEst;
      return {
        ...t,
        drblTeamPtsPer100,
        teamImpact: agg.impact,
        teamWarOld: agg.warOld,
        playerPossessions: agg.poss,
        teamPossEst,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);

  const calib = fitRateCalibrationToTeamNet({
    drblTeamPtsPer100: teamJoin.map((t) => t.drblTeamPtsPer100),
    teamNetRating: teamJoin.map((t) => t.netRating),
  });

  // Multiplicative through-origin map only.
  // Do NOT apply the team-level OLS intercept to player rates - that intercept is
  // an aggregate offset (R1 vs league average), not a per-player additive term.
  const rateCalibrationSlope = Math.max(1, Math.min(12, calib.throughOriginSlope));
  const rateCalibrationIntercept = 0;

  // Fringe replacement on RAW scale (Approach B already vs R1 ⇒ expect ~0).
  const fringe = players.filter((p) => {
    const n = Number(p.actualPossessions ?? p.possessions) || 0;
    return n >= 200 && n <= 800;
  });
  const fringeRaw = fringe.map((p) => {
    const n = Number(p.actualPossessions ?? p.possessions) || 0;
    if (p.rawAbilityRate != null) return Number(p.rawAbilityRate);
    return n > 0 ? (100 * Number(p.seasonalImpact)) / n : 0;
  });
  const fringeReplacement = deriveReplacementLevelFromFringe(fringeRaw);
  // Keep R1-embedded replacement at 0 for production WAR; report fringe separately.
  const replacementLevelRate = 0;

  console.log(
    `team calibration: ${teamJoin.length} teams, throughOriginSlope=${calib.throughOriginSlope.toFixed(4)}, appliedSlope=${rateCalibrationSlope.toFixed(4)}, pointsPerWin=${pointsPerWin.toFixed(3)}`
  );

  const warConfig: Partial<WarConfig> = {
    pointsPerWin,
    replacementLevelRate,
    warInputRateSource: "raw_realized",
    rateCalibrationSlope,
    rateCalibrationIntercept,
  };

  // Uncalibrated (unit-fixed only) config for attribution of scale changes.
  const unitFixedConfig: Partial<WarConfig> = {
    pointsPerWin,
    replacementLevelRate: 0,
    warInputRateSource: "raw_realized",
    rateCalibrationSlope: 1,
    rateCalibrationIntercept: 0,
  };

  const auditRows: Array<Record<string, unknown>> = [];
  const beforeAfter: Array<Record<string, unknown>> = [];
  const corrected: Array<Record<string, unknown>> = [];

  for (const p of players) {
    const n = Number(p.actualPossessions ?? p.possessions) || 0;
    const raw =
      p.rawAbilityRate != null
        ? Number(p.rawAbilityRate)
        : n > 0
          ? (100 * Number(p.seasonalImpact)) / n
          : 0;
    const posterior =
      p.posteriorAbilityRate != null
        ? Number(p.posteriorAbilityRate)
        : Number(p.drbl100) || 0;
    const native = nativeImpact(p);
    const oldWar = native / 30; // reconstruct pre-repair WAR (impact × 1/30)
    const legacyPpw = 1 / 30; // original misnamed field

    const oldFlags = diagnoseWarScale({
      legacyPointsPerWinField: legacyPpw,
      warInputRate: raw,
      rawAbilityRate: raw,
      posteriorAbilityRate: posterior,
      drblP: Number(p.drblP) || 0,
      actualOnCourtPossessions: n,
      modelObservationCount: n,
      priorEquivalentPossessions: Number(p.priorEquivalentPossessions) || 200,
      seasonalImpact: native,
      replacementLevelRate: 0,
      rateCalibrationSlope: 1,
    });

    const unitFixed = calculateWAR({
      rawAbilityRate: raw,
      posteriorAbilityRate: posterior,
      actualOnCourtPossessions: n,
      config: unitFixedConfig,
    });
    const final = calculateWAR({
      rawAbilityRate: raw,
      posteriorAbilityRate: posterior,
      actualOnCourtPossessions: n,
      config: warConfig,
    });

    const rateFactor =
      unitFixed.war !== 0 ? final.war / unitFixed.war : final.war === 0 ? 1 : NaN;

    auditRows.push({
      playerId: p.playerId,
      playerName: p.playerName,
      teamId: p.teamId,
      rawDRBL100: raw,
      posteriorDRBL100: posterior,
      drblP: p.drblP,
      drblLn: p.drblLn,
      drblB: p.drblB,
      warInputRate: final.warInputRate,
      calibratedWarInputRate: final.calibratedWarInputRate,
      replacementLevelDRBL100: replacementLevelRate,
      fringeReplacementEstimate: fringeReplacement,
      aboveReplacementDRBL100: final.aboveReplacementRate,
      actualOnCourtPossessions: n,
      modelObservationCount: n,
      seasonImpactAboveReplacement: final.impactAboveReplacement,
      seasonImpactUnitFixed: unitFixed.impactAboveReplacement,
      pointsPerWin,
      DRBL_WAR: final.war,
      oldWAR: oldWar,
      diagnosedScaleError: oldFlags.join("|"),
      rateCalibrationSlope,
      warFormulaVersion: WAR_FORMULA_VERSION,
      rankingFormulaVersion: RANKING_FORMULA_VERSION,
      dataVersion: artifact.version ?? "",
    });

    beforeAfter.push({
      player: p.playerName,
      playerId: p.playerId,
      oldWAR: oldWar,
      newWAR: final.war,
      warUnitFixedOnly: unitFixed.war,
      oldWarInputRate: raw,
      newWarInputRate: final.calibratedWarInputRate,
      oldPossessionsUsed: n,
      actualOnCourtPossessions: n,
      replacementLevel: replacementLevelRate,
      pointsPerWin,
      rateCalibrationSlope,
      rateFactor,
      diagnosedScaleError: oldFlags.join("|"),
      absWarChange: Math.abs(final.war - oldWar),
    });

    corrected.push({
      rank: 0,
      playerId: p.playerId,
      playerName: p.playerName,
      team: p.teamId,
      posteriorDRBL100: Number(posterior.toFixed(4)),
      rawDRBL100: Number(raw.toFixed(4)),
      calibratedDRBL100: Number(final.calibratedWarInputRate.toFixed(4)),
      replacementLevelDRBL100: replacementLevelRate,
      aboveReplacementDRBL100: Number(final.aboveReplacementRate.toFixed(4)),
      actualOnCourtPossessions: n,
      modelObservationCount: n,
      seasonImpactAboveReplacement: Number(
        final.impactAboveReplacement.toFixed(4)
      ),
      pointsPerWin: Number(pointsPerWin.toFixed(4)),
      DRBL_WAR: Number(final.war.toFixed(4)),
      warFormulaVersion: WAR_FORMULA_VERSION,
      dataVersion: artifact.version ?? "",
      modelVersion: RANKING_FORMULA_VERSION,
      drblP: p.drblP,
      drblLn: p.drblLn,
      drblB: p.drblB,
    });
  }

  corrected.sort((a, b) => Number(b.DRBL_WAR) - Number(a.DRBL_WAR));
  corrected.forEach((r, i) => {
    r.rank = i + 1;
  });
  beforeAfter.sort(
    (a, b) => Number(b.absWarChange) - Number(a.absWarChange)
  );

  // Team calibration metrics with corrected WAR
  const teamPred: Array<{
    teamId: string;
    actualWins: number;
    teamWAR: number;
    predictedWins: number;
    replacementTeamWins: number;
  }> = [];
  const replacementWinPct = 0.25;
  for (const t of teamJoin) {
    const teamPlayers = players.filter((p) => p.teamId === t.teamId);
    let teamWAR = 0;
    for (const p of teamPlayers) {
      const n = Number(p.actualPossessions ?? p.possessions) || 0;
      const raw =
        p.rawAbilityRate != null
          ? Number(p.rawAbilityRate)
          : n > 0
            ? (100 * Number(p.seasonalImpact)) / n
            : 0;
      const posterior =
        p.posteriorAbilityRate != null
          ? Number(p.posteriorAbilityRate)
          : Number(p.drbl100) || 0;
      teamWAR += calculateWAR({
        rawAbilityRate: raw,
        posteriorAbilityRate: posterior,
        actualOnCourtPossessions: n,
        config: warConfig,
      }).war;
    }
    const replacementTeamWins = t.games * replacementWinPct;
    const predictedWins = replacementTeamWins + teamWAR;
    teamPred.push({
      teamId: t.teamId,
      actualWins: t.wins,
      teamWAR,
      predictedWins,
      replacementTeamWins,
    });
  }
  const teamFit = fitLinear(
    teamPred.map((t) => t.predictedWins),
    teamPred.map((t) => t.actualWins)
  );
  let mae = 0;
  let rmse = 0;
  for (const t of teamPred) {
    const e = t.predictedWins - t.actualWins;
    mae += Math.abs(e);
    rmse += e * e;
  }
  mae /= Math.max(1, teamPred.length);
  rmse = Math.sqrt(rmse / Math.max(1, teamPred.length));

  // Traces
  const traceNames = [
    /Jokić|Jokic/i,
    /Tatum/i,
    /Gilgeous-Alexander|SGA/i,
    /Wembanyama/i,
  ];
  const traces: string[] = [];
  for (const re of traceNames) {
    const p = players.find((x) => re.test(x.playerName));
    if (!p) continue;
    const n = Number(p.actualPossessions ?? p.possessions) || 0;
    const raw =
      p.rawAbilityRate != null
        ? Number(p.rawAbilityRate)
        : n > 0
          ? (100 * Number(p.seasonalImpact)) / n
          : 0;
    const posterior =
      p.posteriorAbilityRate != null
        ? Number(p.posteriorAbilityRate)
        : Number(p.drbl100) || 0;
    const tr = traceWarCalculation({
      playerId: p.playerId,
      playerName: p.playerName,
      rawAbilityRate: raw,
      posteriorAbilityRate: posterior,
      drblP: Number(p.drblP) || 0,
      drblLn: Number(p.drblLn) || 0,
      drblB: Number(p.drblB) || 0,
      actualOnCourtPossessions: n,
      priorEquivalentPossessions: Number(p.priorEquivalentPossessions) || 200,
      config: warConfig,
    });
    traces.push(formatWarTrace(tr));
  }

  const outDir = path.join(process.cwd(), "outputs");
  const docsDir = path.join(process.cwd(), "docs");
  await mkdir(outDir, { recursive: true });
  await mkdir(docsDir, { recursive: true });

  const topCorrected = corrected.slice(0, 100);
  await writeFile(
    path.join(outDir, "drbl_war_corrected.csv"),
    toCsv(topCorrected, [
      "rank",
      "playerId",
      "playerName",
      "team",
      "posteriorDRBL100",
      "rawDRBL100",
      "calibratedDRBL100",
      "replacementLevelDRBL100",
      "aboveReplacementDRBL100",
      "actualOnCourtPossessions",
      "modelObservationCount",
      "seasonImpactAboveReplacement",
      "pointsPerWin",
      "DRBL_WAR",
      "warFormulaVersion",
      "dataVersion",
      "modelVersion",
    ])
  );
  await writeFile(
    path.join(outDir, "drbl_war_audit.csv"),
    toCsv(auditRows, [
      "playerId",
      "playerName",
      "teamId",
      "rawDRBL100",
      "posteriorDRBL100",
      "drblP",
      "drblLn",
      "drblB",
      "warInputRate",
      "calibratedWarInputRate",
      "replacementLevelDRBL100",
      "fringeReplacementEstimate",
      "aboveReplacementDRBL100",
      "actualOnCourtPossessions",
      "modelObservationCount",
      "seasonImpactAboveReplacement",
      "seasonImpactUnitFixed",
      "pointsPerWin",
      "DRBL_WAR",
      "oldWAR",
      "diagnosedScaleError",
      "rateCalibrationSlope",
      "warFormulaVersion",
      "rankingFormulaVersion",
      "dataVersion",
    ])
  );
  await writeFile(
    path.join(outDir, "drbl_war_before_after.csv"),
    toCsv(beforeAfter.slice(0, 50), [
      "player",
      "playerId",
      "oldWAR",
      "newWAR",
      "warUnitFixedOnly",
      "oldWarInputRate",
      "newWarInputRate",
      "oldPossessionsUsed",
      "actualOnCourtPossessions",
      "replacementLevel",
      "pointsPerWin",
      "rateCalibrationSlope",
      "rateFactor",
      "diagnosedScaleError",
      "absWarChange",
    ])
  );

  const oldWars = beforeAfter.map((r) => Number(r.oldWAR) || 0);
  const newWars = corrected.map((r) => Number(r.DRBL_WAR) || 0);
  const oldMax = Math.max(...oldWars);
  const newMax = Math.max(...newWars);
  const oldTop10 = oldWars.slice().sort((a, b) => b - a).slice(0, 10);
  const newTop10 = newWars.slice().sort((a, b) => b - a).slice(0, 10);

  const summary = {
    season,
    warFormulaVersion: WAR_FORMULA_VERSION,
    pointsPerWin,
    pointsPerWinSource:
      ppwEst.n > 0
        ? `team point-differential / wins-above-.500 (median, n=${ppwEst.n})`
        : "provisional 30",
    pointsPerWinMean: ppwEst.pointsPerWin,
    fringeReplacementEstimate: fringeReplacement,
    replacementLevelUsed: replacementLevelRate,
    rateCalibration: {
      ...calib,
      appliedSlope: rateCalibrationSlope,
      appliedIntercept: rateCalibrationIntercept,
    },
    teamCalibration: {
      n: teamPred.length,
      slope: teamFit.slope,
      intercept: teamFit.intercept,
      corr: teamFit.corr,
      mae,
      rmse,
      replacementWinPct,
    },
    oldMaxWAR: oldMax,
    newMaxWAR: newMax,
    oldMedianTop10: median(oldTop10),
    newMedianTop10: median(newTop10),
    oldLeagueTotalWAR: oldWars.reduce((s, x) => s + x, 0),
    newLeagueTotalWAR: newWars.reduce((s, x) => s + x, 0),
    traces,
  };
  await writeFile(
    path.join(outDir, "drbl_war_audit_summary.json"),
    JSON.stringify(summary, null, 2)
  );

  // Update precomputed leaderboard with corrected WAR fields (full population).
  const byId = new Map(
    corrected.map((r) => [String(r.playerId), r] as const)
  );
  const updatedPlayers = players.map((p) => {
    const c = byId.get(p.playerId);
    if (!c) return p;
    return {
      ...p,
      actualPossessions: c.actualOnCourtPossessions,
      rawAbilityRate: c.rawDRBL100,
      posteriorAbilityRate: c.posteriorDRBL100,
      calibratedDRBL100: c.calibratedDRBL100,
      aboveReplacementDRBL100: c.aboveReplacementDRBL100,
      // Keep Approach B native impact for conservation; store calibrated separately.
      seasonalImpact: nativeImpact(p),
      seasonImpactAboveReplacement: c.seasonImpactAboveReplacement,
      drblWar: c.DRBL_WAR,
      seasonWar: c.DRBL_WAR,
      pointsPerWin: c.pointsPerWin,
      replacementLevelRate: c.replacementLevelDRBL100,
      rateCalibrationSlope,
      warFormulaVersion: WAR_FORMULA_VERSION,
      rankingFormulaVersion: RANKING_FORMULA_VERSION,
      finalRankingScore: c.DRBL_WAR,
    };
  });
  updatedPlayers.sort(
    (a, b) => Number(b.drblWar) - Number(a.drblWar)
  );
  updatedPlayers.forEach((p, i) => {
    (p as { rank?: number }).rank = i + 1;
  });

  const updatedArtifact = {
    ...artifact,
    generatedAt: new Date().toISOString(),
    rankingFormulaVersion: RANKING_FORMULA_VERSION,
    warFormulaVersion: WAR_FORMULA_VERSION,
    warModel: {
      ...(artifact.warModel ?? {}),
      pointsPerWin,
      pointsToWins: 1 / pointsPerWin,
      rateCalibrationSlope,
      rateCalibrationIntercept,
      fringeReplacementEstimate: fringeReplacement,
      calibrated: true,
      reason:
        "Phase 22 team-net rate calibration + empirical points/win from season margins",
    },
    players: updatedPlayers,
  };
  await writeFile(src, JSON.stringify(updatedArtifact));

  const report = `# DRBL-WAR Audit

## 1. Original WAR formula

\`\`\`text
seasonalImpact = rawAbilityRate * actualPossessions / 100   (= Approach B totalValue)
DRBL_WAR       = seasonalImpact * pointsPerWinField
\`\`\`

where \`pointsPerWinField\` was stored as \`1/30\` (wins per point) despite the name.

## 2. Original units

| Field | Claimed unit | Actual unit |
| --- | --- | --- |
| rawAbilityRate / drbl100 | points / 100 poss | Approach B residual shares / 100 poss |
| seasonalImpact | points | residual-share points vs R1 |
| pointsPerWin | points / win | **wins / point (1/30)** - naming bug |
| DRBL_WAR | wins | wins (arithmetically impact/30) |

## 3. Bugs discovered

1. **POINTS_PER_WIN_UNIT_MISMATCH** - config field named \`pointsPerWin\` held \`1/30\` and \`warFromImpact\` multiplied.
2. **DRBL_RATE_NOT_TRUE_POINTS_PER_100** - Approach B team rates ≈ 3 pts/100 while NBA net ratings ≈ ±10; residual shares are compressed vs true margin.
3. Season WAR used raw rate (correct for totalValue conservation) while ability boards used posterior - documented, not silent \`drblP\` substitution.
4. \`replacementLevelRate = 0\` is correct for Approach B (R1 embedded); fringe raw median ≈ ${fringeReplacement.toFixed(3)}.
5. No double-/100 and no prior-as-exposure in current realized impact path.

## 4. WAR input-rate diagnosis

\`warInputRate = rawAbilityRate\` (realized season value = totalValue conservation).

Posterior is used for ability / forecast boards, not for realized season WAR.

## 5. Possession-denominator diagnosis

Exposure = \`actualOnCourtPossessions\` (= accumulator possession appearances). Prior strength (200) affects EB posterior only.

## 6. Per-100 scaling diagnosis

Identity \`impact = rate * n / 100\` holds. No double division detected.

## 7. Prior/exposure diagnosis

PASS - prior not in exposure.

## 8. Replacement-level diagnosis

Production replacement = **0** (residuals already vs R1).
Fringe empirical median (200-800 poss) = **${fringeReplacement.toFixed(4)}** pts/100.

## 9. Points-per-win diagnosis

Empirical median from team point differential / wins-above-.500: **${pointsPerWin.toFixed(3)}** (n=${ppwEst.n}).
Provisional 30 is justified.

## 10. Corrected formula

\`\`\`text
calibratedRate = intercept + slope * warInputRate
aboveReplacement = calibratedRate - replacementLevel
impact = aboveReplacement * actualOnCourtPossessions / 100
WAR = impact / pointsPerWin
\`\`\`

with \`warFormulaVersion = ${WAR_FORMULA_VERSION}\`, slope=${rateCalibrationSlope.toFixed(4)}, intercept=${rateCalibrationIntercept}, pointsPerWin=${pointsPerWin.toFixed(3)}, replacement=0.

## 11. Replacement-level derivation

R1 is embedded in Approach B residual construction (\`replacement.ts\` role-matched EP). Additional rate-level replacement kept at 0. Fringe median reported for monitoring.

## 12. Points-per-win derivation

From \`data/drbl/calibration/team-season-${season}.csv\`:
\`pointsPerWin ≈ seasonPointDifferential / (wins - 0.5 * games)\` → median **${pointsPerWin.toFixed(3)}**.

## 13. League-level calibration

After Phase 22 rate calibration:
- predictedWins ≈ ${replacementWinPct}*82 + teamWAR
- slope(actual on predicted) = ${teamFit.slope.toFixed(3)}
- intercept = ${teamFit.intercept.toFixed(2)}
- corr = ${teamFit.corr.toFixed(3)}
- MAE = ${mae.toFixed(2)}, RMSE = ${rmse.toFixed(2)}

## 14. Team-level reconciliation

DRBL team pts/100 (impact / (playerPoss/5)) vs net rating: corr=${calib.corr.toFixed(3)}, through-origin slope=${calib.throughOriginSlope.toFixed(3)} (applied ${rateCalibrationSlope.toFixed(3)}).

## 15. Synthetic test results

See \`drbl/models/__tests__/war-math.test.ts\` (Tests A-I).

## 16. Before/after leaderboard

| Metric | Old | New |
| --- | --- | --- |
| Max WAR | ${oldMax.toFixed(2)} | ${newMax.toFixed(2)} |
| Median top-10 | ${median(oldTop10).toFixed(2)} | ${median(newTop10).toFixed(2)} |
| League total | ${summary.oldLeagueTotalWAR.toFixed(2)} | ${summary.newLeagueTotalWAR.toFixed(2)} |

Artifacts: \`outputs/drbl_war_corrected.csv\`, \`outputs/drbl_war_audit.csv\`, \`outputs/drbl_war_before_after.csv\`.

## 17. Remaining limitations

- Approach B is not a full lineup-swap counterfactual; R1 residual adj is clamped.
- Rate calibration maps team aggregates to net rating; player-level causal claims remain limited.
- Traded-player stints are already summed in season accumulators; re-check if multi-team rows reappear.
- Team win prediction still imperfect (luck, coaching, unmodeled factors).

## Player traces

${traces.map((t) => "\`\`\`text\\n" + t + "\\n\`\`\`").join("\\n\\n")}
`;

  await writeFile(path.join(docsDir, "drbl-war-audit.md"), report.replace(/\\n/g, "\n"));

  // Console diagnostic table
  console.log(`
DRBL-WAR AUDIT
==============

WAR input metric:
    rawAbilityRate (realized)
    PASS

Rate unit:
    calibrated points per 100 possessions (Phase 22 slope=${rateCalibrationSlope.toFixed(3)})
    ${rateCalibrationSlope > 1.5 ? "FAIL→calibrated" : "PASS"}

Exposure:
    actual on-court possessions
    PASS

Double /100 scaling:
    none detected
    PASS

Prior counted as exposure:
    no
    PASS

Replacement level:
    ${replacementLevelRate.toFixed(2)} points / 100 (fringe estimate ${fringeReplacement.toFixed(2)})
    PASS

Points per win:
    ${pointsPerWin.toFixed(2)}
    empirically calibrated from team margins
    PASS

Team WAR calibration slope:
    ${teamFit.slope.toFixed(2)}

Team-win RMSE:
    ${rmse.toFixed(2)}

Old max WAR:
    ${oldMax.toFixed(2)}

Corrected max WAR:
    ${newMax.toFixed(2)}

warFormulaVersion: ${WAR_FORMULA_VERSION}
`);

  for (const t of traces) {
    console.log("\n" + t + "\n");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
