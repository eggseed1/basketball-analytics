# 02 — Canonical Metric Contract

**Freeze refs:** ability `drbl-ability-eb1600-r1-v1`, R1 points `drbl-r1-points-v1`, R1 win-eq `drbl-r1-wineq-v1`, `k=1600`, `P1=37.490662671779255`  
**Sources:** `drbl/models/validated-ability-v1.ts`, `r1-value-v1.ts`, `player-value.ts`, `src/data/types/player-season.ts`, `src/lib/stat-glossary.ts`

---

## Status legend

| Status | Meaning |
|---|---|
| CANONICAL | Public product truth / ranking |
| DIAGNOSTIC | Shown or stored for interpretation; not canonical rank |
| RESEARCH | Sidecar experiment; not public canonical |
| DEPRECATED | Retained for compatibility; do not treat as truth |
| RETIRED | Must not be reintroduced as production semantics |

---

## CANONICAL

### DRBL/100

| Attribute | Value |
|---|---|
| Display name | DRBL/100 |
| Internal field | `drbl100` (= `validatedDRBL100`) |
| Status | CANONICAL — **ESTABLISHED** |
| Formula | `validatedDRBL100 = N/(N+1600) * rawAbilityRate` |
| Unit | points of Approach-B residual impact per 100 combined possession appearances |
| Numerator | Approach-B attributed value × 100 (via rate) |
| Denominator | `N` = actual combined possession appearances |
| Exposure | actual `N` only (never `N+k`) |
| Shrinkage | single EB toward 0 with `k=1600` |
| Calibration | identity |
| Zero semantics | R1 role-matched baseline (`r1_replacement`) |
| Higher/lower | higher = stronger estimated ability rate |
| Percentile | within-season eligible universe (min actual possessions 50 for public boards) |
| Rank usage | **canonical overall rank** = descending unrounded `drbl100` |
| Public visibility | YES |
| Sorting support | YES (`sort=drbl100`) |
| API presence | YES on `PlayerSeason` when overlay present |
| Implementation | `computeValidatedAbilityV1` → cutover / finalize |
| Limitations | Not causal; not off-ball-complete; rate ≠ cumulative value |

### R1 Points

| Attribute | Value |
|---|---|
| Display name | R1 Points |
| Internal field | `r1Points` |
| Status | CANONICAL — **ESTABLISHED** |
| Formula | `R1Points = ApproachBAttributedValue` (equivalently `rawAbilityRateExact * N / 100`) |
| Unit | scoreboard-point-equivalent residual |
| Reference | CONTEXTUAL_ROLE_MATCHED_R1 |
| Shrinkage | none (primitive realized total) |
| Zero semantics | zero attributed residual vs R1 over observed exposure |
| Higher/lower | higher = more realized attributed value (exposure-sensitive) |
| Rank usage | not canonical overall rank |
| Public visibility | YES when overlay present; else **null** (never 0) |
| Sorting support | YES |
| API presence | `number \| null` |
| Implementation | `buildR1ValueFieldsFromAttributed` |
| Limitations | Accounting value — not latent ability; nonexhaustive of team points |

### R1 Win Equivalents

| Attribute | Value |
|---|---|
| Display name | R1 Win Equivalents |
| Internal field | `r1WinEquivalents` |
| Status | CANONICAL — **ESTABLISHED** |
| Formula | `r1Points / 37.490662671779255` |
| Unit | marginal win-equivalent units from frozen P1 |
| P1 origin | M16l1 development points-per-win; frozen; **do not refit** |
| P1 era robustness | **NOT_ESTABLISHED** |
| Public visibility | YES when overlay present; else null |
| Rank usage | not canonical overall |
| Limitations | **Not conventional WAR**; not causal roster-replacement wins |

---

## DIAGNOSTIC

### DRBL-P (`drblP`)

Approach-B possession component / rate companion. Identification: marginal contribution vs contextual R1 EP. **DIAGNOSTIC** relative to published ability (ability is P-only EB1600 of raw Approach-B rate; LN/B not fused into canonical `drbl100`).

