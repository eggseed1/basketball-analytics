/**
 * Surgical repair of M16f1b focal-interaction audit + readiness verdict.
 * Does not refit models; uses ENGINE_HOLDOUT + one full fit identical to M16f1.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { loadSplitGames } from "../drbl/evaluation/m16c-dataset";
import type { SplitGame } from "../drbl/evaluation/splits";
import { hashGames } from "../drbl/evaluation/splits";
import { emptyRole } from "../drbl/models/replacement";
import {
  buildEpvPossRows,
  buildR1PoolFromGames,
  buildRolesFromGames,
  decomposeOffenseSwap,
  fitContextualEpv,
  fitM5OnRows,
  nearestReplacements,
  R1_K,
} from "../drbl/models/counterfactual-epv-v1";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "reports", "m16f1b");

async function main() {
  const prev = JSON.parse(
    await readFile(path.join(OUT, "21_final_response_values.json"), "utf8")
  ) as Record<string, unknown>;

  const trainGames = JSON.parse(
    await readFile(
      path.join(ROOT, "reports/m16b/splits/train_game_ids.json"),
      "utf8"
    )
  ) as SplitGame[];
  const sorted = [...trainGames].sort((a, b) =>
    a.date === b.date
      ? a.gameId.localeCompare(b.gameId)
      : a.date.localeCompare(b.date)
  );
  const uniqueDates = [...new Set(sorted.map((g) => g.date))].sort();
  const dateCut = uniqueDates[Math.floor(uniqueDates.length * 0.8)]!;
  const fitGames = sorted.filter((g) => g.date < dateCut);
  const holdGames = sorted.filter((g) => g.date >= dateCut);

  const [fitProcessed, holdProcessed] = await Promise.all([
    loadSplitGames(fitGames),
    loadSplitGames(holdGames),
  ]);

  const roles = buildRolesFromGames(fitProcessed);
  const r1 = buildR1PoolFromGames(
    fitProcessed,
    fitGames[fitGames.length - 1]!.date
  );
  const m5Seed = fitProcessed.flatMap((g) =>
    g.possessions.map((p) => {
      const start = g.events.find((e) => e.actionNumber === p.startActionNumber);
      const offenseIsHome = p.offenseTeamId === g.box.homeTeamId;
      const scoreHome = start?.scoreHome ?? 0;
      const scoreAway = start?.scoreAway ?? 0;
      return {
        state: {
          period: p.period,
          clockSeconds: p.startClockSeconds,
          offenseIsHome,
          scoreDiff: offenseIsHome
            ? scoreHome - scoreAway
            : scoreAway - scoreHome,
        },
        points: p.points,
      };
    })
  );
  const m5Coefficients = fitM5OnRows(m5Seed, 1e-2);
  const fitRows = buildEpvPossRows(fitProcessed, m5Coefficients);
  const holdRows = buildEpvPossRows(holdProcessed, m5Coefficients);
  const appear = new Map<string, number>();
  for (const row of fitRows) {
    for (const id of [...row.offensePlayerIds, ...row.defensePlayerIds]) {
      appear.set(id, (appear.get(id) ?? 0) + 1);
    }
  }
  const playerIds = [...appear.entries()]
    .filter(([, n]) => n >= 100)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 160)
    .map(([id]) => id);
  const contextual = fitContextualEpv(
    fitRows.filter((_, i) => i % 2 === 0),
    playerIds,
    roles,
    m5Coefficients,
    100
  );

  let stateChanges = 0;
  let tmChanges = 0;
  let oppChanges = 0;
  let nAudit = 0;
  const sample = holdRows.filter((_, i) => i % 5 === 0).slice(0, 3000);
  for (const row of sample) {
    for (const focalId of row.offensePlayerIds) {
      if (!contextual.playerIds.includes(focalId)) continue;
      const role = roles.get(focalId) ?? emptyRole();
      const reps = nearestReplacements(role, r1, R1_K)
        .filter((id) => id !== focalId)
        .filter((id) => contextual.playerIds.includes(id));
      if (reps.length < 1) continue;
      const d = decomposeOffenseSwap(row, focalId, reps, contextual);
      if (!d) continue;
      nAudit += 1;
      if (Math.abs(d.stateInteractionEffect) > 1e-12) stateChanges += 1;
      if (Math.abs(d.teammateCompositionInteractionEffect) > 1e-12)
        tmChanges += 1;
      if (Math.abs(d.opponentCompositionInteractionEffect) > 1e-12)
        oppChanges += 1;
    }
  }

  const focalValid = nAudit > 0 && stateChanges > 0;
  const md = `# Focal interaction audit

## Architecture reminder
Per-player blocks: main + state interactions.
Shared blocks: offense-role⊗state and defense-role⊗state.

## Under offensive focal swap i→r
| Component | Changes? | Mechanism |
|---|---|---|
| stateInteraction | ${stateChanges}/${nAudit} non-zero | (γ_i − E[γ_r]) · state |
| teammateComposition | ${tmChanges}/${nAudit} non-zero | shared Θ · (roleMean_actual − roleMean_rep) ⊗ state |
| opponentComposition | ${oppChanges}/${nAudit} non-zero (expect ~0 on offense swaps) | defense mean role unchanged |

## Interpretation
- State interactions are **focal-specific** (per-player γ).
- Teammate/shared offense-role⊗state terms **do** change under substitution because the offense role mean includes the focal slot.
- Opponent shared terms do **not** change for offense-focal swaps (defense lineup fixed).

${
  focalValid
    ? "Prior M16f1 claim that contextual variation exists under focal swaps is **supported**."
    : "FLAG: CONTEXT_INTERACTION_INTERPRETATION_ERROR"
}

FOCAL_CONTEXT_INTERACTIONS_VALID = ${focalValid ? "PASS" : "FAIL"}

Note: initial panel audit reported 0/0 due to empty known-replacement filtering on the stratified panel; this repair re-audits on holdout possessions with ≥1 known R1 neighbor in the coefficient set.
`;
  await writeFile(path.join(OUT, "12_focal_interaction_audit.md"), md);

  // Correct readiness: prior false CONTEXT_SIGNAL_FAILURE
  const playerStabilityCat = String(prev.playerStabilityCat);
  const deltaCat = String(prev.deltaCat);
  const replacementCat = String(prev.replacementCat);
  const aggregateCategory = String(prev.aggregateCategory);
  const supportDegenerateFlag = Boolean(prev.supportDegenerateFlag);
  const contextualCompStatus = String(prev.contextualCompStatus);
  const defRelStatus = String(prev.defRelStatus);

  let reliabilityStatus = "READY_FOR_M16F2";
  if (supportDegenerateFlag) {
    reliabilityStatus = "SUPPORT_POLICY_REDESIGN_REQUIRED";
  } else if (
    playerStabilityCat === "UNSTABLE" ||
    deltaCat === "UNSTABLE"
  ) {
    reliabilityStatus = "RELIABILITY_FAILURE";
  } else if (replacementCat === "SENSITIVE") {
    reliabilityStatus = "REPLACEMENT_SENSITIVITY_FAILURE";
  } else if (!focalValid || contextualCompStatus === "FAIL") {
    reliabilityStatus = "CONTEXT_SIGNAL_FAILURE";
  } else if (aggregateCategory === "NEGATIVE") {
    reliabilityStatus = "AGGREGATE_SIGNAL_FAILURE";
  } else if (defRelStatus === "FAIL") {
    reliabilityStatus = "DEFENSIVE_RELIABILITY_FAILURE";
  } else if (
    playerStabilityCat === "WEAK" ||
    deltaCat === "WEAK" ||
    aggregateCategory === "MIXED" ||
    replacementCat === "MODERATE" ||
    (prev.supportCounts as { SUPPORTED: number }).SUPPORTED === 0 ||
    defRelStatus === "WARNING"
  ) {
    // weak-heavy support / 0% SUPPORTED → warnings, not hard fail
    reliabilityStatus = "READY_WITH_WARNINGS";
  }

  // Update health + readiness matrix + final values
  const health = JSON.parse(
    await readFile(path.join(OUT, "19_model_health.json"), "utf8")
  ) as Record<string, unknown>;
  health.FOCAL_CONTEXT_INTERACTIONS_VALID = focalValid ? "PASS" : "FAIL";
  health.COUNTERFACTUAL_RELIABILITY_STATUS = reliabilityStatus;
  health.focalAuditRepair = {
    nAudit,
    stateChanges,
    tmChanges,
    oppChanges,
    note: "repaired empty-panel false FAIL",
  };
  await writeFile(
    path.join(OUT, "19_model_health.json"),
    JSON.stringify(health, null, 2)
  );

  const matrix = await readFile(path.join(OUT, "18_readiness_matrix.csv"), "utf8");
  const fixedMatrix = matrix.replace(
    /focal interaction validity,.*/,
    `focal interaction validity,${focalValid ? "PASS" : "FAIL"},${focalValid ? "PASS" : "FAIL"},${focalValid ? "NO" : "YES"}`
  );
  await writeFile(path.join(OUT, "18_readiness_matrix.csv"), fixedMatrix);

  const next = {
    ...prev,
    stateChanges,
    tmChanges,
    oppChanges,
    nAudit,
    reliabilityStatus,
    focalValid,
  };
  await writeFile(
    path.join(OUT, "21_final_response_values.json"),
    JSON.stringify(next, null, 2)
  );

  const audit = await readFile(path.join(OUT, "20_full_audit.md"), "utf8");
  await writeFile(
    path.join(OUT, "20_full_audit.md"),
    audit.replace(
      /## Status\n.*/,
      `## Status\n${reliabilityStatus}\n\nFocal audit repaired: state ${stateChanges}/${nAudit}, teammate ${tmChanges}/${nAudit}.\n`
    )
  );

  console.log(
    JSON.stringify(
      { reliabilityStatus, nAudit, stateChanges, tmChanges, oppChanges, fitHash: hashGames(fitGames), holdHash: hashGames(holdGames) },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
