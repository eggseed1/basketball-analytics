# M7 Research — Continuation Value / SDV Validation

**Pass type:** Research only (no DRBL fusion; M6 frozen)  
**Generated:** 2026-08-12  
**Scope label:** M7-CV (Continuation Value). This is **not** PLAN §7.3 Replacement (also called M7 in `drbl/PLAN.md`).  
**Frozen baselines:** `reports/m6/` (M6), `reports/m15/` (audit)

---

## Executive verdict

**The weakness in M6 SDV is primarily caused by a conceptually incorrect continuation value, not by ShotMaking.**

Current construction:

```
ÊPV_continue(S_t) := M5_EPV̂_possession(S_t)
```

is a **possession-start PPP model evaluated at a mid-possession shot timestamp**. It does not represent the counterfactual “continue instead of shoot.”

Diagnostic evidence (`m7_component_analysis.csv`, 120 games / 4207 holdout shots):

| Finding | Value | Implication |
|---------|------:|-------------|
| Std of ÊPV_continue at shot moments | **0.091** | Nearly flat |
| Corr(SDV, ÊPV_shoot) | **0.61** | SDV largely rescaled shot quality |
| Corr(SDV, ShotMaking) | **−0.02** | Making already separated |
| Corr(M5, remaining points) on continue-labeled states | **0.03** | M5 has ~no signal for mid-poss remaining value |
| MAE(M5 vs remaining) on continue-labeled states | **0.76** | Large absolute miss |
| Mean remaining vs mean M5 (continue states) | **0.72 vs 1.12** | M5 systematically overstates mid-poss remaining |
| Shot clock in CDN PBP | **absent** | Cannot model true remaining shot clock directly |

**Recommendation: GO** to implement a leakage-safe mid-possession continuation model (proposed C1/C2 below), as an isolated M7-CV experiment — **still NO fusion integration** until OOS validation passes the plan in `m7_validation_plan.md`.

---

## 1. Audit of current M6 continuation construction

### 1.1 What M6 does today

At each FG decision timestamp \(t\):

1. Build pre-outcome state \(S_t\) (score reversed if make already reflected).
2. \(\widehat{\mathrm{EPV}}_{\mathrm{shoot}}(S_t) = \hat P(\mathrm{make}\mid S_t)\cdot\mathrm{pointValue}\).
3. \(\widehat{\mathrm{EPV}}_{\mathrm{continue}}(S_t) = \texttt{predictExpectedPoints}(S_t)\) (M5).
4. \(\mathrm{SDV} = \widehat{\mathrm{EPV}}_{\mathrm{shoot}} - \widehat{\mathrm{EPV}}_{\mathrm{continue}}\).
5. \(\mathrm{ShotMaking} = \mathrm{observedShotPoints} - \widehat{\mathrm{EPV}}_{\mathrm{shoot}}\) (separate).

M5 features (`epv-model.ts`): home, period≥4, game-clock bins/norm, score-diff bins — trained as \(E[\text{full possession points}\mid S_{\text{start}}]\).

### 1.2 Conceptual mismatch (root cause)

| Aspect | What M5 estimates | What continuation needs |
|--------|-------------------|-------------------------|
| Timing | Possession **start** | Pre-shot decision **mid-possession** |
| Outcome window | Full possession PPP | Value of **not shooting now** from \(S_t\) |
| Action | Unconditional on next action | Conditioned on **continue** (pass/dribble/hold), not shoot |
| Information | Coarse game state | Remaining clock pressure, possession age / shot-clock proxy, on-ball context |

Calling M5 at \(S_t\) answers approximately:

> “If a new possession *started* in this clock/score state, expected points?”

not:

> “If this offense **continues** instead of taking this shot, expected points from here until possession end?”

### 1.3 What information is missing from the counterfactual

1. **Action conditioning** — continue vs shoot.
2. **Remaining possession value** — points from \(t\) forward under continue, not full PPP.
3. **Possession age / shot-clock pressure** — CDN PBP has **no `shotClock` field** (verified on raw `playbyplay.json`).
4. **On-ball / ballhandler state** — PBP lacks dribble/pass graphs; only coarse event types.
5. **Subsequent shot opportunity distribution** — expected quality of *future* shots if possession continues.
6. **Lineup/opponent mid-poss effects** beyond start-state PPP (partially available via priors; unused in continue today).
7. **OREB / foul / FT branches** after a non-shot path (structural).

### 1.4 Why SDV looks weak under C0

If \(\widehat{\mathrm{EPV}}_{\mathrm{continue}}\) is nearly constant \(c\), then:

\[
\mathrm{SDV}(S_t) \approx \widehat{\mathrm{EPV}}_{\mathrm{shoot}}(S_t) - c
\]

so SDV inherits shot-quality variation and loses decision contrast. Diagnostics match this (corr with ÊPV_shoot = 0.61; continue std = 0.09).

Next-possession correlation was never a valid primary test for current-decision SDV (see validation plan).

---

## 2. Component separation (must remain explicit)

| Symbol | Role | Must NOT absorb |
|--------|------|-----------------|
| \(\widehat{\mathrm{EPV}}_{\mathrm{shoot}}\) | Shot quality / expected points of *this* attempt | Making residual; continuation |
| \(\widehat{\mathrm{EPV}}_{\mathrm{continue}}\) | Value of not shooting at \(t\) | Shot outcome; same-decision make/miss |
| \(\mathrm{SDV}\) | Decision margin shoot − continue | ShotMaking |
| \(\mathrm{ShotMaking}\) | Outcome luck/skill vs shoot expectation | SDV |

