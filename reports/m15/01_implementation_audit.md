# M15 — Implementation Audit (REFRESH — live 400-game artifacts)

**Frozen at:** `reports/m15/freeze/00_model_freeze_live.json`  
**Git:** `629bb1b790bef21020940122194772b6921569ff` (dirty working tree)  
**Method:** Code inspection of `drbl/` + tests + **live** precomputed.  
**Constraint:** No model mathematics changed in this pass.

## Phase 0 — Freeze snapshot

| Field | Value |
|-------|-------|
| Parser | `drbl-parser-2026.08.11` |
| Reconstruction | `drbl-recon-2026.08.11` |
| Prior k (possessions) | 200 |
| Provisional points→wins | 1/30 (stored as wins/point 0.0333 in some paths) |
| Live 2024-25 | `drbl-ranking-v2-seq`, **400 games**, 476 players, ranking 2.2.0, WAR formula **4.0.0**, seq-attr-v1 |
| Live 2025-26 | `drbl-ranking-v2-seq`, **400 games**, 482 players, ranking 2.1.0 |
| M6 artifact | `drbl-m7-cv-c2-in-season`, `fusedIntoDrbl100: false`, shotsScored 70917, continueCorrC2 ≈ 0.086 |
| Fusion (metadata) | `drbl-fusion-oof-v1`, weights wP≈0.56, **wLn=0**, wB≈0.44, oofMae≈1.067 |
| Replacement | R1 Approach B, fringe replacementLevelDRBL100 ≈ −0.573 (2024-25 warModel) |
| Prior 50-game freeze | Still under `freeze/precomputed-*-.json` (`drbl-l-v1`) — **do not publish as final** |

Artifacts copied to `freeze/precomputed-*-.live.json`.

---

## Milestone audit (code, not docs)

| ID | Deliverable | STATUS | Files | Functions / classes | Tests | Data |
|----|-------------|--------|-------|---------------------|-------|------|
| M1 | API/cache | PARTIAL | `drbl/api/*`, download scripts | CDN/stats fetch + disk cache | limited | nba.com CDN/stats |
| M2 | Normalization | PARTIAL | `drbl/normalize/*` | event/box normalizers | edge-ish | normalized game dirs |
| M3 | Possessions | COMPLETE | `drbl/possessions/*` | possession reconstruction | `possession-edge-cases.test.ts` | per-game possessions.json |
| M4 | Lineups | COMPLETE | lineup builders in possessions/models | `buildLineupRows` | via lineup tests | on/off states |
| M5 | EPV | PARTIAL/usable | `epv-model.ts`, `expected-points.ts` | ridge EPV | epv paths | `data/drbl/models` coeffs |
| **M6** | Shot decision / continuation | **COMPLETE (standalone)** | `shot-decision.ts`, `continuation-value.ts`, `shot-components.ts` | `epvShoot`, `epvContinue`, `shotDecisionValue`, `shotMakingResidual`, `accumulateShotDecisionComponents` | `shot-decision.test.ts`, `continuation-value.test.ts` | OOF make + C2 continue |
| M7 | Replacement | PARTIAL (Approach B) | `replacement.ts` | `replacementExpectedPoints`, `roleMatchedReplacementResidual`, `buildReplacementPool` | `replacement.test.ts` | R1 pool cutoff-frozen |
| M8 | DRBL-P | COMPLETE | `player-value.ts`, `sequential-attribution.ts` | `attributePossessionSequential`, `attributeGamePlayerValue` | seq + player-value tests | 400-game possessions |
| M9 | DRBL-LN | COMPLETE **in code** / **WIPED on live board** | `lineup-model.ts` | `fitLineupModel`, `lineupRatingsPer100` | `lineup-model.test.ts` | ridge λ=800 |
| M10 | DRBL-B | COMPLETE **in code** / **WIPED on live board** | `behavior.ts` | `fitBehaviorModel` | `behavior.test.ts` | post-game box features |
| M11 | OOF fusion | COMPLETE (early→late target) | fusion module + `compute-season.ts` | `fitFusionOof` | `fusion-oof.test.ts` | earlyFrac within season |
| M12 | Uncertainty | COMPLETE | `uncertainty.ts` | `calibrateUncertainty` | `uncertainty.test.ts` | OOF coverage ~0.80 |
| M13 | WAR | **PROVISIONAL** | `war.ts`, `war-math.ts`, `pipeline-value.ts` | `calibrateWar`, `computeWAR` | `war.test.ts`, `war-math.test.ts`, `pipeline-value.test.ts` | see `14_*.csv` |
| M14 | Leverage | COMPLETE | leverage module | WP leverage λ | `leverage.test.ts` | does not alter drbl100/WAR |
| Seq | Sequential attr | COMPLETE | `sequential-attribution.ts` | category credits | `sequential-attribution.test.ts` | **overwrote published rows** |

