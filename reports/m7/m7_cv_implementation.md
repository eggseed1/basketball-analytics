# M7-CV Implementation Report

**Version:** drbl-m7-cv-continuation-v1  
**Generated:** 2026-08-12T03:37:42.755Z  
**Parser:** drbl-parser-2026.08.11  
**Reconstruction:** drbl-recon-2026.08.11  

## Scope

Isolated C1/C2 continuation-value implementation.

- **M6 frozen** (not overwritten; coefficients unused for continue)
- **C0 retained** as M5 baseline comparator
- **No DRBL fusion / DRBL100 / leaderboard changes**
- Possession age = **shot-clock PROXY only** (CDN PBP has no shot clock)

## Estimand

```
V_cont(S) = E[ remaining possession points | S, A ≠ shoot ]
SDV       = ÊPV_shoot − V_cont     // ÊPV_shoot from frozen M6 OOF
ShotMaking = observedShotPoints − ÊPV_shoot   // unchanged, separate
```

### Training population

**Primary:** age-grid states \(\tau \in \{0,4,8,12,16,20,24\}\) on possessions that have **not yet attempted a FGA** at age \(\tau\) (still continuing).  
**Supplemental:** pre-first-FGA non-bookkeeping, non-turnover, non-FGA events.  
Y = offense points from that time until possession end (**target only**).

> Note: An earlier event-only label mix (heavy on turnovers) collapsed \(V_{\mathrm{cont}}\) at shot moments; age-grid labels were required for a non-flat, shot-applicable continue surface. This is still **not** true shot-clock modeling.

### Features

- **C1:** bias, offenseIsHome, periodGe4, clockLe4, clockLe8, clockLe24, clockNorm, absDiffGe10, absDiffGe20, trailingGe10, leadingGe10
- **C2:** bias, offenseIsHome, periodGe4, clockLe4, clockLe8, clockLe24, clockNorm, absDiffGe10, absDiffGe20, trailingGe10, leadingGe10, possessionAgeNorm, ageGe8, ageGe14, ageGe20, startedViaOreb, startedViaSteal, teamPriorPpp, oppPriorPppAllowed

## Data

| Item | Value |
|------|------:|
| Season | 2024-25 |
| Limit | 200 |
| Games processed | 200 |
| Games failed | 0 |
| Train continue rows | 40561 |
| Holdout continue rows | 9999 |
| Holdout shots (SDV) | 7139 |
| Holdout frac | 0.2 |

## Gate results (validation plan)

| Gate | Result | Notes |
|------|--------|-------|
| G0 leakage / target | PASS | See `m7_cv_leakage_report.csv` |
| C1.1 MAE beat C0 | C1 PASS / C2 PASS | C0 MAE=1.0323, C1=1.0308, C2=1.0225 |
| C1.2 Corr vs remaining | C1 PASS / C2 PASS | C0 r=0.0131, C1 r=0.0557, C2 r=0.1103 |
| Gate1 overall | PASS | |
| S1/S2 M6 shoot frozen | PASS | make MAE=0.4790; ShotMaking mean=-0.0069 |
| D2 SDV⊥̸shoot reduced | PASS | C0 corr=0.6288 → C2 corr=0.4814 |
| D1 SDV⊥making | PASS | C2 corr(SDV,ShotMaking)=-0.0367 |
| D5 non-flat V_cont | PASS | std C0=0.0944 vs C2=0.1537 |
| Gate3 overall | PASS | |
| Fixes C0 continue problem? | YES (partial) | Prefer **C2**: non-flat V at shots, corr(remaining)↑, SDV↔shoot ↓. MAE gain small; corr soft-floor 0.15 not fully met (0.11). **C1 worsens** SDV↔shoot — do not prefer C1. |
| Fusion now | **NO-GO** | Keep C2 experimental only; no DRBL100 integration |

## Files

- `drbl/models/continuation-value.ts`
- `drbl/models/__tests__/continuation-value.test.ts`
- `scripts/drbl-m7-cv-validate.ts`
- Reports: `m7_cv_*.csv` / this file

## Explicit non-goals

No fusion weights, fusion target, WAR, shrinkage, DRBL-L, or public precomputed rewrites.
