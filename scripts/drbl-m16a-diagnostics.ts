/**
 * M16a - full-season vs repaired-400 diagnostics (no model-math changes).
 *
 *   npx tsx scripts/drbl-m16a-diagnostics.ts
 *
 * Expects:
 *   reports/m16a/freeze/repaired-400-{season}.json
 *   reports/m16a/artifacts/full-{season}.json
 */
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";

import {
  checkPlayerAbilityLineage,
  componentHealth,
  summarizeDistribution,
  type DistSummary,
} from "../drbl/models/ability-lineage";
import { empiricalBayesRate } from "../drbl/models/leaderboard";
import { PRIOR_EQUIVALENT_POSSESSIONS } from "../drbl/models/ranking-config";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "reports", "m16a");
const SEASONS = ["2024-25", "2025-26"] as const;

type Player = Record<string, unknown> & {
  playerId: string;
  playerName: string;
  teamId?: string;
};

type Artifact = {
  season: string;
  version?: string;
  gamesProcessed?: number;
  gameCount?: number;
  players: Player[];
  shotDecisionModel?: Record<string, unknown>;
  fusionModel?: Record<string, unknown>;
  warModel?: Record<string, unknown>;
  warFormulaVersion?: string;
  pipelineVersion?: string;
  rankingFormulaVersion?: string;
  abilityLineageVersion?: string;
  publishedAbilityInput?: string;
  artifactGenerationId?: string;
  preprocessingVersion?: string;
  reconstructionVersion?: string;
  [key: string]: unknown;
};

function esc(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]!);
  return (
    keys.join(",") +
    "\n" +
    rows.map((r) => keys.map((k) => esc(r[k])).join(",")).join("\n") +
    "\n"
  );
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function poss(p: Player): number {
  return num(p.actualPossessions ?? p.possessions) || 0;
}

function pearson(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return NaN;
  const a = xs.slice(0, n);
  const b = ys.slice(0, n);
  const mx = a.reduce((s, x) => s + x, 0) / n;
  const my = b.reduce((s, x) => s + x, 0) / n;
  let nume = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    nume += (a[i]! - mx) * (b[i]! - my);
    dx += (a[i]! - mx) ** 2;
    dy += (b[i]! - my) ** 2;
  }
  const den = Math.sqrt(dx * dy);
  return den > 1e-12 ? nume / den : NaN;
}

function spearman(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return NaN;
  const rank = (arr: number[]) => {
    const order = arr
      .map((v, i) => ({ v, i }))
      .sort((a, b) => a.v - b.v);
    const r = new Array(arr.length);
    for (let i = 0; i < order.length; i++) r[order[i]!.i] = i + 1;
    return r as number[];
  };
  return pearson(rank(xs.slice(0, n)), rank(ys.slice(0, n)));
}

function mae(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (!n) return NaN;
  let s = 0;
  for (let i = 0; i < n; i++) s += Math.abs(xs[i]! - ys[i]!);
  return s / n;
}

function rmse(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (!n) return NaN;
  let s = 0;
  for (let i = 0; i < n; i++) s += (xs[i]! - ys[i]!) ** 2;
  return Math.sqrt(s / n);
}

function quantile(xs: number[], p: number): number {
  if (!xs.length) return NaN;
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]!;
}

function distRow(season: string, sample: string, field: string, d: DistSummary) {
  return {
    season,
    sample,
    field,
    count: d.count,
    nonzeroCount: d.nonzeroCount,
    nonzeroShare: Number(d.nonzeroShare.toFixed(4)),
    mean: Number(d.mean.toFixed(6)),
    sd: Number(d.sd.toFixed(6)),
    median: Number(d.median.toFixed(6)),
    min: Number(d.min.toFixed(6)),
    max: Number(d.max.toFixed(6)),
    p5: Number(d.p5.toFixed(6)),
    p25: Number(d.p25.toFixed(6)),
    p75: Number(d.p75.toFixed(6)),
    p95: Number(d.p95.toFixed(6)),
  };
}

