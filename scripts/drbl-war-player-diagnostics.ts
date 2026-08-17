/**
 * Player-level WAR diagnostic table + aggregate replacement/correlation checks.
 *
 * Usage: npx tsx scripts/drbl-war-player-diagnostics.ts [season]
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type Player = {
  playerId: string;
  playerName: string;
  teamId: string;
  actualPossessions?: number;
  possessions: number;
  rawAbilityRate?: number;
  posteriorAbilityRate?: number;
  drbl100: number;
  drblO?: number;
  drblD?: number;
  creationValuePer100?: number;
  executionValuePer100?: number;
  defensiveValuePer100?: number;
  seasonalImpact: number;
  seasonImpactAboveReplacement?: number;
  drblWar: number;
  pointsPerWin?: number;
  replacementLevelRate?: number;
  rateCalibrationSlope?: number;
  calibratedDRBL100?: number;
  aboveReplacementDRBL100?: number;
};

type Pos = "PG" | "SG" | "SF" | "PF" | "C" | "UNKNOWN";

function corr(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return NaN;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    const x = xs[i]!;
    const y = ys[i]!;
    sx += x;
    sy += y;
    sxx += x * x;
    syy += y * y;
    sxy += x * y;
  }
  const mx = sx / n;
  const my = sy / n;
  const num = sxy - n * mx * my;
  const den = Math.sqrt((sxx - n * mx * mx) * (syy - n * my * my));
  return den > 1e-12 ? num / den : NaN;
}

function stats(xs: number[]) {
  if (!xs.length) {
    return { n: 0, mean: NaN, median: NaN, sd: NaN, min: NaN, max: NaN };
  }
  const sorted = xs.slice().sort((a, b) => a - b);
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  const sd = Math.sqrt(
    xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length
  );
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2
      ? sorted[mid]!
      : (sorted[mid - 1]! + sorted[mid]!) / 2;
  return {
    n: xs.length,
    mean,
    median,
    sd,
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
  };
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

function groupStats(
  rows: Array<{ key: string; value: number }>
): Array<Record<string, unknown>> {
  const map = new Map<string, number[]>();
  for (const r of rows) {
    const arr = map.get(r.key) ?? [];
    arr.push(r.value);
    map.set(r.key, arr);
  }
  return [...map.entries()]
    .map(([key, vals]) => ({ key, ...stats(vals) }))
    .sort((a, b) => String(a.key).localeCompare(String(b.key)));
}

/** Soft position proxy removed — incorrect labels are worse than missing. */
function resolvePosition(_p: Player): { position: string; positionSource: string } {
  return { position: "UNKNOWN", positionSource: "unavailable" };
}

function inferArchetype(p: Player): string {
  // Legacy name kept for script compatibility; prefer pipeline remaster archetypes.
  const create = Number(p.creationValuePer100) || 0;
  const exec = Number(p.executionValuePer100) || 0;
  const def = Number(p.defensiveValuePer100) || 0;
  const connect = Number(p.connectionValuePer100) || 0;
  // Behavior-only (no DRBL/WAR).
  const scores = [
    ["creator", Math.max(0, create)],
    ["connector", Math.max(0, connect)],
    ["finisher", Math.max(0, exec - Math.max(0, create))],
    ["defender", Math.max(0, def)],
  ] as const;
  scores.sort((a, b) => b[1] - a[1]);
  const top = scores[0]!;
  return top[1] < 0.05 ? "uncertain" : top[0];
}