### DRBL-O / DRBL-D (`drblO`, `drblD`)

Offensive / defensive halves of DRBL-P. DIAGNOSTIC.

### DRBL-LN (`drblLn`)

Regularized possession lineup (RAPM-style) rating. Adjusted association — not a causal claim. DIAGNOSTIC.

### DRBL-B (`drblB`)

Regularized prediction from public box/PBP behavior features (usage, creation, shot mix, gravity proxy). Not optical tracking. DIAGNOSTIC.

### DRBL-L (`drblL`)

Leverage-weighted seasonal impact `Σ BaseValue × λ*` with λ* ∝ ∂WP/∂ExpectedPoints normalized to mean 1. Descriptive only — **never** added into R1 Points / R1 Win Equivalents.

### DRBL Δ (`drblDisagreement`)

Scale-standardized disagreement among P/LN/B. Not a calibrated SE; not a ranking penalty.

### SDV / shot-making (`sdv100`, `shotMaking100`, `epvShootMean`, `vContMean`)

Shot-decision / making diagnostics; not fused into canonical ability.

### Legacy ± (`drblUncertainty`, `drblIntervalLo`, `drblIntervalHi`)

**LEGACY DIAGNOSTIC ONLY.** Predictive intervals remain **UNRESOLVED**. Do not present as calibrated confidence intervals.

---

## RESEARCH

### UIR-C (Unexplained Impact Residual candidate C)

| Attribute | Value |
|---|---|
| Status | RESEARCH — **EXPERIMENTAL** |
| Seal | M18a `ba98a652…` STRONG_PASS |
| UIR_STATUS | PERSISTENT_PLAYER_RESIDUAL_ESTABLISHED |
| OFFBALL_VALUE_ESTABLISHED | **NO** |
| Public canonical | **NO** |
| Lambda | 3200 (selected from ridge grid 50…12800) |
| Lineup model | `m18-lineup-impact-v1` |
| Target unit | scoreboard points per possession |
| Train | 2020-21, 2021-22 |
| Validation | 2022-23→2023-24 |
| Reserved | 2023-24→2024-25 |
| Limitations | Persistent residual ≠ identified off-ball value; no tracking |

---

## DEPRECATED / RETIRED

### `drblWar`

DEPRECATED_NONCANONICAL storage/API compatibility. Public plain WAR **RETIRED**. Do not alias to `r1WinEquivalents`.

### `drblSeasonalImpact`

Legacy companion to seasonal points above replacement; prefer `r1Points`.

---

## Exact current formulas (production)

```text
rawAbilityRate_i = 100 * ApproachBAttributedValue_i / N_i
validatedDRBL100_i = N_i / (N_i + 1600) * rawAbilityRate_i
drbl100 = validatedDRBL100
R1Points = ApproachBAttributedValue
R1WinEq = R1Points / 37.490662671779255
```

Frozen: `k=1600`, `priorMean=0`, `calibration=identity`, `fusion=none` for published ability.

---

## RETIRED / NEVER REINTRODUCE

| Retired idea | Why retired |
|---|---|
| +200 prior pseudo-possessions as exposure | Inflates `N`; breaks EB reliability semantics |
| N/2 cumulative exposure | Ad-hoc; not sealed ability contract |
| 5.835 historical ability scaling | Pre-v1 scale; superseded by EB1600 identity calibration |
| 2.918 historical scale | Same lineage |
| `/30` provisional WAR | Unit-mismatched provisional conversion |
| Double EB | Over-shrinkage; single EB1600 is sealed |
| Legacy P/LN/B fusion as published ability | Reserved validation selected P-only EB1600 |
| Legacy uncertainty interval formula as CI | Not reserved-validated; predictive uncertainty frozen **NO** |

---

## Ability / value / forecast

- **ABILITY** = posterior rate /100 appearances → `drbl100`  
- **REALIZED VALUE** = primitive attribution → `r1Points`  
- **FORECAST** = future impact with expected exposure → **not** a sealed public canonical metric in this package
