# DRBL v2.1 — Source-of-Truth Implementation Plan

**Status:** authoritative plan for this repository  
**Spec:** *DRBL v2.1 — Proofread & Corrected Public-Data Implementation Specification* (August 2026)  
**Runtime today:** TypeScript / Next.js site + `drbl/` pipeline (not the Python stack named in the paper — same milestones, this repo’s stack)

This document is the build contract. When code and this plan disagree, **update the plan or the code deliberately** — do not silently invent tracking-like claims or collapse independent estimators.

---

## 1. Mission

Build a reproducible NBA player-impact system from **publicly observable** data.

DRBL estimates a **model-based counterfactual**: how much better a team performs with this player than with a **realistic, role-compatible replacement**, after controlling for the possessions, teammates, opponents, and states the player actually faced.

It does **not**:

- require proprietary optical tracking
- claim randomized causal effects
- treat box-score composites as the definition of impact
- invent defender locations, screens, or off-ball trajectories

---

## 2. Non-negotiable rules (v2.1 §22)

1. Cache every raw response (immutable; never overwrite).
2. Version every parser and feature definition.
3. Never silently ignore reconciliation failures.
4. Never use future information in features.
5. Separate retrospective vs real-time feature eligibility (`as_of_timestamp`).
6. Treat **DRBL-P**, **DRBL-LN**, and **DRBL-B** as independent estimators.
7. Use time-based out-of-fold (OOF) validation.
8. Publish uncertainty and component disagreement.
9. Never hand-tune to match famous players.
10. Do not claim direct measurement of unavailable tracking info.
11. Keep **DRBL-L** separate from **DRBL-WAR** (never add leverage into WAR).
12. Preserve reproducibility via model/data manifests.

**Counterfactual rule:** Do **not** define value as `EPV(with player) − EPV(with replacement)` unless the changed lineup/role state is explicitly represented and validated. Prefer counterfactual simulation (Approach A); otherwise use an explicit **marginal contribution** model with a documented identification strategy (Approach B).

**WAR rule:** Do not assume a fixed points→wins constant. Calibrate at team level on held-out seasons. If calibration fails, publish DRBL/100 and seasonal impact **without** forcing WAR.

**Success criterion:** Improve out-of-sample prediction and/or calibration vs strong baselines under a pre-registered evaluation protocol — not a “reasonable” leaderboard.

---

## 3. Estimators and outputs

| Estimator | Evidence | Question |
|-----------|----------|----------|
| **DRBL-P** | PBP, possession state, lineups, shot info | Marginal possession value attributable under observable state? |
| **DRBL-LN** | Lineup stints + possession outcomes | Impact associated with presence after lineup context? |
| **DRBL-B** | Public aggregate behavioral stats | Which measurable behaviors explain/predict impact? |

| Output | Meaning |
|--------|---------|
| **DRBL/100** | Shrunk latent impact per 100 player-involved possessions |
| **DRBL-WAR** | Realized seasonal value vs contextual replacement → wins via **validated** team calibration |
| **DRBL-L** | Leverage-weighted realized performance (descriptive only) |
| **DRBL-T** | Projected underlying talent (forecast; not retrospective value) |

Fusion: time-safe OOF predictions for P/LN/B → regularized meta-model (then optional hierarchical measurement model).  
`Disagreement = SD(P, LN, B)` is diagnostic — do not auto-penalize.

---

## 4. Architecture (target)

```
PUBLIC NBA DATA
        │
        ▼
 IMMUTABLE RAW CACHE  (JSON + metadata)
        │
        ▼
 CANONICAL DATA LAYER  (events / lineups / possessions / stats)
        │
   ┌────┴────┐
   ▼         ▼
 POSSESSION  PLAYER CONTEXT
 STATE
   │
   ├── DRBL-P
   ├── DRBL-LN
   └── DRBL-B
        │
        ▼
 OOF / HIERARCHICAL FUSION
        │
        ▼
    DRBL/100
     ├── DRBL-WAR
     ├── DRBL-L
     └── DRBL-T
```

A missing optional behavioral endpoint must not block DRBL-P or DRBL-LN.

### Canonical tables (minimum)

| Table | Contents |
|-------|----------|
| `games` | game_id, season, date, season_type, home/away |
| `events_raw` | game_id, endpoint, retrieved_at, raw_json, schema_hash, parser_version |
| `events` | action fields, shot/score fields |
| `lineup_stints` | five-man states + reconstruction_version |
| `possessions` | boundaries, points, reconciliation flags |
| `player_possession` | side, role, involvement, attribution confidence |
| `player_game` | minutes, box/advanced, source timestamps |
| `rolling_features` | value + as_of_timestamp + provenance |
| `player_season` | components, DRBL/100, WAR, uncertainty, N |
| `model_registry` | version, cutoff, feature_hash, metrics |