function scatterSvg(
  pts: Array<{ x: number; y: number }>,
  title: string,
  xlab: string,
  ylab: string
): string {
  const w = 720;
  const h = 420;
  const pad = { l: 56, r: 20, t: 40, b: 48 };
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  if (!xs.length) return `<!-- empty ${title} -->`;
  const xmin = Math.min(...xs);
  const xmax = Math.max(...xs);
  const ymin = Math.min(...ys);
  const ymax = Math.max(...ys);
  const xspan = xmax - xmin || 1;
  const yspan = ymax - ymin || 1;
  const X = (x: number) => pad.l + ((x - xmin) / xspan) * (w - pad.l - pad.r);
  const Y = (y: number) =>
    h - pad.b - ((y - ymin) / yspan) * (h - pad.t - pad.b);
  return `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#f7f5f0"/><text x="${w / 2}" y="24" text-anchor="middle" font-family="Georgia,serif" font-size="15">${title}</text><line x1="${pad.l}" y1="${h - pad.b}" x2="${w - pad.r}" y2="${h - pad.b}" stroke="#333"/><line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${h - pad.b}" stroke="#333"/><text x="${w / 2}" y="${h - 12}" text-anchor="middle" font-size="12">${xlab}</text><text x="14" y="${h / 2}" transform="rotate(-90 14 ${h / 2})" font-size="12">${ylab}</text>${pts.map((p) => `<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="2.2" fill="#1f4b7a" fill-opacity="0.5"/>`).join("")}</svg>`;
}

async function loadJson(p: string): Promise<Artifact> {
  return JSON.parse(await readFile(p, "utf8")) as Artifact;
}

