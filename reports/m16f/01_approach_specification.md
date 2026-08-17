# M16f Approach A vs Approach B — Specification

**Status:** `APPROACH_A_SPEC_MISSING` — bakeoff **stopped** before implementation.  
**Date:** 2026-08-12  
**Rule:** Do not invent Approach A during M16f execution.

---

## Sources searched

| Location | Finding |
|---|---|
| `drbl/PLAN.md` §2 Counterfactual rule | Prefers Approach A (lineup/role simulation) **if** changed state is explicitly represented and validated; otherwise Approach B |
| `drbl/models/player-value.ts` header | Spec prefers A; **this remains B**; “do not claim full counterfactual simulation until Approach A exists” |
| `drbl/models/replacement.ts` | R1 is **not** a simulated lineup swap; A deferred |
| `reports/post-m7/remediation_implementation.md` | **PM7-003 Approach A — product/underdetermined; Approach B labeled** |
| `scripts/drbl-post-m7-remediate.ts` | Same: PM7-003 product decision |
| `reports/m15/20_final_recommendations.md` | D3: Replacement is Approach B only; recommends “Approach A research **or** permanent Approach B labeling” |
| `reports/m15/22_a1_a2_path_repair.md` | “No Approach A replacement” |
| `docs/sequential-attribution-audit.md` | Documents **Approach B** sequential attribution (`drbl-seq-attr-v1`) only |
| `reports/m7/m7_target_definition.md` | Continuation-value targets for SDV — **not** a lineup-swap Approach A for DRBL-P |
| Glob `*approach*` | Only `reports/m16e0/14_approach_ab_readiness.md` (readiness, no A formula) |

**Conclusion:** Repository contains a clear **intent** for Approach A (simulate player↔replacement lineup/role counterfactual) but **no implementable formula set** for possession-level A attribution. Approach B is fully coded and documented.

---

## Approach B — formal specification (implemented)

**Version:** `drbl-seq-attr-v1` + R1 replacement (`replacement.ts`) + season aggregation in `player-value.ts`  
**Label:** DRBL-P Approach B — marginal contribution vs contextual replacement

### Input possession representation

- Canonical `DrblPossession` + `DrblEvent[]` from normalized PBP
- Lineups: `offensePlayerIds`, `defensePlayerIds`
- Pre-possession state for EPV: `PossessionEpState` (period, score margin, home/away, etc.)

### State definition

- Possession-start state \(S_0\) used for M5 EPV
- Within-possession sequential states at observed events (shot, TO, rebound, …)

### Initial state value

```text
contextEp_M5 = predictExpectedPoints(S_0)     # M5 possession EPV
replacementEp = replacementExpectedPoints(
  S_0, role, R1_pool
)
# = contextEp_M5 + roleMatchedR1Residual (clamped)
startEp := replacementEp
```

### Intermediate / terminal value handling

Sequential attribution (`attributePossessionSequential`):

```text
totalDelta = actualPoints − startEp
```

Credits assigned by category along the observed path:

| Category | Role |
|---|---|
| creation | Advancing advantage (nonterminal) |
| connection | Assist credit |
| conversionOpportunity | Player-neutral shot context EP |
| execution | actual − contextEP residual (stable fraction = `EXECUTION_SKILL_FRACTION`, currently 1.0) |
| recovery | Offensive rebound / reset |
| turnover | TO responsibility |
| defense | Defensive share of −totalDelta |
| unobserved | Parked when no actor (no invented screens/cuts) |
| outcomeNoise | Diagnostic only when execution fraction &lt; 1 |

### Shot handling

```text
contextEp_shot = playerNeutralShotEp(isThree, distance, pointValue)
# league-average make% × points — no player identity
execution ≈ actualShotPoints − contextEp_shot
```

Assist → connection credit when assist id / description present.

### Turnover / rebound / foul / FT / transition

- Implemented as event-driven sequential credits in `sequential-attribution.ts`
- Defense receives involvement-weighted share of −totalDelta
- No simulated alternate lineup after TO

### Player credit assignment

```text
For each possession:
  credits_i = sequential attribution of (actual − replacementEp)
  player.totalValue += stableAmount_i
  player.possessions += 1   # each side appearance (off or def)
```

### Team / unobserved credit

- Explicit `unobserved` category when advantage has no observed actor
- Does **not** invent gravity/screens from PBP

### Credit conservation (intended)

```text
sum(offense accounting credits + unobserved) ≈ totalDelta
sum(defense accounting) ≈ −totalDelta
```

(Exact tolerances enforced in sequential-attribution tests.)

### Normalization denominator

```text
rawAbilityRate = 100 × totalValue / N_combined
N_combined = offensiveAppearances + defensiveAppearances
```

### Output P field

```text
P := raw / early-block residual rate used in eval stacks
   (M16c path: earlyFrac=0.7 future_block_residual_per_100)
```

