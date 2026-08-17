# 06 — Validation Evidence

All figures below are copied from sealed reports under `supporting_reports/`. Do not treat M17c/M18b as complete.

---

## A. Point-estimate reserved (M16j) — ESTABLISHED

- Verdict: **STRONG_PASS**
- Seal: `84f4eadccb536f058194acb4db730c044ea413036456e072952d89a64600d742`
- Point freeze: `942b21ef78ba0a142549f8a2b62338993e133f17b8bb1ff7b94fc8844ad9297c`
- Posterior: EB1600, prior 0, identity calibration, P-only
- Primary reserved success vs raw: YES (research RMSE 2.1855 vs raw 2.3547)
- Reserved may **not** be reused for future point/uncertainty tuning

Evidence class: previously consumed reserved holdout.

---

## B. R1 value reserved (M16l2) — ESTABLISHED

- Overall verdict: **STRONG_PASS**
- Seal: `dc556c3560c567d52139f991be9d17ecea8b94a6951ac5c6fedf59abb17342aa`
- `WAR_RESERVED_2025_26_STATUS = CONSUMED_ONCE`
- Accounting zero-sum checks passed in seal metrics
- Product cutover M16l3 hash: `48a9d39ec21cf57c91b57d5ddbc4891a38e0ec18ddf1d578e37b2d8e3c948305`

---

## C. Multi-season temporal (M17b) — ESTABLISHED on Tier B

- Verdict: **STRONG_MULTI_SEASON_PASS**
- Seal: `b606cf603c7f10acbad9ad6fd1b1869d2f12fcfa4bd461a1e689b82477fb238c`
- Supported seasons: 2020-21…2023-24 (Tier B)
- Season→next EB wins RMSE **4/4**, MAE **4/4**
- Early/late EB wins RMSE **5/5**, MAE **5/5**
- Pooled season→next ΔRMSE (EB−raw): **-0.2757** (bootstrap CI entirely negative; P(improve)=1 in seal)
- Team-change signal: YES (EB RMSE 1.558 vs raw 1.908)
- Negative catastrophic window: NO
- M16j replication: PASS as **PREVIOUSLY_CONSUMED_REPLICATION** (not new holdout)
- External metrics as target: NO; reputation tuning: NO
- 2025-26 treated as new holdout: NO

---

## D. UIR reserved (M18a) — ESTABLISHED residual; off-ball NO

- Validation verdict: PASS_TO_RESERVED  
- Reserved verdict: **STRONG_PASS**
- Seal: `ba98a6529b18d63ab825eab92f1b606a974b4950b3d1c879eb5378054427391f`
- Selected: UIR-C @ λ=3200
- Reserved Target A ΔRMSE: **-0.0712** (bootstrap CI negative)
- Reserved Target B ΔRMSE: small negative  
- Team-change / low-context continuity signals: YES  
- `OFFBALL_VALUE_ESTABLISHED = NO`

---

## E. Tracking readiness (M18b.0) — readiness only

- Seal: `ade47897cd8ca7c0786bee5d0925e86778c2f27c122e5cd332076e7d259e1763`
- Local tier **T3**; acquisition **POSSIBLE_REQUIRES_USER_ACCESS**
- Player-value validation **not** authorized without access
- Full M18b: **NOT_STARTED**

---

## F. Integration regressions — ESTABLISHED vs analytics premerge `72272b2`

### Current production (`09_current_production_regression.json`)

| Season | DRBL | R1 | R1WinEq | Rank |
|---|---|---|---|---|
| 2024-25 | 0 | 0 | 0 | 0 |
| 2025-26 | 0 | 0 | 0 | 0 |

Method: git hash-object equality vs analytics premerge.

### Historical (`10_historical_regression.json`)

Seasons 2020-21…2023-24: DRBL/R1/R1WinEq/rank mismatches **0**.

### Engineering

- DRBL tests 201/201 PASS  
- Typecheck PASS  
- Build PASS  
- UI smoke PASS (infra)  
- Web-specific: `test:data-truth` PASS; `test:site-nav` PASS; `test:drbl-release:fixture` **PARTIAL** (team-identity live schedule sample miss) — **PRODUCT debt**, not model regression  

---

## G. Not validated here

| Item | Status |
|---|---|
| M17c external common-target benchmark | **NOT_STARTED** |
| Optical off-ball identification | **NOT_STARTED** / access blocked |
| P1 era robustness | **NOT_ESTABLISHED** |
| Calibrated predictive uncertainty | **UNRESOLVED** |
| Approach A counterfactual | **NOT SHIPPED** |
