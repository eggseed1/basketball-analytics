# M16a Full-Season Audit

**Milestone:** sample-convergence + lineage validation  
**Model math:** FROZEN (no fusion/M6/WAR/attribution formula changes)

## Freeze

- Git: `629bb1b…` (dirty working tree)
- 400-game repaired baseline: `reports/m16a/freeze/repaired-400-*.json`
- Full available: `reports/m16a/artifacts/full-*.json` (1225 games)
- Ability lineage: `ability-lineage-v1`, `publishedAbilityInput=fused_rate`
- M6: `fusedIntoDrbl100=false`

## Health (`16_model_health.json`)

| Check | Status |
|-------|--------|
| A1 component survival | **PASS** |
| A1 same-generation merge | **PASS** |
| A2 drbl100 == posterior (≤0.01 display rounding) | **PASS** |
| A2 posterior reconstructs from fused via EB | **PASS** |
| A2 fusion reconstructs from P+LN+B lite | **PARTIAL** (OOF stored; lite residual expected) |
| A2 double-shrink | **PASS** |
| M6 fused | **NO** |
| WAR / fusion / attribution math changed | **NO** |
| Full available sample processed | **YES** |

## 400 vs full ability stability (matched players)

### 2024-25
- Pearson ≈ **0.615**, Spearman ≈ **0.620**, MAE ≈ **0.393**
- Top-10 overlap **0.10**, top-25 **0.28**, top-50 **0.34**, top-100 **0.48**

### 2025-26
- Pearson ≈ **0.669**, Spearman ≈ **0.631**, MAE ≈ **0.361**
- Top-10 overlap **0.40**, top-25 **0.28**, top-50 **0.40**, top-100 **0.48**

Interpretation: expanding from 400→1225 games produces **large sample-driven ranking changes**, especially at the very top. This is expected diagnostic signal, not a lineage failure.

## Fusion note (data-dependent, formula frozen)

| Season | Full-sample simplex (refit) |
|--------|-----------------------------|
| 2024-25 | wP≈0.977, wLn≈0.023, wB=0 |
| 2025-26 | wP=1, wLn=0, wB=0 |

LN/B fields survive and are nondegenerate, but the **refit OOF stack** often down-weights them. Candidate for M16c ablation — **not changed here**.

## WAR

- 2024-25 full: `warFormulaVersion=4.0.0`, calibration input **posterior**, provisional production path unchanged
- 2025-26: no team-season CSV → no v4 pipeline remaster; provisional season WAR only
- Status: **PROVISIONAL**

## STOP

Await approval before M16b/M16c or any model-math redesign.
