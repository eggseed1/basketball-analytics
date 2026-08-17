# 03 — Approach B and Attribution

**Classification:** production attribution = **ESTABLISHED** Approach B; Approach A full counterfactual = **NOT SHIPPED**.

---

## Pipeline (actual implementation)

```text
raw PBP / box
  → processGame / normalize / quarantine
  → lineup state reconstruction
  → possessions
  → EPV(S) from time-safe pre-possession state (expected-points / EPV model)
  → contextual R1 V0: replacementExpectedPoints = contextEp + clamped role-matched residual
  → realized possession scoring result
  → residual Δ = actual − R1 replacement EP
  → sequential attribution (seq-attr-v1): creation, connection, conversion/opportunity, execution, turnovers, …
  → offensive / defensive player credit
  → unassigned residual retained (not force-allocated)
  → player season accumulation → ApproachBAttributedValue / rawAbilityRate / N
  → validatedDRBL100 = N/(N+1600)*rawAbilityRate
  → r1Points / r1WinEquivalents from attributed value
```

Season orchestration (`drbl/models/compute-season.ts` comments):

1. Process + quarantine filter  
2. Build R1 replacement pool  
3. Attribute DRBL-P (Approach B)  
4. Fit DRBL-LN ridge lineup (diagnostic companion)  
5. Fit DRBL-B behavioral ridge (optional companion)  
6–9. Historical fusion/uncertainty/WAR/leverage stages exist in code lineage; **published ability** is validated P-only EB1600 after M16k1/M16l3 cutover — do not treat fused legacy as canonical.

---

## Key modules

| Stage | Path |
|---|---|
| Season compute | `drbl/models/compute-season.ts` |
| Approach B player value | `drbl/models/player-value.ts` |
| Sequential attribution | `drbl/models/sequential-attribution.ts` (`SEQUENTIAL_ATTRIBUTION_VERSION`) |
| R1 / replacement | `drbl/models/replacement.ts` |
| EPV / expected points | `drbl/models/expected-points.ts`, `epv-model.ts` |
| Lineup rows / LN | `drbl/models/lineup-model.ts` |
| Validated ability | `drbl/models/validated-ability-v1.ts` |
| R1 value fields | `drbl/models/r1-value-v1.ts` |
| Website overlay | `src/data/providers/nba/drbl-loader.ts` |

---

## Approach B identification (documented in `player-value.ts`)

- EPV(S) from time-safe pre-possession state  
- Replacement EP = EPV(S) + role-matched R1 residual — **not** a simulated lineup swap (Approach A)  
- Credit: sequential opportunity/execution attribution of `(actual − R1 replacement EP)`  
- Assists as connection credit; make/miss noise down-weighted in stable totals  
- Spec preference for Approach A remains future work — **HYPOTHESIS / UNRESOLVED** as product capability

---

## R1 pool construction (summary)

From `replacement.ts`:

- Level R1 candidates from observed residuals on/before cutoff date  
- Role dimensions: usage, threeRate, starterRate, minutesPerGame  
- Prefer rotation MPG ∈ [8, 32] when pool allows  
- Role distance weighted Euclidean; k-nearest default **k=8**  
- Residual adjustment clamped roughly to `[-0.08, 0.04]` then EP clamped to `[0.7, 1.4]`

---

## Accounting identity

```text
ActualNetPoints
  = Attributed player residual
  + R1BaselineNetPoints
  + UnassignedResidual
```

Implications (**ESTABLISHED accounting stance**):

- Player attribution is **nonexhaustive**  
- Baseline is contextual and **not** allocated to players  
- Unassigned residual is **retained**  
- League/team accounting identities do **not** independently prove player-credit optimality  

---

## Attribution stage labels (sequential)

Where applicable in seq-attr-v1 aggregations: initiation / creation / connection-amplification / conversion-opportunity / execution / turnovers / defensive counterparts. These are **DIAGNOSTIC** category sums supporting Approach-B totals — not separate public canonical metrics.

---

## What is conceptual future work (not current product)

| Item | Status |
|---|---|
| Approach A full lineup counterfactual | NOT SHIPPED |
| Optical off-ball / gravity from tracking | NOT ESTABLISHED (M18b blocked on access) |
| Redistributing unassigned residual into players | Explicitly **not** done (`UNASSIGNED_RESIDUAL_REDISTRIBUTED = NO` in seals) |
| Baseline redistribution into players | **NO** |
