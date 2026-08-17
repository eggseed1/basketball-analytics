# M7 Validation Plan — Continuation & SDV (no fusion)

**Principle:** Validate components separately. Do **not** use next-possession correlation as the primary SDV test. Do **not** tune rankings by intuition.

**Chronology:** All fits use expanding / chronological game splits (same discipline as M6).

---

## A. What was wrong with M6’s primary SDV diagnostic

M6 reported `corr(SDV, next_offense_possession_points) ≈ 0.025`.

That target is:

- about a **different** possession,
- weakly related to whether *this* shot was +EV vs continue,
- easy to “fail” even with a perfect current-decision SDV.

Retain it only as a **tertiary** sanity metric (expect near-zero).

---

## B. Gate 0 — Target / leakage acceptance (research)

Must be TRUE before implementation counts as success:

| # | Gate | Evidence |
|---|------|----------|
| G0.1 | Continue estimand is C1/C2 remaining value under non-shoot | `m7_target_definition.md` accepted |
| G0.2 | Every feature PASS in leakage report | `m7_leakage_report.csv` |
| G0.3 | Targets may use post-state points; features may not | Code review + provenance |
| G0.4 | ShotMaking stays separate from SDV | Component schema test |

---

## C. Gate 1 — Continuation model OOS (primary for ÊPV_continue)

**Population:** holdout continue-labeled states \(\mathcal{C}\) (not shot rows).

| Test | Metric | Pass guideline |
|------|--------|----------------|
| C1.1 Beat C0 | MAE / RMSE of \(\widehat V_{\mathrm{cont}}\) vs \(Y^{\mathrm{cont}}\) | MAE strictly < C0 MAE (diagnostic: C0 MAE ≈ 0.76 on 120g sample) |
| C1.2 Signal | Corr(\(\widehat V_{\mathrm{cont}}\), \(Y^{\mathrm{cont}}\)) | Clearly > C0’s ~0.03; prefer ≥ 0.15 as soft floor on similar sample |
| C1.3 Calibration | Bin mean pred vs mean actual remaining | Monotone; no huge bias in central bins |
| C1.4 Age/clock response | Mean \(\widehat V\) by possession-age / late clock | Directionally lower when clock pressure high (diagnostic, not a loss) |

**Failure → STOP** replacing C0.

---

## D. Gate 2 — Shot quality unchanged (ÊPV_shoot)

M6 make model may stay frozen for M7-CV.

| Test | Metric | Pass guideline |
|------|--------|----------------|
| S1 | Holdout make MAE / log-loss vs bucket baseline | No regression vs frozen M6 artifact |
| S2 | ShotMaking mean ≈ 0 | |mean| small (M6: −0.007) |
| S3 | pMake calibration bins | Stable vs M6 report |

---

## E. Gate 3 — SDV structure (primary for decision margin)

Build **experimental** SDV with new continue; do not publish to DRBL.

| Test | Metric | Pass guideline |
|------|--------|----------------|
| D1 Orthogonality to making | Corr(SDV, ShotMaking) | ≈ 0 (M6 already ~−0.02; must not blow up) |
| D2 Not just shot quality | Corr(SDV, ÊPV_shoot) | **Materially below** C0’s ~0.61 |
| D3 Decision ≠ outcome | Share of makes with SDV<0; misses with SDV>0 | Non-trivial rates remain |
| D4 Matched-state policy | In bins of \(S\) (clock×age×distance), compare mean ÊPV_shoot for shots vs empirical mean \(Y^{\mathrm{cont}}\) for continues | Low-SDV shots should sit below matched continue means more often than high-SDV shots |
| D5 Variance attribution | Var(SDV) split vs Var(ÊPV_shoot) and Var(ÊPV_continue) | Continue must contribute meaningful variance (C0 continue std ~0.09 was too low) |

---

## F. Gate 4 — Explicit non-tests (do not optimize)

| Anti-pattern | Why banned |
|--------------|------------|
| Maximize corr(SDV, next possession points) | Wrong estimand |
| Move public leaderboard / intuition rank fixes | User rule + M15 |
| Fold ShotMaking into SDV to “look better” | Violates separation |
| Train continue on shot rows using realized FG points as Y | Forces continue ≈ shoot |

---

## G. Reporting artifacts for a future implementation pass

When C1/C2 is implemented (separate from this research pass), write:

- `reports/m7/impl/m7_continue_oos.csv`
- `reports/m7/impl/m7_sdv_structure.csv`
- `reports/m7/impl/m7_leakage_report.csv` (re-run)
- Update GO/NO-GO for **fusion eligibility** (default remains NO)

---

## H. Fusion eligibility (future; currently NO-GO)

Fusion may be considered **only if** Gates 0–3 pass on ≥ one full season chronological holdout **and** a written decision memo approves integration. This research pass does **not** grant fusion eligibility.