async function tryLoadPositions(
  season: string
): Promise<Map<string, Pos>> {
  const out = new Map<string, Pos>();
  try {
    const mod = await import("../src/data/queries/players");
    const rows = await Promise.race([
      mod.getFilteredPlayerSeasons({ season }),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error("position lookup timeout")), 45000)
      ),
    ]);
    for (const r of rows) {
      const pos = (r.position as Pos | undefined) ?? "UNKNOWN";
      if (r.playerId) out.set(String(r.playerId), pos);
    }
  } catch {
    // Fall back to proxy positions from DRBL components.
  }
  return out;
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
      pointsPerWin?: number;
      rateCalibrationSlope?: number;
      rateCalibrationIntercept?: number;
      fringeReplacementEstimate?: number;
    };
  };

  const players = artifact.players ?? [];
  const posMap = await tryLoadPositions(season);
  const defaultPpw =
    artifact.warModel?.pointsPerWin ??
    players[0]?.pointsPerWin ??
    30;
  const defaultSlope =
    artifact.warModel?.rateCalibrationSlope ??
    players[0]?.rateCalibrationSlope ??
    1;
  const defaultIntercept =
    artifact.warModel?.rateCalibrationIntercept ?? 0;
  const replacementLevelUsed =
    players[0]?.replacementLevelRate ?? 0;

  const rows: Array<Record<string, unknown>> = [];

  for (const p of players) {
    const n = Math.max(0, Number(p.actualPossessions ?? p.possessions) || 0);
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
    const ppw = Number(p.pointsPerWin) || defaultPpw;
    const slope = Number(p.rateCalibrationSlope) || defaultSlope;
    const calibrated =
      p.calibratedDRBL100 != null
        ? Number(p.calibratedDRBL100)
        : defaultIntercept + slope * raw;
    const above =
      p.aboveReplacementDRBL100 != null
        ? Number(p.aboveReplacementDRBL100)
        : calibrated - replacementLevelUsed;
    const impact =
      p.seasonImpactAboveReplacement != null
        ? Number(p.seasonImpactAboveReplacement)
        : (above * n) / 100;
    const calculatedWAR = ppw > 0 ? impact / ppw : 0;
    const displayedWAR = Number(p.drblWar) || 0;
    const warPer100 = n > 0 ? (displayedWAR * 100) / n : 0;
    // Invert displayed WAR through the identity to recover implied replacement.
    // displayedWAR = (calibratedRate - impliedRepl) * n / 100 / ppw
    // => impliedRepl = calibratedRate - displayedWAR * ppw * 100 / n
    const impliedReplacementLevel =
      n > 0 && ppw > 0
        ? calibrated - (displayedWAR * ppw * 100) / n
        : NaN;

    const rosterPos = posMap.get(p.playerId);
    const resolved =
      rosterPos && rosterPos !== "UNKNOWN"
        ? { position: rosterPos, positionSource: "roster" as const }
        : resolvePosition(p);
    const position = resolved.position;
    const positionSource = resolved.positionSource;
    const archetype = inferArchetype(p);

    rows.push({
      player: p.playerName,
      playerId: p.playerId,
      teamId: p.teamId,
      position,
      positionSource,
      archetype,
      rawDRBL: Number(raw.toFixed(6)),
      posteriorDRBL100: Number(posterior.toFixed(6)),
      calibratedDRBL100: Number(calibrated.toFixed(6)),
      actualOnCourtPossessions: n,
      replacementLevelUsed,
      aboveReplacementRate: Number(above.toFixed(6)),
      pointsPerWin: Number(ppw.toFixed(6)),
      calculatedWAR: Number(calculatedWAR.toFixed(8)),
      displayedWAR: Number(displayedWAR.toFixed(8)),
      impliedReplacementLevel: Number(
        (Number.isFinite(impliedReplacementLevel)
          ? impliedReplacementLevel
          : NaN
        ).toFixed(8)
      ),
      WARPer100Possessions: Number(warPer100.toFixed(8)),
      warFormulaResidual: Number((displayedWAR - calculatedWAR).toFixed(10)),
    });
  }

  const eligible = rows.filter(
    (r) => Number(r.actualOnCourtPossessions) >= 50
  );

  const corrDrblWarPer100 = corr(
    eligible.map((r) => Number(r.posteriorDRBL100)),
    eligible.map((r) => Number(r.WARPer100Possessions))
  );
  const corrRawWarPer100 = corr(
    eligible.map((r) => Number(r.rawDRBL)),
    eligible.map((r) => Number(r.WARPer100Possessions))
  );
  const corrCalWarPer100 = corr(
    eligible.map((r) => Number(r.calibratedDRBL100)),
    eligible.map((r) => Number(r.WARPer100Possessions))
  );

  const implied = eligible
    .map((r) => Number(r.impliedReplacementLevel))
    .filter((x) => Number.isFinite(x));
  const impliedStats = stats(implied);

  const byPosition = groupStats(
    eligible.map((r) => ({
      key: String(r.position),
      value: Number(r.impliedReplacementLevel),
    }))
  );
  const byArchetype = groupStats(
    eligible.map((r) => ({
      key: String(r.archetype),
      value: Number(r.impliedReplacementLevel),
    }))
  );
  const byTeam = groupStats(
    eligible.map((r) => ({
      key: String(r.teamId),
      value: Number(r.impliedReplacementLevel),
    }))
  );

  const residuals = eligible.map((r) => Number(r.warFormulaResidual));
  const residualStats = stats(residuals);

  const outDir = path.join(process.cwd(), "outputs");
  await mkdir(outDir, { recursive: true });

  const playerCols = [
    "player",
    "playerId",
    "teamId",
    "position",
    "positionSource",
    "archetype",
    "rawDRBL",
    "posteriorDRBL100",
    "calibratedDRBL100",
    "actualOnCourtPossessions",
    "replacementLevelUsed",
    "aboveReplacementRate",
    "pointsPerWin",
    "calculatedWAR",
    "displayedWAR",
    "impliedReplacementLevel",
    "WARPer100Possessions",
    "warFormulaResidual",
  ];

  await writeFile(
    path.join(outDir, "drbl_war_player_diagnostics.csv"),
    toCsv(rows, playerCols)
  );
  await writeFile(
    path.join(outDir, "drbl_war_replacement_by_position.csv"),
    toCsv(byPosition, ["key", "n", "mean", "median", "sd", "min", "max"])
  );
  await writeFile(
    path.join(outDir, "drbl_war_replacement_by_archetype.csv"),
    toCsv(byArchetype, ["key", "n", "mean", "median", "sd", "min", "max"])
  );
  await writeFile(
    path.join(outDir, "drbl_war_replacement_by_team.csv"),
    toCsv(byTeam, ["key", "n", "mean", "median", "sd", "min", "max"])
  );

  const summary = {
    season,
    nPlayers: rows.length,
    nEligible: eligible.length,
    replacementLevelUsed,
    correlations: {
      posteriorDRBL100_vs_WARPer100: corrDrblWarPer100,
      rawDRBL_vs_WARPer100: corrRawWarPer100,
      calibratedDRBL100_vs_WARPer100: corrCalWarPer100,
    },
    impliedReplacementLevel: impliedStats,
    warFormulaResidual: residualStats,
    byPosition,
    byArchetype,
    positionSourceCounts: {
      roster: rows.filter((r) => r.positionSource === "roster").length,
      unavailable: rows.filter((r) => r.positionSource === "unavailable")
        .length,
      proxy: rows.filter((r) => r.positionSource === "proxy").length,
    },
  };
  await writeFile(
    path.join(outDir, "drbl_war_player_diagnostics_summary.json"),
    JSON.stringify(summary, null, 2)
  );

  const fmt = (x: number, d = 4) =>
    Number.isFinite(x) ? x.toFixed(d) : "NaN";

  console.log(`
DRBL-WAR PLAYER DIAGNOSTICS (${season})
=======================================

Correlation
  posteriorDRBL100 vs WARPer100: ${fmt(corrDrblWarPer100)}
  rawDRBL vs WARPer100:          ${fmt(corrRawWarPer100)}
  calibratedDRBL100 vs WARPer100:${fmt(corrCalWarPer100)}

Replacement level (implied from displayed WAR identity)
  used (config): ${replacementLevelUsed}
  mean:   ${fmt(impliedStats.mean)}
  median: ${fmt(impliedStats.median)}
  SD:     ${fmt(impliedStats.sd)}
  min:    ${fmt(impliedStats.min)}
  max:    ${fmt(impliedStats.max)}

Replacement by position`);
  for (const r of byPosition) {
    console.log(
      `  ${r.key}: mean=${fmt(Number(r.mean))} med=${fmt(Number(r.median))} n=${r.n}`
    );
  }
  console.log(`\nReplacement by archetype`);
  for (const r of byArchetype) {
    console.log(
      `  ${r.key}: mean=${fmt(Number(r.mean))} med=${fmt(Number(r.median))} n=${r.n}`
    );
  }
  console.log(`\nReplacement by team (top |mean|)`);
  const teamSorted = byTeam
    .slice()
    .sort(
      (a, b) => Math.abs(Number(b.mean)) - Math.abs(Number(a.mean))
    );
  for (const r of teamSorted.slice(0, 10)) {
    console.log(
      `  ${r.key}: mean=${fmt(Number(r.mean))} med=${fmt(Number(r.median))} n=${r.n}`
    );
  }

  console.log(`
WAR formula residual (displayedWAR - calculatedWAR)
  mean:   ${fmt(residualStats.mean, 8)}
  median: ${fmt(residualStats.median, 8)}
  SD:     ${fmt(residualStats.sd, 8)}
  min:    ${fmt(residualStats.min, 8)}
  max:    ${fmt(residualStats.max, 8)}

Wrote:
  outputs/drbl_war_player_diagnostics.csv
  outputs/drbl_war_replacement_by_position.csv
  outputs/drbl_war_replacement_by_archetype.csv
  outputs/drbl_war_replacement_by_team.csv
  outputs/drbl_war_player_diagnostics_summary.json
`);

  // Sample rows for chat
  console.log("Sample rows (top 8 by displayedWAR):");
  const top = rows
    .slice()
    .sort((a, b) => Number(b.displayedWAR) - Number(a.displayedWAR))
    .slice(0, 8);
  console.table(
    top.map((r) => ({
      player: r.player,
      pos: r.position,
      raw: r.rawDRBL,
      post: r.posteriorDRBL100,
      poss: r.actualOnCourtPossessions,
      replUsed: r.replacementLevelUsed,
      above: r.aboveReplacementRate,
      ppw: r.pointsPerWin,
      calcWAR: r.calculatedWAR,
      dispWAR: r.displayedWAR,
      impliedRepl: r.impliedReplacementLevel,
      WAR100: r.WARPer100Possessions,
      resid: r.warFormulaResidual,
    }))
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