A make may have \(\mathrm{SDV}<0\); a miss may have \(\mathrm{SDV}>0\).

---

## 3. Candidate continuation definitions

See `m7_target_definition.md` for formal targets. Summary:

| ID | Definition | Status |
|----|------------|--------|
| **C0** | M5 possession EPV at \(S_t\) (current M6) | **Reject as continue** (keep only as baseline comparator) |
| **C1** | Mid-possession remaining-points value conditioned on non-shoot action | **Preferred research target** |
| **C2** | C1 + possession-age / game-clock pressure features (shot-clock *proxy*) | Preferred feature expansion of C1 |
| **C3** | Structural max over continue actions (pass/drive) via transition model | Deferred — data-poor without tracking |
| **C4** | “Best subsequent shot opportunity” inside possession | Secondary / nested; higher selection risk |

**Do not optimize metrics until C1 target is accepted.**

---

## 4. Data constraints (hard)

| Need | Available in current DRBL CDN PBP? |
|------|-------------------------------------|
| Game clock, score, period, home | Yes |
| Lineups at possession | Yes |
| Shot location / 2pt vs 3pt | Yes |
| True remaining shot clock | **No** |
| Explicit pass / dribble actions | **No** (not as first-class actions) |
| Possession age = startClock − eventClock | **Yes (proxy)** |
| Points from event forward on possession | Yes (target-only) |

Therefore: **true shot-clock modeling is NO-GO** on current feeds. Possession-age proxy is GO with documented error (OREB resets, stoppages).

---

## 5. Proposed leakage-safe continuation model (design only)

**Estimate** \(\widehat V_{\mathrm{cont}}(S_t) \approx E[R_t \mid S_t, A_t \neq \mathrm{shoot}]\) where \(R_t\) = remaining offense points until possession end.

**Training rows:** mid-possession states whose *immediate* next recorded action is not an FGA (or: all states with an action-type indicator, fitting action-conditioned heads — prefer non-shoot for continue head).

**Features (timestamp-safe only):** see `m7_feature_provenance.csv`.

**Targets:** remaining points (post-decision outcomes allowed **only as Y**, never as X). Chronological OOF.

**At shot moments:** apply \(\widehat V_{\mathrm{cont}}(S_t)\) as ÊPV_continue without using the shot’s own outcome.

**SDV:** unchanged algebra: \(\mathrm{SDV} = \widehat{\mathrm{EPV}}_{\mathrm{shoot}} - \widehat V_{\mathrm{cont}}\).

M6 make model / ShotMaking left frozen unless a later pass explicitly revisits them.

---

## 6. Stronger SDV validation (not next-possession corr)

Primary tests live in `m7_validation_plan.md`. Headline replacements for next-poss corr:

1. **Continue-head calibration** on held-out non-shoot states (MAE/RMSE vs remaining points; beat C0).
2. **Orthogonality:** Corr(SDV, ShotMaking) ≈ 0; Corr(SDV, ÊPV_shoot) **materially lower** than C0’s 0.61 after continue improves.
3. **Matched-state policy check:** low-SDV shots should have ÊPV_shoot below empirical continue outcomes in matched \(S\) bins.
4. **Clock/age monotonicity diagnostics** (not ranking tuning).

---

## 7. Experiments run this pass

Isolated script: `scripts/drbl-m7-research.ts` (does not modify M6 sources).  
Output: `m7_component_analysis.csv`.

No fusion, WAR, replacement, shrinkage, DRBL-L, or precomputed leaderboard changes.

---

## 8. GO / NO-GO

### GO

1. **Implement M7-CV continuation model C1/C2** as a standalone module (new file / experiment harness), chronological OOF, vs C0 baseline.
2. **Replace ÊPV_continue in an experimental SDV** for validation only — still **not** fused into DRBL/100.
3. **Adopt the validation plan** that de-emphasizes next-possession correlation.

### NO-GO

1. **NO** DRBL fusion / weight / target / leaderboard changes in this phase.
2. **NO** claiming true shot-clock continuation without a new data source.
3. **NO** metric-chasing / ranking intuition tuning before C1 target acceptance.
4. **NO** using same-possession shot outcomes as features for continue or as the continue training label on shot rows.
5. **STOP condition:** if C1 cannot be formed without feeding post-decision features into X, or without a defensible action-conditioning rule → do not ship; document failure (see leakage report).

### Overall gate

| Gate | Decision |
|------|----------|
| Is C0 the right continue value? | **NO** |
| Is weakness largely from coarse continue? | **YES** |
| Is a better target conceptually defensible + leakage-safe? | **YES (C1/C2)** |
| Implement M7-CV continuation model next? | **GO** |
| Integrate into DRBL fusion now? | **NO-GO** |

---

## Deliverables

| File | Purpose |
|------|---------|
| `m7_research.md` | This document |
| `m7_target_definition.md` | Formal target algebra |
| `m7_feature_provenance.csv` | Feature/target provenance |
| `m7_leakage_report.csv` | Leakage audit |
| `m7_validation_plan.md` | OOS / SDV tests |
| `m7_component_analysis.csv` | Diagnostic experiment results |
