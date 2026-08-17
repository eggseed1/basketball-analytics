# M15 Final Diagnostic Report — STOP (no model changes)

**Pass:** live-400game refresh  
**Frozen:** `reports/m15/freeze/00_model_freeze_live.json`  
**Git:** `629bb1b…` (dirty)  
**Constraint honored:** No mathematical formulas / fusion / WAR / M6 / replacement methodology changed in this pass.

---

## 1. What is definitely wrong

| ID | Issue | Class |
|----|-------|-------|
| **A1** | Sequential reattribute merge **wipes LN/B/SDV to 0** on published players (`...n` overwrites) | **A implementation bug** |
| **A2** | Published ability lineage is **incoherent**: sequential raw P vs stale `fusedRateRaw` / posterior remasters | **A** |
| D1 | Live seasons are **400 games**, not full ~1230 | D sample design |
| D2 | Fusion target = **within-season future-block residual/100**, not next-game/next-season | D target misalignment |
| D3 | Replacement is **Approach B only** (no lineup-swap Approach A) | D |
| D4 | DRBL-B uses **post-game box** features (invalid for live) | C (live) / OK retrospective |
| D5 | No reserved multi-season test + no external bakeoff harness | D |
| D6 | M13 WAR **provisional**; learned conversion fails vs 1/30 at ~400-game samples (`14_*.csv`) | D/E |
| D7 | Dirty git; DRBL largely uncommitted | A process |

## 2. What is probably wrong

| ID | Issue | Class |
|----|-------|-------|
| P1 | Role-player / secondary-star inflation (e.g. high WAR for non-consensus names) driven by residual sharing + partial sample + wiped fusion components | D/E |
| P2 | Team clustering mixes legitimate strength and association (LN weight already 0 in fusion metadata; LN display dead) | G unresolved until A1 fixed |
| P3 | Defense optical suppression absent; gravity only in B (also wiped) | D incompleteness |

## 3. What is working correctly

- Core pipeline modules exist and are unit-tested (possessions, lineups, EPV, P, LN, B, fusion OOF, uncertainty, leverage, M6 standalone).
- **M6 implemented** with SDV / ShotMaking separation; **honestly gated** from fusion (`fusedIntoDrbl100: false`).
- M14 leverage does not redefine base `drbl100` / WAR in the leverage module.
- R1 pool cutoff-frozen.
- WAR multi-limit diagnostics already recorded (50 / 150 / 400 / 1225).
- Displayed fields match the JSON artifact (integrity of site↔DB path); the bug is **what the artifact contains**.

## 4. Suspicious rankings — primary causes (ordered)

1. **Implementation merge bug (A1/A2)** — published board is not clean fused P+LN+B  
2. **Partial-season sample (400 games)**  
3. **Fusion target misalignment** (even when fusion metadata present)  
4. **Approach B residual / sequential attribution**  
5. **Not M6** — M6 does not move published `drbl100`

## 5. Does M6 provide measurable incremental OOS value on published DRBL?

**No — incremental = 0 by construction** (`fusedIntoDrbl100: false`; live `sdv100` all zero after merge wipe).  
Standalone continuation signal is weak (continueCorrC2 ≈ **0.086** on 2024-25 artifact).  
**Do not fuse M6 without a dedicated OOS bakeoff after A1 is fixed and approved.**

## 6. Is M13 WAR genuinely validated?

**No — provisional.**  
From `14_war_multi_season_calibration.csv`:

| Season | Games | Calibrated vs 1/30? | Holdout corr (approx) |
|--------|------:|---------------------|----------------------:|
| 2024-25 | 50 | yes (learned) | ~0.71 |
| 2024-25 | 150 | yes | ~0.85 |
| 2024-25 | **400** | **NO — keep provisional** | ~0.66 |
| 2024-25 | **1225** | yes | ~0.91 |
| 2025-26 | similar pattern | fail at 400; pass at 1225 | |

Live 2024-25 site uses pipeline remaster (`warFormulaVersion` 4.0.0) with LOO slope ≈ 6.47 and fringe replacement ≈ −0.57 — still **not** multi-season final validation.

## 7. Exact sample sizes

| Use | Games |
|-----|------:|
| Live leaderboard 2024-25 / 2025-26 | **400** |
| Prior published freeze | **50** |
| Largest WAR calibration run in M15 CSV | **1225** per season |

## 8. Does 1/30 remain necessary?

**YES** as an explicit fallback when holdout MAE does not beat provisional (observed at 400-game samples).

## 9. Discard 50-game (and treat 400-game) boards?

**YES — discard 50-game as final season product.**  
**400-game is also not final season** — do not publish as full-season DRBL/WAR until full-season recompute **and** A1 fix (data/path repair only after approval).

## 10. What should change (PROPOSED — not implemented)

1. **Fix sequential merge** so LN/B/SDV (and fused ability) are not overwritten with zeros / P-only rates  
2. Full-season recompute for validation artifacts  
3. Reserved chronological test seasons + external bakeoff  
4. Fusion target redesign → next-block / next-season outcomes  
5. Approach A research or permanent Approach B labeling  
6. M6 OOS bakeoff **before** any fusion gate flip  
7. Multi-season WAR rolling validation; keep 1/30 fallback explicit  
8. Clean git freeze commit  

## 11. What should NOT change yet

- M6 equations (frozen)  
- Manual star boosts / consensus ranking fits  
- Silent deletion of 1/30  
- Tuning to DARKO/LEBRON/EPM  

## 12–13. Exact proposed math changes (deferred)

No coefficient changes applied. Highest-priority **non-math** repair: restore published component fields and a single coherent ability definition (fused vs sequential P — pick one with OOF proof).

Expected OOS impact: unknown until A1 fixed and ablations re-run; fixing A1 is prerequisite for any trustworthy ablation.

## 14. Ready for finalization?

**NO.**

---

### Top findings classification index

| Finding | Class |
|---------|-------|
| LN/B/SDV wiped by sequential merge | A |
| Ability field incoherence (raw vs fused vs posterior) | A |
| 400-game / 50-game partial boards | D |
| Fusion future-block residual target | D |
| Approach B only | D |
| Post-game B features for live | C |
| WAR provisional / 400-game fail | D/E |
| M6 gated + weak continue corr | F (honest) / E (signal weak) |
| Unusual stars/roles on live board | mix of A + D + sample |

### STOP

Await approval before any model or path implementation.