### CRITICAL — Display lineage break (Class A)

`scripts/drbl-sequential-reattribute.ts` merges sequential rows with:

```ts
return { ...op, ...n, drblP: n.drblP, drbl100: n.drbl100, ... }
```

`finalizePlayerSeasonRows` is called **without** `lineupRatingsPer100` / `behaviorRatingsPer100`, so `n.drblLn` and `n.drblB` are **0**, and SDV fields are unset/0. Spreading `...n` **overwrites** previously nonzero LN/B/SDV on the site artifact.

**Live 2024-25 check:** `drblLn` nonzero count = **0**; `drblB` nonzero = **0**; `sdv100` nonzero = **0**.  
**Prior 50-game freeze:** LN and B populated (hundreds of nonzero).

Published ability/WAR also mixed: `rawAbilityRate` tracks sequential P; `fusedRateRaw` can remain a **stale pre-sequential fusion rate**; pipeline remaster calibrates from posterior/fused fields. **Displayed DRBL/100 is not a clean equal of “intended fused P+LN+B.”**

---

## M6 verification (frozen — not rewritten)

**Intended equations (code):**

```text
EPV_shoot(S_t) = p_make(S_t) × point_value
EPV_continue(S_t) = predictExpectedPoints(S_t)   // or C2 V_cont in post-M7 path
SDV = EPV_shoot − EPV_continue
ShotMaking = observed_shot_points − EPV_shoot
```

**Timestamp:** features built from pre-shot state / chronological OOF; continuation uses C2 with expanding team priors.

**Leakage checklist (module design):**

| Risk | Status |
|------|--------|
| Same-possession outcome in SDV | Mitigated by construction (decision vs continue; making separate) |
| Post-shot in make model | OOF chrono folds; verify ongoing |
| Final game box in M6 core | Not the make feature set |
| Fused into published drbl100 | **NO** (`fusedIntoDrbl100: false`) AND player `sdv100` wiped to 0 on live board |

**Incremental OOS on published DRBL:** **0 by construction** (not fused + fields wiped).

---

## DRBL/100 path (Phase 4)

Intended math path (compute-season): P + LN + B → OOF fusion → EB → WAR.  
**Actual live path:** sequential reattribute overwrote P/`drbl100`; remasters EB/calibrate WAR on mixed fields; LN/B/SDV display dead.

Website ← `src/data/drbl/precomputed/{season}.json` ← above.

---

## Sample size (Phase 5)

| Season | Games | Full season? |
|--------|------:|:------------:|
| 2024-25 live | **400** | NO |
| 2025-26 live | **400** | NO |
| Prior freeze | 50 | NO |
| WAR multi-limit study | up to **1225** | near-full cache for WAR fit only |

`corr(drbl100, possessions)` ≈ 0.21; `corr(WAR, possessions)` ≈ 0.35 (2024-25).

---

## Fusion target classification (Phase 14)

Code writes `targetKind: "future_block_residual_per_100"` (early games → late-block residual/100).

| Classification | Verdict |
|----------------|---------|
| Leakage? | Not automatic same-row leakage if early/late disjoint |
| Target misalignment? | **YES** vs next-game / next-season impact objective |
| Retrospective? | Partially predictive within season |
| Suitable as final predictive objective? | **No** without reserved multi-season protocol |

---

## Charts

Under `reports/m15/charts/`: DRBL vs poss, WAR vs poss, raw vs posterior, O vs D, component population wipe.
