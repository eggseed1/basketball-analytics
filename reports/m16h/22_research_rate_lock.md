# Research rate model lock (post-M16h audit)

**Status: LOCKED**

**Locked at:** 2026-08-12 (post-M16h audit)

**Evidence:** `reports/m16h/16_calibration_selection_decision.json`, `reports/m16h/19_model_health.json`

## Canonical specification

```text
rawAbilityRate
  →  EB(k=1600, priorMean=0)
  →  FINAL research DRBL/100
```

Equivalently, for player \(i\):

```text
DRBL100_i
  = N_i / (N_i + 1600)
    * (100 * Approach-B attributed value_i / N_i)
```

where:

| Symbol / term | Definition |
|---------------|------------|
| Approach-B attributed value | `drbl-seq-attr-v1` residual value vs R1 |
| \(N_i\) | actual combined possession appearances |
| prior mean | 0 |
| zero | R1 replacement baseline |
| posterior operations | exactly 1 |
| calibration coefficient | **1** (identity) |
| primary fusion | **NONE** |
| pseudo-exposure | **NONE** (`seasonalImpact` uses actual \(N\) only) |

## Versions

| Layer | Version |
|-------|---------|
| Attribution | `drbl-seq-attr-v1` |
| Research ability / posterior | `drbl-research-ability-v1` / `drbl-eb-posterior-k1600-v1` |
| Calibration | `drbl-calibration-identity-v1` |
| Final research rate | `drbl-research-rate-v1` |

## Calibration decision (immutable for this rate generation)

```text
CALIBRATION_SELECTION_RESULT = IDENTITY_SELECTED
b_final = 1
```

Zero-preserving linear RMSE change ≈ **0.0069%** (2.78196 → 2.78177 on F2–F5),
\(P(\text{beat identity})=0.636\), fold wins **2/4** — failed all practical gates.

Affine diagnostic: ~0.164% vs zero-linear; **BASELINE_SHIFT_SIGNAL = NO**.

## Explicit non-components of the primary rate

- LN — diagnostic only
- B — diagnostic only
- M6 — diagnostic only
- P/LN/B fusion — absent
- Second EB / EB200 stacking — absent
- Post-posterior scale multiplier — absent
- WAR conversion — separate layer (unchanged)
- Uncertainty — separate layer (next: M16i); must **not** alter the point estimate

## Note on RMSE subsets

| Metric | Universe | RMSE |
|--------|----------|------|
| M16g/M16g1 EB1600 | F1–F5 pooled | ≈ 2.696 |
| M16h identity (calibration eval) | F2–F5 only | ≈ 2.782 |

These are different evaluation subsets (F1 reserved as calibration warm-up). The larger M16h figure is **not** evidence the posterior degraded.

## Frozen systems (unchanged by this lock)

- Production `drbl100` / rankings / site
- WAR 4.0.1 / provisional WAR
- Legacy uncertainty (`drbl-uncertainty-v1`) — marked redesign-required
- O/D — `NOT_CANONICAL_YET`
- RESERVED_TEST — closed
- M16b VALIDATION — not used to reopen rate selection

## Next milestone

**M16i — P-only uncertainty model selection and coverage validation**

Must estimate predictive uncertainty around the **locked** DRBL/100 without changing it, without resurrecting P/LN/B disagreement as a default, and with coverage validated against chronological future error.
