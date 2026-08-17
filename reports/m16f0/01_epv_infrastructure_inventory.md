# EPV / value-model infrastructure inventory (M16f0)

## Summary

| Scorer | Player-sensitive? | Synthetic lineup? | Needs realized path? | Approach A usable? |
|---|---|---|---|---|
| M5 `predictExpectedPoints` | **NO** | NO | NO | **NO** alone |
| M5 + LN `predictLineupResidual` | **YES** | **YES** | NO | **PARTIAL** (only existing path) |
| R1 `replacementExpectedPoints` | role residual only | NO lineup swap | NO | Approach B baseline, not A |
| Sequential attribution | path attribution | N/A | YES (retrospective path) | Approach B |
| M7-CV continuation | NO player IDs in C1; C2 has team priors | NO | NO for features | Not A |
| Shot-decision SDV | shooter features | NO | partial | Not A |

## 1. M5 possession EPV

- **Files:** `drbl/models/expected-points.ts`, `drbl/models/epv-model.ts`
- **Function:** `predictExpectedPoints(state: PossessionEpState)`
- **Inputs:** `period`, `clockSeconds`, `offenseIsHome`, `scoreDiff` only
- **Features:** bias, offenseIsHome, clockLe4, clockLe8, periodGe4, absDiffGe10, absDiffGe20, trailingGe10, leadingGe10, clockNorm
- **Output:** expected points for the possession (PPP-like), unit ≈ points/possession
- **Training:** ridge on possession-start state → points (`epv-ridge-v1`)
- **Player IDs:** none
- **Future path:** none in features
- **Synthetic lineup swap:** **cannot change prediction**

## 2. Lineup ridge (DRBL-LN)

- **File:** `drbl/models/lineup-model.ts`
- **Functions:** `fitLineupRidge`, `predictLineupResidual`, `lineupRatingsPer100`
- **Inputs:** offense/defense player ID lists + home flag; residual target = points − EPV
- **Output:** additive player coefficients (points per possession association)
- **Artifact:** `data/drbl/models/lineup-2024-25.json` version=drbl-ln-ridge-v1 players=553 λ=800
- **Synthetic lineup:** **YES** — swap IDs and rescore
- **Composite V for Approach A candidate:**
  ```text
  V(s0, L) = EPV(s0) + predictLineupResidual(L, β)
  ```
- **Caveat:** This makes Approach A algebraically close to LN coefficient differences vs replacement. M16c found LN adds no incremental RMSE after P — bakeoff may still be informative, but A is not an independent new value engine.

## 3. R1 replacement EP (Approach B)

- **File:** `drbl/models/replacement.ts`
- **Function:** `replacementExpectedPoints(state, role, pool)`
- **Formula:** `EPV(state) + clamp(mean residual of k nearest R1 by role)`
- **Does NOT** evaluate `V(s0, L_i→r)` under swapped lineup IDs

## 4. Sequential attribution (Approach B P)

- **File:** `drbl/models/sequential-attribution.ts`
- Credits `actualPoints − replacementEp` along observed events
- Uses realized path — retrospective, not pre-outcome counterfactual

## 5. Continuation / SDV

- Shot-decision and M7-CV models — not focal lineup counterfactuals