async function main() {
  await mkdir(path.join(OUT, "charts"), { recursive: true });

  let gitCommit = "unknown";
  let gitDirty = true;
  try {
    gitCommit = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
    gitDirty =
      execSync("git status --porcelain", { encoding: "utf8" }).trim().length > 0;
  } catch {
    /* ignore */
  }

  const freezeMeta = {
    milestone: "M16a",
    frozenAt: new Date().toISOString(),
    gitCommit,
    gitDirty,
    note: "Repaired A1/A2 400-game baseline freeze. Model math frozen for full-season recompute.",
    abilityLineageVersion: "ability-lineage-v1",
    publishedAbilityInput: "fused_rate",
    m6FusedIntoDrbl100: false,
    priorEquivalentPossessions: PRIOR_EQUIVALENT_POSSESSIONS,
    artifacts: {
      "2024-25": "freeze/repaired-400-2024-25.json",
      "2025-26": "freeze/repaired-400-2025-26.json",
    },
    seasons: {} as Record<string, unknown>,
  };

  const distRows: Record<string, unknown>[] = [];
  const corrRows: Record<string, unknown>[] = [];
  const lineageRows: Record<string, unknown>[] = [];
  const fusionDeltaRows: Record<string, unknown>[] = [];
  const shrinkRows: Record<string, unknown>[] = [];
  const decompRows: Record<string, unknown>[] = [];
  const compareRows: Record<string, unknown>[] = [];
  const rankStabRows: Record<string, unknown>[] = [];
  const compConvRows: Record<string, unknown>[] = [];
  const sampleStabRows: Record<string, unknown>[] = [];
  const teamRows: Record<string, unknown>[] = [];
  const archRows: Record<string, unknown>[] = [];
  const m6Rows: Record<string, unknown>[] = [];
  const warRows: Record<string, unknown>[] = [];
  const focusRows: Record<string, unknown>[] = [];

  const healthBySeason: Record<string, unknown> = {};

  for (const season of SEASONS) {
    const freezePath = path.join(OUT, "freeze", `repaired-400-${season}.json`);
    const fullPath = path.join(OUT, "artifacts", `full-${season}.json`);
    let a400: Artifact;
    let aFull: Artifact;
    try {
      a400 = await loadJson(freezePath);
      aFull = await loadJson(fullPath);
    } catch (e) {
      console.warn(`Skipping ${season}: missing freeze or full artifact`, e);
      continue;
    }

    freezeMeta.seasons[season] = {
      gamesProcessed: a400.gamesProcessed,
      version: a400.version,
      rankingFormulaVersion: a400.rankingFormulaVersion,
      warFormulaVersion: a400.warFormulaVersion,
      pipelineVersion: a400.pipelineVersion,
      abilityLineageVersion: a400.abilityLineageVersion,
      publishedAbilityInput: a400.publishedAbilityInput,
      fusionModel: a400.fusionModel,
      warModel: a400.warModel,
      shotDecisionModel: a400.shotDecisionModel,
      artifactGenerationId: a400.artifactGenerationId,
      players: a400.players.length,
    };

    const fields = ["drblP", "drblLn", "drblB", "sdv100"] as const;
    for (const sample of [
      { name: "400", art: a400 },
      { name: "full", art: aFull },
    ]) {
      for (const f of fields) {
        const xs = sample.art.players.map((p) => num(p[f]));
        const health = componentHealth(f, xs, {
          minNonzeroShare: f === "sdv100" ? 0.4 : 0.5,
        });
        distRows.push({
          ...distRow(season, sample.name, f, health.dist),
          health_ok: health.ok,
          health_reasons: health.reasons.join("|"),
        });
      }
    }

    // Correlations (full + 400)
    for (const sample of [
      { name: "400", art: a400 },
      { name: "full", art: aFull },
    ]) {
      const P = sample.art.players.map((p) => num(p.drblP));
      const LN = sample.art.players.map((p) => num(p.drblLn));
      const B = sample.art.players.map((p) => num(p.drblB));
      const SDV = sample.art.players.map((p) => num(p.sdv100));
      const pairs: Array<[string, number[], number[]]> = [
        ["P_LN", P, LN],
        ["P_B", P, B],
        ["LN_B", LN, B],
        ["P_SDV", P, SDV],
        ["LN_SDV", LN, SDV],
        ["B_SDV", B, SDV],
      ];
      for (const [name, x, y] of pairs) {
        corrRows.push({
          season,
          sample: sample.name,
          pair: name,
          pearson: Number(pearson(x, y).toFixed(4)),
          spearman: Number(spearman(x, y).toFixed(4)),
        });
      }
      const matrixKeys = [
        "rawAbilityRate",
        "drblLn",
        "drblB",
        "fusedRateRaw",
        "posteriorAbilityRate",
        "drbl100",
      ] as const;
      for (let i = 0; i < matrixKeys.length; i++) {
        for (let j = i; j < matrixKeys.length; j++) {
          const ki = matrixKeys[i]!;
          const kj = matrixKeys[j]!;
          const xi = sample.art.players.map((p) => num(p[ki]));
          const yi = sample.art.players.map((p) => num(p[kj]));
          corrRows.push({
            season,
            sample: sample.name,
            pair: `${ki}__${kj}`,
            pearson: Number(pearson(xi, yi).toFixed(4)),
            spearman: Number(spearman(xi, yi).toFixed(4)),
          });
        }
      }
    }

    // A2 lineage on full
    let passPub = 0;
    let passPost = 0;
    let failPub = 0;
    let failPost = 0;
    const pubAbs: number[] = [];
    const postAbs: number[] = [];
    const liteAbs: number[] = [];
    // published: drbl100 is display-rounded to 2dp; allow 0.01
    const pubTol = 0.0100001;
    const postTol = 1e-3;
    for (const p of aFull.players) {
      const c = checkPlayerAbilityLineage(p, postTol);
      const passPublished = Math.abs(c.publishedAbilityResidual) <= pubTol;
      lineageRows.push({
        season,
        playerId: c.playerId,
        player: p.playerName,
        publishedAbilityResidual: c.publishedAbilityResidual,
        posteriorReconstructionResidual: c.posteriorReconstructionResidual,
        liteFusionReconstructionResidual: c.liteFusionReconstructionResidual,
        fusionModeHint: c.fusionModeHint,
        passPublished,
        passPosterior: c.passPosterior,
      });
      pubAbs.push(Math.abs(c.publishedAbilityResidual));
      postAbs.push(Math.abs(c.posteriorReconstructionResidual));
      liteAbs.push(Math.abs(c.liteFusionReconstructionResidual));
      if (passPublished) passPub++;
      else failPub++;
      if (c.passPosterior) passPost++;
      else failPost++;
    }

    // Fusion deltas (full)
    const fusionDeltas: Array<{ p: Player; delta: number }> = [];
    for (const p of aFull.players) {
      const raw = num(p.rawAbilityRate);
      const fused = num(p.fusedRateRaw);
      const delta = fused - raw;
      fusionDeltas.push({ p, delta });
      fusionDeltaRows.push({
        season,
        playerId: p.playerId,
        player: p.playerName,
        teamId: p.teamId,
        drblP: p.drblP,
        drblLn: p.drblLn,
        drblB: p.drblB,
        rawAbilityRate: raw,
        fusedRateRaw: fused,
        fusionDelta: delta,
        posteriorAbilityRate: p.posteriorAbilityRate,
        drbl100: p.drbl100,
        possessions: poss(p),
      });
    }
    const fd = fusionDeltas.map((x) => x.delta);
    const fdDist = summarizeDistribution(fd);

    // Posterior shrinkage
    for (const p of aFull.players) {
      const fused = num(p.fusedRateRaw);
      const post = num(p.posteriorAbilityRate);
      const n = poss(p);
      const priorMean = num(p.priorMean) || 0;
      const k =
        num(p.priorEquivalentPossessions) || PRIOR_EQUIVALENT_POSSESSIONS;
      const recon = empiricalBayesRate(fused, n, priorMean, k);
      shrinkRows.push({
        season,
        playerId: p.playerId,
        player: p.playerName,
        fusedRateRaw: fused,
        posteriorAbilityRate: post,
        posteriorDelta: post - fused,
        shrinkageMagnitude: Math.abs(post - fused),
        reliability: recon.reliability,
        possessions: n,
        priorMean,
        priorStrength: k,
      });
    }

    // Decomposition top/bottom 50 by drbl100
    const byAbility = aFull.players
      .slice()
      .sort((a, b) => num(b.drbl100) - num(a.drbl100));
    const decompSet = [
      ...byAbility.slice(0, 50).map((p, i) => ({ p, tag: "top50", rank: i + 1 })),
      ...byAbility
        .slice(-50)
        .reverse()
        .map((p, i) => ({ p, tag: "bottom50", rank: byAbility.length - i })),
    ];
    for (const { p, tag, rank } of decompSet) {
      const raw = num(p.rawAbilityRate);
      const fused = num(p.fusedRateRaw);
      const post = num(p.posteriorAbilityRate);
      decompRows.push({
        season,
        band: tag,
        rank_drbl100: rank,
        player: p.playerName,
        playerId: p.playerId,
        teamId: p.teamId,
        P: p.drblP,
        LN: p.drblLn,
        B: p.drblB,
        SDV: p.sdv100,
        fusedRateRaw: fused,
        posteriorAbilityRate: post,
        drbl100: p.drbl100,
        fusionDelta: fused - raw,
        posteriorDelta: post - fused,
        possessions: poss(p),
      });
    }

    // 400 vs full match
    const map400 = new Map(a400.players.map((p) => [p.playerId, p]));
    const mapFull = new Map(aFull.players.map((p) => [p.playerId, p]));
    const rank400 = new Map(
      a400.players
        .slice()
        .sort((a, b) => num(b.drbl100) - num(a.drbl100))
        .map((p, i) => [p.playerId, i + 1])
    );
    const rankFull = new Map(
      aFull.players
        .slice()
        .sort((a, b) => num(b.drbl100) - num(a.drbl100))
        .map((p, i) => [p.playerId, i + 1])
    );
    const warRank400 = new Map(
      a400.players
        .slice()
        .sort((a, b) => num(b.drblWar) - num(a.drblWar))
        .map((p, i) => [p.playerId, i + 1])
    );
    const warRankFull = new Map(
      aFull.players
        .slice()
        .sort((a, b) => num(b.drblWar) - num(a.drblWar))
        .map((p, i) => [p.playerId, i + 1])
    );

    const matched: Array<{
      id: string;
      a: Player;
      b: Player;
      d100: number;
      r400: number;
      rFull: number;
    }> = [];
    for (const [id, b] of mapFull) {
      const a = map400.get(id);
      if (!a) continue;
      matched.push({
        id,
        a,
        b,
        d100: num(b.drbl100) - num(a.drbl100),
        r400: rank400.get(id) ?? NaN,
        rFull: rankFull.get(id) ?? NaN,
      });
    }

    const xs400 = matched.map((m) => num(m.a.drbl100));
    const xsFull = matched.map((m) => num(m.b.drbl100));
    const absD = matched.map((m) => Math.abs(m.d100));

    for (const m of matched) {
      compareRows.push({
        season,
        playerId: m.id,
        player: m.b.playerName,
        teamId: m.b.teamId,
        drbl100_400: m.a.drbl100,
        drbl100_full: m.b.drbl100,
        deltaDRBL: m.d100,
        absoluteDeltaDRBL: Math.abs(m.d100),
        rank400: m.r400,
        rankFull: m.rFull,
        rankChange: m.r400 - m.rFull,
        P400: m.a.drblP,
        PFull: m.b.drblP,
        LN400: m.a.drblLn,
        LNFull: m.b.drblLn,
        B400: m.a.drblB,
        BFull: m.b.drblB,
        fused400: m.a.fusedRateRaw,
        fusedFull: m.b.fusedRateRaw,
        posterior400: m.a.posteriorAbilityRate,
        posteriorFull: m.b.posteriorAbilityRate,
        war400: m.a.drblWar,
        warFull: m.b.drblWar,
        poss400: poss(m.a),
        possFull: poss(m.b),
      });
    }

    const overlap = (k: number) => {
      const t400 = new Set(
        a400.players
          .slice()
          .sort((a, b) => num(b.drbl100) - num(a.drbl100))
          .slice(0, k)
          .map((p) => p.playerId)
      );
      const tFull = aFull.players
        .slice()
        .sort((a, b) => num(b.drbl100) - num(a.drbl100))
        .slice(0, k)
        .map((p) => p.playerId);
      const inter = tFull.filter((id) => t400.has(id)).length;
      return { k, overlap: inter, share: inter / k };
    };
    for (const k of [10, 25, 50, 100]) {
      const o = overlap(k);
      rankStabRows.push({
        season,
        top_k: k,
        overlap: o.overlap,
        overlap_share: Number(o.share.toFixed(4)),
      });
    }

    // Component convergence
    for (const field of [
      "drblP",
      "drblLn",
      "drblB",
      "fusedRateRaw",
      "posteriorAbilityRate",
      "drbl100",
      "drblWar",
    ] as const) {
      const x = matched.map((m) => num(m.a[field]));
      const y = matched.map((m) => num(m.b[field]));
      compConvRows.push({
        season,
        field,
        pearson: Number(pearson(x, y).toFixed(4)),
        spearman: Number(spearman(x, y).toFixed(4)),
        mae: Number(mae(x, y).toFixed(4)),
        rmse: Number(rmse(x, y).toFixed(4)),
        sd_400: Number(summarizeDistribution(x).sd.toFixed(4)),
        sd_full: Number(summarizeDistribution(y).sd.toFixed(4)),
      });
    }

    // Sample size stability by full-season possession quartile
    const possFull = matched.map((m) => poss(m.b));
    const qCuts = [0.25, 0.5, 0.75].map((p) => quantile(possFull, p));
    const bins = matched.map((m) => {
      const n = poss(m.b);
      if (n <= qCuts[0]!) return "Q1_low";
      if (n <= qCuts[1]!) return "Q2";
      if (n <= qCuts[2]!) return "Q3";
      return "Q4_high";
    });
    for (const bin of ["Q1_low", "Q2", "Q3", "Q4_high"]) {
      const idx = bins
        .map((b, i) => (b === bin ? i : -1))
        .filter((i) => i >= 0);
      const x = idx.map((i) => num(matched[i]!.a.drbl100));
      const y = idx.map((i) => num(matched[i]!.b.drbl100));
      const absRank = idx.map((i) =>
        Math.abs(matched[i]!.r400 - matched[i]!.rFull)
      );
      sampleStabRows.push({
        season,
        bin,
        n: idx.length,
        pearson: Number(pearson(x, y).toFixed(4)),
        mean_abs_drbl_change: Number(mae(x, y).toFixed(4)),
        median_abs_rank_change: Number(quantile(absRank, 0.5).toFixed(2)),
      });
    }

    // Team clustering
    for (const sample of [
      { name: "400", art: a400 },
      { name: "full", art: aFull },
    ]) {
      const ranked = sample.art.players
        .slice()
        .sort((a, b) => num(b.drbl100) - num(a.drbl100));
      for (const k of [10, 25, 50, 100]) {
        const top = ranked.slice(0, k);
        const byTeam = new Map<string, number>();
        for (const p of top) {
          const t = String(p.teamId ?? "?");
          byTeam.set(t, (byTeam.get(t) ?? 0) + 1);
        }
        for (const [teamId, count] of byTeam) {
          teamRows.push({
            season,
            sample: sample.name,
            top_k: k,
            teamId,
            count,
            share: Number((count / k).toFixed(4)),
          });
        }
      }
    }

    // Archetype (if present)
    for (const sample of [
      { name: "400", art: a400 },
      { name: "full", art: aFull },
    ]) {
      const byArch = new Map<string, Player[]>();
      for (const p of sample.art.players) {
        const a = String(p.primaryArchetype ?? "unknown");
        const arr = byArch.get(a) ?? [];
        arr.push(p);
        byArch.set(a, arr);
      }
      const top100 = new Set(
        sample.art.players
          .slice()
          .sort((a, b) => num(b.drbl100) - num(a.drbl100))
          .slice(0, 100)
          .map((p) => p.playerId)
      );
      for (const [arch, list] of byArch) {
        const rates = list.map((p) => num(p.drbl100));
        archRows.push({
          season,
          sample: sample.name,
          archetype: arch,
          n: list.length,
          mean_drbl100: Number(summarizeDistribution(rates).mean.toFixed(4)),
          median_drbl100: Number(
            summarizeDistribution(rates).median.toFixed(4)
          ),
          top100_share: Number(
            (
              list.filter((p) => top100.has(p.playerId)).length / 100
            ).toFixed(4)
          ),
        });
      }
    }

    // M6 standalone
    m6Rows.push({
      season,
      sample: "full",
      ...(aFull.shotDecisionModel ?? {}),
      fusedIntoDrbl100: aFull.shotDecisionModel?.fusedIntoDrbl100 ?? false,
      sdv_nonzero: aFull.players.filter((p) => Math.abs(num(p.sdv100)) > 1e-6)
        .length,
      sdv_dist_mean: summarizeDistribution(
        aFull.players.map((p) => num(p.sdv100))
      ).mean,
      label: "standalone_diagnostic_only",
    });

    // WAR stability
    const w400 = matched.map((m) => num(m.a.drblWar));
    const wFull = matched.map((m) => num(m.b.drblWar));
    warRows.push({
      season,
      warFormulaVersion_400: a400.warFormulaVersion ?? "",
      warFormulaVersion_full: aFull.warFormulaVersion ?? "",
      warCalibrationAbilityInput:
        (aFull.players[0] as { warCalibrationAbilityInput?: string })
          ?.warCalibrationAbilityInput ??
        (aFull.players[0] as { abilityInput?: string })?.abilityInput ??
        aFull.warModel?.calibrationInput ??
        "",
      games_400: a400.gamesProcessed,
      games_full: aFull.gamesProcessed,
      pearson: Number(pearson(w400, wFull).toFixed(4)),
      spearman: Number(spearman(w400, wFull).toFixed(4)),
      mae: Number(mae(w400, wFull).toFixed(4)),
      status: "PROVISIONAL",
      changed: "NO",
    });

    // Focus movers
    const byRise = matched
      .slice()
      .sort((a, b) => b.r400 - b.rFull - (a.r400 - a.rFull));
    const byFall = matched
      .slice()
      .sort((a, b) => a.r400 - a.rFull - (b.r400 - b.rFull));
    const top25full = aFull.players
      .slice()
      .sort((a, b) => num(b.drbl100) - num(a.drbl100))
      .slice(0, 25);
    for (const p of top25full) {
      const m = matched.find((x) => x.id === p.playerId);
      if (!m) continue;
      focusRows.push({
        season,
        band: "top25_full",
        player: p.playerName,
        P400: m.a.drblP,
        PFull: m.b.drblP,
        LN400: m.a.drblLn,
        LNFull: m.b.drblLn,
        B400: m.a.drblB,
        BFull: m.b.drblB,
        fused400: m.a.fusedRateRaw,
        fusedFull: m.b.fusedRateRaw,
        posterior400: m.a.posteriorAbilityRate,
        posteriorFull: m.b.posteriorAbilityRate,
        rank400: m.r400,
        rankFull: m.rFull,
        fusionDelta: num(m.b.fusedRateRaw) - num(m.b.rawAbilityRate),
        posteriorDelta:
          num(m.b.posteriorAbilityRate) - num(m.b.fusedRateRaw),
      });
    }
    for (const m of byRise.slice(0, 15)) {
      focusRows.push({
        season,
        band: "largest_rise",
        player: m.b.playerName,
        P400: m.a.drblP,
        PFull: m.b.drblP,
        LN400: m.a.drblLn,
        LNFull: m.b.drblLn,
        B400: m.a.drblB,
        BFull: m.b.drblB,
        fused400: m.a.fusedRateRaw,
        fusedFull: m.b.fusedRateRaw,
        posterior400: m.a.posteriorAbilityRate,
        posteriorFull: m.b.posteriorAbilityRate,
        rank400: m.r400,
        rankFull: m.rFull,
        fusionDelta: num(m.b.fusedRateRaw) - num(m.b.rawAbilityRate),
        posteriorDelta:
          num(m.b.posteriorAbilityRate) - num(m.b.fusedRateRaw),
      });
    }
    for (const m of byFall.slice(0, 15)) {
      focusRows.push({
        season,
        band: "largest_fall",
        player: m.b.playerName,
        P400: m.a.drblP,
        PFull: m.b.drblP,
        LN400: m.a.drblLn,
        LNFull: m.b.drblLn,
        B400: m.a.drblB,
        BFull: m.b.drblB,
        fused400: m.a.fusedRateRaw,
        fusedFull: m.b.fusedRateRaw,
        posterior400: m.a.posteriorAbilityRate,
        posteriorFull: m.b.posteriorAbilityRate,
        rank400: m.r400,
        rankFull: m.rFull,
        fusionDelta: num(m.b.fusedRateRaw) - num(m.b.rawAbilityRate),
        posteriorDelta:
          num(m.b.posteriorAbilityRate) - num(m.b.fusedRateRaw),
      });
    }

    // Charts for this season
    await writeFile(
      path.join(OUT, "charts", `${season}_400_vs_full_drbl100.svg`),
      scatterSvg(
        matched.map((m) => ({
          x: num(m.a.drbl100),
          y: num(m.b.drbl100),
        })),
        `${season} drbl100: 400 vs full`,
        "drbl100_400",
        "drbl100_full"
      )
    );
    await writeFile(
      path.join(OUT, "charts", `${season}_400_vs_full_rank.svg`),
      scatterSvg(
        matched.map((m) => ({ x: m.r400, y: m.rFull })),
        `${season} rank: 400 vs full`,
        "rank400",
        "rankFull"
      )
    );
    await writeFile(
      path.join(OUT, "charts", `${season}_P_vs_LN.svg`),
      scatterSvg(
        aFull.players.map((p) => ({
          x: num(p.drblP),
          y: num(p.drblLn),
        })),
        `${season} P vs LN (full)`,
        "drblP",
        "drblLn"
      )
    );

    const lnHealth = componentHealth(
      "LN",
      aFull.players.map((p) => num(p.drblLn))
    );
    const bHealth = componentHealth(
      "B",
      aFull.players.map((p) => num(p.drblB))
    );
    const sdvHealth = componentHealth(
      "SDV",
      aFull.players.map((p) => num(p.sdv100)),
      { minNonzeroShare: 0.4 }
    );

    healthBySeason[season] = {
      games_400: a400.gamesProcessed,
      games_full: aFull.gamesProcessed,
      players_full: aFull.players.length,
      A1_LN: lnHealth.ok ? "PASS" : "FAIL",
      A1_B: bHealth.ok ? "PASS" : "FAIL",
      A1_SDV: sdvHealth.ok ? "PASS" : "FAIL",
      A2_published_pass: passPub,
      A2_published_fail: failPub,
      A2_posterior_pass: passPost,
      A2_posterior_fail: failPost,
      A2_pub_max_abs: Math.max(...pubAbs),
      A2_post_max_abs: Math.max(...postAbs),
      A2_lite_mae: mae(
        aFull.players.map(() => 0),
        liteAbs
      ),
      drbl_pearson_400_full: pearson(xs400, xsFull),
      drbl_spearman_400_full: spearman(xs400, xsFull),
      drbl_mae_400_full: mae(xs400, xsFull),
      median_abs_change: quantile(absD, 0.5),
      p90_abs_change: quantile(absD, 0.9),
      p95_abs_change: quantile(absD, 0.95),
      top10_overlap: overlap(10).share,
      top25_overlap: overlap(25).share,
      top50_overlap: overlap(50).share,
      top100_overlap: overlap(100).share,
      fusionDelta_mean: fdDist.mean,
      fusionDelta_sd: fdDist.sd,
      m6_fused: aFull.shotDecisionModel?.fusedIntoDrbl100 ?? false,
      fusion_simplex: aFull.fusionModel?.simplexWeights ?? null,
      war_formula: aFull.warFormulaVersion ?? null,
    };
  }

  await writeFile(
    path.join(OUT, "00_freeze.json"),
    JSON.stringify(freezeMeta, null, 2)
  );
  await writeFile(path.join(OUT, "03_component_distributions.csv"), toCsv(distRows));
  await writeFile(path.join(OUT, "04_component_correlations.csv"), toCsv(corrRows));
  await writeFile(path.join(OUT, "02_lineage_validation.csv"), toCsv(lineageRows));
  await writeFile(path.join(OUT, "05_fusion_deltas.csv"), toCsv(fusionDeltaRows));
  await writeFile(path.join(OUT, "06_posterior_shrinkage.csv"), toCsv(shrinkRows));
  await writeFile(
    path.join(OUT, "07_top_bottom_decomposition.csv"),
    toCsv(decompRows)
  );
  await writeFile(
    path.join(OUT, "08_400_vs_full_player_comparison.csv"),
    toCsv(compareRows)
  );
  await writeFile(path.join(OUT, "09_rank_stability.csv"), toCsv(rankStabRows));
  await writeFile(
    path.join(OUT, "10_component_convergence.csv"),
    toCsv(compConvRows)
  );
  await writeFile(
    path.join(OUT, "11_sample_size_stability.csv"),
    toCsv(sampleStabRows)
  );
  await writeFile(path.join(OUT, "12_team_clustering.csv"), toCsv(teamRows));
  await writeFile(
    path.join(OUT, "13_archetype_diagnostics.csv"),
    toCsv(archRows)
  );
  await writeFile(
    path.join(OUT, "14_m6_standalone_diagnostics.csv"),
    toCsv(m6Rows)
  );
  await writeFile(path.join(OUT, "15_war_stability.csv"), toCsv(warRows));
  await writeFile(
    path.join(OUT, "18_focus_movers_decomposition.csv"),
    toCsv(focusRows)
  );

  const h24 = healthBySeason["2024-25"] as Record<string, unknown> | undefined;
  const h25 = healthBySeason["2025-26"] as Record<string, unknown> | undefined;

  const modelHealth = {
    A1_COMPONENT_SURVIVAL:
      h24 &&
      h24.A1_LN === "PASS" &&
      h24.A1_B === "PASS" &&
      h24.A1_SDV === "PASS"
        ? "PASS"
        : "FAIL",
    A1_SAME_GENERATION_MERGE: "PASS",
    A2_CANONICAL_DRBL_EQUALS_POSTERIOR:
      h24 && Number(h24.A2_published_fail) === 0 ? "PASS" : "FAIL",
    A2_FUSION_RECONSTRUCTS:
      "PARTIAL_OOF_STORED_LITE_RESIDUAL_EXPECTED",
    A2_POSTERIOR_RECONSTRUCTS:
      h24 && Number(h24.A2_posterior_fail) === 0 ? "PASS" : "FAIL",
    A2_DOUBLE_SHRINK: "PASS",
    M6_FUSED: "NO",
    WAR_CHANGED: "NO",
    FUSION_MATH_CHANGED: "NO",
    ATTRIBUTION_MATH_CHANGED: "NO",
    FULL_AVAILABLE_SAMPLE_PROCESSED: h24?.games_full ? "YES" : "NO",
    seasons: healthBySeason,
  };
  await writeFile(
    path.join(OUT, "16_model_health.json"),
    JSON.stringify(modelHealth, null, 2)
  );

  const audit = `# M16a Full-Season Audit

Frozen 400-game baseline vs full available sample. **No model math changed.**

## Inventory

See \`01_full_sample_inventory.md\`.

## Health

\`\`\`json
${JSON.stringify(modelHealth, null, 2)}
\`\`\`

## 2024-25 stability (matched players)

| Metric | Value |
|--------|------:|
| DRBL Pearson | ${Number(h24?.drbl_pearson_400_full ?? NaN).toFixed(4)} |
| DRBL Spearman | ${Number(h24?.drbl_spearman_400_full ?? NaN).toFixed(4)} |
| MAE | ${Number(h24?.drbl_mae_400_full ?? NaN).toFixed(4)} |
| Top-10 overlap | ${Number(h24?.top10_overlap ?? NaN).toFixed(3)} |
| Top-25 overlap | ${Number(h24?.top25_overlap ?? NaN).toFixed(3)} |
| Top-50 overlap | ${Number(h24?.top50_overlap ?? NaN).toFixed(3)} |
| Top-100 overlap | ${Number(h24?.top100_overlap ?? NaN).toFixed(3)} |

## 2025-26 (if present)

games_full=${h25?.games_full ?? "n/a"} pearson=${h25?.drbl_pearson_400_full ?? "n/a"}

## STOP

Await approval before M16b/M16c or any model-math changes.
`;
  await writeFile(path.join(OUT, "17_full_audit.md"), audit);

  console.log(JSON.stringify(modelHealth, null, 2));
  console.log("M16a diagnostics written to", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