---

## 5. Milestone roadmap (v2.1 §21)

| ID | Deliverable | Done when… | Repo status |
|----|-------------|------------|-------------|
| **M1** | API / cache | One full season downloadable & reproducible from cache | **Mostly done** — CDN + stats PBP/box; immutable raw + `{file}.meta.json` (`schemaHash`, `parserVersion`, endpoint, retrievedAt). Full-season default still opt-in via CLI limits. |
| **M2** | Normalizer | Canonical event schema stable | **Partial** — `drbl/ingest/normalize.ts` → `DrblEvent`; parser version constant; fixtures TBD |
| **M3** | Possessions | Scoring/possession reconciliation passes | **Mostly done** — reconstruct + reconcile; edge-case unit tests; score failures **quarantined** under `_quarantine/` and skipped by `drbl:compute` |
| **M4** | Lineups | Five-man states reconcile to official minutes | **Mostly done** — settled five-on-five snapshots; per-game minute reconcile report (`reconcile.lineup`); ±2 min tolerance |
| **M5** | EPV | Time-safe OOF expected points calibrated | **Mostly done** — ridge EPV + chronological holdout + heuristic comparison (`npm run drbl:epv`); multi-season `--mode rolling` supported when data exists |
| **M6** | Shot decisions | Shot vs continuation validates OOS | **Standalone + season fields** — `sdv100`/`shotMaking100` via C2 continue in `drbl-post-m7-v1`; **NOT fused into drbl100** |
| **M15** | Backtest | Full benchmark/ablation report | **Diagnostic pass done** — `reports/m15/` (no math changes); full external bakeoff + M6 still open |
| **M7** | Replacement | Historical candidate pools cutoff-safe | **Partial / usable** — R1 role vectors + cutoff freeze + role-matched residual adj (`drbl/models/replacement.ts`) |
| **M8** | DRBL-P | Player marginal value reproducible | **Approach B v1** — two-pass compute vs R1 replacement EP; equal on-court share |
| **M9** | DRBL-LN | Regularized lineup model validates | **Done (v1)** — possession RAPM-style ridge (`lineup-model.ts`); chrono holdout MAE; ratings fused into DRBL/100 |
| **M10** | DRBL-B | Behavior features + provenance/timing | **Done (v1)** — public box/PBP ridge (`behavior.ts`); provenance + gravity proxy; fused into DRBL/100 |
| **M11** | Fusion | OOF stacking improves holdout | **Done (v1)** — chrono K-fold ridge stack (`fusion.ts`); published ratings are OOF; vs equal/lite MAE reported |
| **M12** | Uncertainty | Intervals calibrated | **Done (v1)** — OOF residual quantile scale (`uncertainty.ts`); ~80% half-width; coverage reported |
| **M13** | WAR | Team-level calibration validated | **Done (v1)** — team value→wins (`war.ts`); chrono holdout; falls back to provisional `/30` if OOF fails |
| **M14** | DRBL-L | Leverage output independent of WAR | **Done (v1)** — WP logistic ∂WP/∂EP (`leverage.ts`); λ* mean-normalized; DRBL-L = Σ value×λ*; never in WAR |
| **M15** | Backtest | Full benchmark/ablation report | **Diagnostic pass done** — `reports/m15/` (no math changes); full external bakeoff + M6 still open |

**Rule:** Do not start with ML. Priority after data trust is **M4 → M5 → M7 → M8 → M9**, then B / OOF fusion / WAR.

---

## 6. What ships on the site today (“DRBL-Core v0”)

Interim public surface — **not** full v2.1 fusion.

| Piece | Location |
|-------|----------|
| Phase A pipeline | `drbl/download`, `ingest`, `possessions` |
| Core v0 EP + attribution | `drbl/models/*` |
| Season compute CLI | `npm run drbl:compute` |
| Precomputed JSON | `src/data/drbl/precomputed/{season}.json` |
| Provider merge | `src/data/providers/nba/drbl-loader.ts` → `PlayerSeason` |
| UI | savant Value, advanced cols, percentiles, explore `sort=drbl100` |
| Explainer | `/learn/drbl` + glossary **Learn more** |

**Core v0 method (document honestly):**

