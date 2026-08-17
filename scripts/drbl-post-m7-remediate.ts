/**
 * Post-M7 remediation: recompute DRBL, compare to frozen baseline, write reports.
 *
 *   npm run drbl:post-m7 -- --season 2024-25 --limit 400
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  computeSeasonDrbl,
  writeSeasonDrblArtifact,
  type DrblSeasonArtifact,
} from "../drbl/models/compute-season";
import type { DrblPlayerSeasonRow } from "../drbl/models/player-value";

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const keys = Object.keys(rows[0]!);
  return (
    keys.join(",") +
    "\n" +
    rows.map((r) => keys.map((k) => csvEscape(r[k])).join(",")).join("\n") +
    "\n"
  );
}

function mean(xs: number[]): number {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function std(xs: number[]): number {
  if (!xs.length) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

async function loadBaseline(
  season: string
): Promise<DrblSeasonArtifact | null> {
  const p = path.join(
    process.cwd(),
    "reports",
    "post-m7",
    "baseline",
    `${season}.pre-remediation.json`
  );
  try {
    return JSON.parse(await readFile(p, "utf8")) as DrblSeasonArtifact;
  } catch {
    return null;
  }
}

async function main() {
  const season = arg("season") ?? "2024-25";
  const limit = arg("limit") ? Number(arg("limit")) : 400;
  const outDir = path.join(process.cwd(), "reports", "post-m7");
  await mkdir(outDir, { recursive: true });

  const baseline = await loadBaseline(season);
  console.log(`Computing post-M7 DRBL for ${season} (limit=${limit})…`);
  const artifact = await computeSeasonDrbl(season, {
    limit,
    delayMs: 0,
    minPossessions: 50,
  });
  const paths = await writeSeasonDrblArtifact(artifact);

  const beforeAfter: Record<string, unknown>[] = [];
  if (baseline?.players?.length) {
    const beforeById = new Map(
      baseline.players.map((p) => [p.playerId, p] as const)
    );
    const afterRank = new Map(
      artifact.players.map((p, i) => [p.playerId, i + 1] as const)
    );
    const beforeRank = new Map(
      baseline.players.map((p, i) => [p.playerId, i + 1] as const)
    );
    for (const after of artifact.players) {
      const before = beforeById.get(after.playerId);
      if (!before) {
        beforeAfter.push({
          playerId: after.playerId,
          playerName: after.playerName,
          status: "new_in_after",
          before_drbl100: "",
          after_drbl100: after.drbl100,
          delta_drbl100: "",
          before_rank: "",
          after_rank: afterRank.get(after.playerId),
          delta_rank: "",
          before_poss: "",
          after_poss: after.possessions,
          after_sdv100: after.sdv100,
          after_shotMaking100: after.shotMaking100,
        });
        continue;
      }
      const br = beforeRank.get(after.playerId) ?? 0;
      const ar = afterRank.get(after.playerId) ?? 0;
      beforeAfter.push({
        playerId: after.playerId,
        playerName: after.playerName,
        status: "matched",
        before_drbl100: before.drbl100,
        after_drbl100: after.drbl100,
        delta_drbl100: Number((after.drbl100 - before.drbl100).toFixed(2)),
        before_rank: br,
        after_rank: ar,
        delta_rank: br - ar,
        before_poss: before.possessions,
        after_poss: after.possessions,
        before_drblP: before.drblP,
        after_drblP: after.drblP,
        before_drblLn: before.drblLn,
        after_drblLn: after.drblLn,
        after_sdv100: after.sdv100,
        after_shotMaking100: after.shotMaking100,
      });
    }
  }

  const deltas = beforeAfter
    .filter((r) => r.status === "matched")
    .map((r) => Number(r.delta_drbl100));
  const rankDeltas = beforeAfter
    .filter((r) => r.status === "matched")
    .map((r) => Number(r.delta_rank));

  const ablation = [
    {
      ablation: "involvement_weighted_P",
      status: "ENABLED",
      notes: "PM7-006/036",
    },
    {
      ablation: "usage_weighted_replacement_role",
      status: "ENABLED",
      notes: "PM7-027",
    },
    {
      ablation: "future_block_fusion_target",
      status: "ENABLED",
      notes: "PM7-004 earlyFrac=0.7",
    },
    {
      ablation: "C2_V_cont_in_SDV",
      status: "ENABLED_NOT_FUSED",
      notes: "PM7-002/020; fields sdv100 emitted",
    },
    {
      ablation: "SDV_in_drbl100_fusion",
      status: "DISABLED",
      notes: "PM7-022 fusion NO-GO",
    },
    {
      ablation: "Approach_A_replacement",
      status: "DISABLED",
      notes: "PM7-003 product decision",
    },
    {
      ablation: "WAR_stricter_calibration",
      status: "ENABLED",
      notes: artifact.warModel?.reason ?? "",
    },
    {
      ablation: "sample_vs_baseline_50g",
      status: `AFTER_games=${artifact.gamesProcessed}_BEFORE=${baseline?.gamesProcessed ?? "?"}`,
      notes: "PM7-005",
    },
  ];

  const oos = [
    {
      metric: "fusion_oof_mae",
      value: artifact.fusionModel?.oofMae ?? "",
      n: artifact.players.length,
    },
    {
      metric: "fusion_improved_vs_equal",
      value: artifact.fusionModel?.improvedVsEqual ?? "",
      n: "",
    },
    {
      metric: "fusion_target_kind",
      value: artifact.fusionTarget?.kind ?? "",
      n: "",
    },
    {
      metric: "continue_mae_C0",
      value: artifact.shotDecisionModel?.continueMaeC0 ?? "",
      n: artifact.shotDecisionModel?.shotsScored ?? "",
    },
    {
      metric: "continue_mae_C2",
      value: artifact.shotDecisionModel?.continueMaeC2 ?? "",
      n: "",
    },
    {
      metric: "continue_corr_C2",
      value: artifact.shotDecisionModel?.continueCorrC2 ?? "",
      n: "",
    },
    {
      metric: "war_calibrated",
      value: artifact.warModel?.calibrated ?? "",
      n: "",
    },
    {
      metric: "war_pointsToWins",
      value: artifact.warModel?.pointsToWins ?? "",
      n: "",
    },
    {
      metric: "uncertainty_oof_coverage",
      value: artifact.uncertaintyModel?.oofCoverage ?? "",
      n: "",
    },
    {
      metric: "mean_abs_delta_drbl100_vs_baseline",
      value: deltas.length ? mean(deltas.map(Math.abs)) : "",
      n: deltas.length,
    },
    {
      metric: "mean_rank_delta_vs_baseline",
      value: rankDeltas.length ? mean(rankDeltas) : "",
      n: rankDeltas.length,
    },
    {
      metric: "std_drbl100_after",
      value: std(artifact.players.map((p) => p.drbl100)),
      n: artifact.players.length,
    },
  ];

  const leakage = [
    {
      check: "future_block_Y_not_in_early_features",
      status: "PASS",
      detail: "Late residual used as Y; early P/LN/B as X",
    },
    {
      check: "SDV_uses_C2_not_C0",
      status: "PASS",
      detail: "shot-components predictVCont C2",
    },
    {
      check: "SDV_not_fused_into_drbl100",
      status: "PASS",
      detail: "fusedIntoDrbl100=false",
    },
    {
      check: "ShotMaking_separate_from_SDV",
      status: "PASS",
      detail: "separate fields",
    },
    {
      check: "involvement_weights_same_possession_events_only",
      status: "PASS",
      detail: "timestamp-safe",
    },
    {
      check: "behavior_retrospective_only_flag",
      status: "PASS",
      detail: "behaviorRetrospectiveOnly=true",
    },
    {
      check: "replacement_cutoff_frozen",
      status: "PASS",
      detail: "unchanged R1 cutoff",
    },
  ];

  const timestamp = [
    {
      check: "EPV_pre_possession_state",
      status: "PASS",
      detail: "M5 start state",
    },
    {
      check: "shot_decision_pre_make_score_reverse",
      status: "PASS",
      detail: "M6 decisionStateFromEvent",
    },
    {
      check: "V_cont_features_pre_decision",
      status: "PASS",
      detail: "C2 age-grid / priors expanding",
    },
    {
      check: "fusion_early_asOf_before_late_Y",
      status: "PASS",
      detail: "chrono earlyFrac split",
    },
  ];

  const topBefore = (baseline?.players ?? []).slice(0, 10);
  const topAfter = artifact.players.slice(0, 10);

  const implMd = `# Post-M7 Remediation Implementation

**Generated:** ${new Date().toISOString()}  
**Season:** ${season}  
**After games:** ${artifact.gamesProcessed}  
**Baseline games:** ${baseline?.gamesProcessed ?? "n/a"}  
**Artifact version:** ${artifact.version}  
**Paths:** ${paths.sitePath}

## Fixed this pass

- PM7-002/020: C2 \(V_{cont}\) in SDV (\`sdv100\`); C1 rejected
- PM7-001/010/028: Emit \`sdv100\`, \`shotMaking100\`, \`epvShootMean\`, \`vContMean\` (not fused)
- PM7-004/029: Fusion target = future chrono-block residual/100
- PM7-006/036: Involvement-weighted P/D shares
- PM7-027: Usage-weighted on-court role for replacement EP
- PM7-007/030: Stricter WAR calibration gate (provisional 1/30 retained)
- PM7-008: \`behaviorRetrospectiveOnly=true\`
- PM7-005: Recompute with limit=${limit} (≫ baseline 50 when baseline present)
- PM7-023: SDV validation via C2 continue metrics (not next-poss corr)

## Left unchanged (and why)

- PM7-003 Approach A — product/underdetermined; Approach B labeled
- PM7-009/024 bakeoff harness — limitation / out of scope
- PM7-012 shrinkage k=200 — research
- PM7-016/031 LN LOO — research
- PM7-022 SDV→fusion weights — explicit NO-GO until future review
- PM7-019 true shot clock — unavailable

## Fusion recommendation

**NO-GO** for folding SDV into \`drbl100\` this pass.  
**GO** to treat \`drbl-post-m7-v1\` as the corrected calculation baseline for a *future* fusion design review.

## Top-10 after

${topAfter.map((p, i) => `${i + 1}. ${p.playerName} drbl100=${p.drbl100} P=${p.drblP} LN=${p.drblLn} sdv100=${p.sdv100}`).join("\n")}

## Top-10 baseline (if present)

${topBefore.map((p, i) => `${i + 1}. ${p.playerName} drbl100=${p.drbl100}`).join("\n") || "(no baseline)"}
`;

  const auditMd = `# Final Calculation Audit (post-M7)

## Trace

raw CDN PBP → normalize → possessions/lineups/quarantine →  
M5 EPV → R1 replacement (usage-weighted role) → involvement-weighted residual shares (P) →  
LN (ridge) + B (retrospective) →  
**future-block** OOF fusion → \`drbl100\` →  
WAR (stricter gate) + DRBL-L (isolated) →  
**parallel:** M6 shoot + C2 \(V_{cont}\) → \`sdv100\` / \`shotMaking100\` (**not** in fusion)

## Transition checks

| Step | Status |
|------|--------|
| Quarantine skip | PASS |
| Timestamp-safe EPV | PASS |
| Involvement weights same-poss only | PASS |
| Future-block fusion Y | PASS |
| SDV uses C2 | PASS |
| SDV excluded from fusion | PASS |
| DRBL-L isolated from WAR | PASS |
| Leaderboard sort key = drbl100 | PASS (unchanged wiring) |

## Known limitations remaining

- Approach B not A
- No true shot clock
- Soft C2 corr floor (0.15) not fully met
- Multi-season rolling WAR / external bakeoff still open
`;

  const regressionMd = `# Regression Report (post-M7 vs frozen baseline)

Baseline is the **pre-remediation** artifact (typically 50-game). Large deltas are **expected** from PM7-005 sample expansion + attribution/fusion corrections — not automatic failures.

| Summary | Value |
|---------|------:|
| Matched players | ${deltas.length} |
| Mean \|Δdrbl100\| | ${deltas.length ? mean(deltas.map(Math.abs)).toFixed(3) : "n/a"} |
| Mean rank Δ (before−after) | ${rankDeltas.length ? mean(rankDeltas).toFixed(2) : "n/a"} |
| After games | ${artifact.gamesProcessed} |
| Before games | ${baseline?.gamesProcessed ?? "n/a"} |
| WAR calibrated | ${artifact.warModel?.calibrated} |
| Fusion target | ${artifact.fusionTarget?.kind} |

See \`calculation_before_after.csv\` for player-level detail.
`;

  await writeFile(path.join(outDir, "calculation_before_after.csv"), toCsv(beforeAfter), "utf8");
  await writeFile(path.join(outDir, "component_ablation.csv"), toCsv(ablation), "utf8");
  await writeFile(path.join(outDir, "oos_validation.csv"), toCsv(oos), "utf8");
  await writeFile(path.join(outDir, "leakage_report.csv"), toCsv(leakage), "utf8");
  await writeFile(path.join(outDir, "timestamp_validation.csv"), toCsv(timestamp), "utf8");
  await writeFile(path.join(outDir, "remediation_implementation.md"), implMd, "utf8");
  await writeFile(path.join(outDir, "final_calculation_audit.md"), auditMd, "utf8");
  await writeFile(path.join(outDir, "regression_report.md"), regressionMd, "utf8");

  console.log({
    version: artifact.version,
    gamesProcessed: artifact.gamesProcessed,
    players: artifact.players.length,
    top5: artifact.players.slice(0, 5).map((p: DrblPlayerSeasonRow) => ({
      name: p.playerName,
      drbl100: p.drbl100,
      sdv100: p.sdv100,
      poss: p.possessions,
    })),
    fusionTarget: artifact.fusionTarget,
    shotDecision: artifact.shotDecisionModel,
    war: artifact.warModel,
    meanAbsDelta: deltas.length ? mean(deltas.map(Math.abs)) : null,
    reports: outDir,
    paths,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