Production display uses fused/posterior layers **outside** M16f primary comparison.

### Parameters

| Kind | Values |
|---|---|
| Fixed | `SEQUENTIAL_ATTRIBUTION_VERSION`, `EXECUTION_SKILL_FRACTION=1.0`, neutral make% buckets, R1 role distance weights |
| Learned (upstream, frozen for M16f) | M5 EPV model; R1 pool from cutoff-safe history |
| Free for A/B bakeoff | **None** — B is incumbent frozen algorithm |

---

## Approach A — intended meaning only (NOT implementable)

From `PLAN.md` / `player-value.ts` / `replacement.ts`:

> Prefer **counterfactual simulation**: value ≈ performance with player vs with a **realistic role-compatible replacement** under an **explicitly changed lineup/role state**, validated — i.e.  
> `EPV(with player) − EPV(with replacement)` **only if** the changed state is represented.

Also described as **lineup-swap** simulation (`simulates_lineup_swap: NO` in M15 audits).

### What is **not** specified

Approach A lacks repository-backed answers for the fields required by M16f Phase 1:

| Required field | Status |
|---|---|
| input possession representation (A-specific) | Missing |
| state definition after swap | Missing |
| initial state value under counterfactual lineup | Missing |
| intermediate state values under A | Missing |
| terminal / shot / TO / rebound / foul / FT / transition under swap | Missing |
| player credit assignment under simulated path | Missing |
| team/unobserved credit under A | Missing |
| defensive vs offensive credit under A | Missing |
| credit conservation identity for A | Missing |
| normalization denominator for A | Missing |
| output `pApproachA` field definition | Missing |
| free / learned / fixed parameters for A | Missing |
| which players are swapped (focal only vs full role match) | Missing |
| how many Monte Carlo / closed-form paths | Missing |
| whether teammates/opponents adjust endogenously | Missing |
| validation protocol for the simulated state itself | Missing |

### Confusable-but-not-A systems

| System | Why it is not Approach A |
|---|---|
| Sequential attribution v1 | Fixes **credit timing** within Approach B residual; still uses R1 replacement EP, not lineup swap |
| M7 continuation value (C1/C2) | Shot-decision continue EPV; not player↔replacement lineup counterfactual |
| Involvement-weighted residual shares (pre-seq) | Older Approach B, not A |

---

## Intended difference (when A exists)

```text
dimension              Approach A (intent)              Approach B (implemented)
---------------------------------------------------------------------------------
counterfactual         Simulate lineup/role swap        Marginal residual vs R1 EP
state model            Explicit changed lineup state    Observed lineup only
value model            EPV(player) − EPV(replacement)   actual − replacementEp(R1)
credit assignment      TBD on simulated path            Sequential categories on observed path
terminal attribution   TBD                              Observed shot/execution path
continuation           TBD                              Observed events only
execution              TBD                              Neutral context EP + residual
defense                TBD                              Share of −totalDelta
normalization          TBD                              / N_combined appearances
```

```text
INTENDED_DIFFERENCE
= identification strategy for the replacement counterfactual
  (simulate changed lineup/role vs residual vs contextual R1 EP)
```

All other layers (target, splits, eligibility, aggregation, WAR, posterior) must stay shared.

---

## STOP

```text
STOP
APPROACH_A_SPEC_MISSING
```

M16f cannot proceed to implementation, conservation audits, or P_A vs P_B scoring without inventing modeling choices — which the milestone forbids.

---

## Missing decisions required before restarting M16f

Product/research must predeclare:

1. **Counterfactual object**  
   Swap only the focal player ↔ one R1 replacement, or rebuild full five-man offense/defense?

2. **Replacement identity**  
   Same R1 pool/role match as B, or a different replacement definition?

3. **State engine**  
   Closed-form EPV under alternate lineup features, or event-level re-simulation?

4. **Path measure**  
   Single expected-path value, or Monte Carlo over action/outcome draws? Seed protocol?

5. **Credit assignment on the simulated path**  
   Who gets `EPV_player − EPV_replacement` — focal only, or share with teammates?

6. **Defense**  
   How is defensive counterfactual defined when the focal player is on defense?

7. **Conservation identity** for A possession totals.

8. **Denominator** for rate P_A (paired vs combined appearances) — must match B’s eval field semantics.

9. **Leakage rule**  
   What future information is allowed in retrospective simulation vs forbidden for future-block prediction features?

10. **Version string** and frozen parameter list for A (so A cannot be tuned on VALIDATION).

11. **Explicit non-goals**  
    Confirm sequential-attribution redesign alone is **not** labeled Approach A.

Until these are written into a repository-backed spec (and approved), keep:

```text
M16F_NEXT_P_ARCHITECTURE = Approach B (incumbent)
```

by the indistinguishability / missing-challenger default — A has not entered the arena.