1. Reconstruct possessions/lineups; reconcile to box.
2. `EPV(S)` ≈ expected points from coarse pre-possession state.
3. Residual = actual points − EPV; share across on-court O/D five.
4. Replacement ≈ same-context EPV (not role-matched R1).
5. Empirical-Bayes shrink (`k≈200`); WAR ≈ seasonal points / 30 (**uncalibrated**).

Label site copy as **DRBL-Core v0** until M8+ with validated components.

---

## 7. Implementation notes by subsystem

### 7.1 Possession reconstruction (M3)

State machine: keep control on OREB; close on make / TO / DREB / period end; and-1 stays on same possession; classify tech/admin FTs; resolve jump-ball control; flag end-of-period heaves.

Failed reconciliation → quarantine game (not training) until explained or excluded under a documented rule.

### 7.2 DRBL-P / EPV (M5–M8)

- `EPV(S_t) = E[points | S_t]` from **observable** state only.
- Baseline: regularized linear/GAM + GBM; keep simpler if comparable.
- Optional hurdle: `P(points=0)`, `E(points|points>0)`.
- Shot skill / SDV / pass value are separate dimensions (made ≠ good decision).

### 7.3 Replacement (M7)

Role vector: usage, creation, shot dist, rebounding, TO profile, defensive proxies, size/role, starter/bench, minutes capacity, roster realism.

Freeze candidate pool at historical date. Levels: **R1** contextual NBA (primary WAR), **R2** freely available, **R3** internal roster.

### 7.4 DRBL-LN (M9)

Possession/stint margin ~ player-on-court design + ridge; controls for opponent/teammate strength, home, transition/half-court, garbage time. Adjusted association — not causal unless separately identified.

### 7.5 DRBL-B (M10)

Optional aggregates with provenance: endpoint, coverage, `as_of_timestamp`, `post_game_only`, missing_rate, definition, parser_version.  
“Gravity” = **DRBL Gravity Proxy** only.

**v1:** `behavior.ts` builds public features (usage, three rate, AST/TOV/STL/BLK per 100, FT rate, rim rate from x/y, gravity proxy = teammate 3PA share on offense). Ridge predicts residual/100; chrono holdout MAE; writes `behavior-{season}.json`. Missing B does not block P/LN.

### 7.6 Defense

Decompose measurable components; strong shrink; claim *estimated suppression vs replacement*, never literal “caused X% of rim attempts to disappear.”

### 7.7 Leverage (M14)

`λ(s) ∝ ∂WP/∂ExpectedPoints`, normalized; `DRBL-L = Σ BaseValue × λ*`. Never folds into WAR.

**v1:** logistic offense WP from scoreDiff / √remainingPossessions; λ = |ΔWP| for +1 expected point; season mean-normalize to λ*; publish `drblL` and `meanLeverage`.

### 7.8 Validation (M15)

Leakage bans: future stats, final outcomes in pre-outcome features, future lineups, future replacement performance, same-possession outcome when predicting that possession, in-sample fusion inputs.

Rolling-origin folds (example): train …2022-23 / val 2023-24 / test 2024-25; then shift forward.

Ablation: P → P+LN → P+B → full. Drop components that don’t help holdout.

---

## 8. Data-use / deployment gate (v2.1 §24)

Before public or commercial launch, review current NBA.com Terms for statistics (attribution, commercial use, comprehensive regularly updated databases). Engineering validity ≠ legal permission to publish.

Checklist: permitted use, attribution, redistributing raw cache, displaying derived metrics, no implied NBA endorsement.

---

## 9. Working agreements for agents

1. Read this plan before changing `drbl/` or DRBL site fields.
2. Prefer advancing the **lowest incomplete milestone** that unblocks the next.
3. Any new public claim in UI/glossary must match the strongest claim the data support.
4. Site precomputed JSON remains the delivery path until a warehouse (Parquet/DuckDB) is introduced — schema should still match the canonical layer conceptually.
5. Update the **Repo status** column in §5 when a milestone’s “Done when…” is met.

---

## 10. Immediate next work (ordered)

1. ~~M3–M14~~ **done** (through formal DRBL-L)
2. **M6 / M15** — shot decisions + ablation backtests.

Commands: `npm run drbl:test`, `npm run drbl:compute`.

---

## References

- Terner & Franks (2021), *Modeling Player and Team Performance in Basketball*, ARSIA.
- NBA PlayByPlayV3 public field documentation.
- nba_api release history (endpoint/parser volatility).
- NBA.com Terms of Use — NBA Statistics section.
