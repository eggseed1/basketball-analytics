# Sequential attribution audit (DRBL-P seq-attr-v1)

## 1. Root cause found

Post–ranking-fix boards still overweighted finishers because **DRBL-P credited involvement-weighted shares of the full possession residual** `(points − replacementEP)`.

That residual is dominated by **make/miss outcomes**. Shooters received the largest involvement weights (base + event + FGA). **Assists were not in `DrblEvent`**, so creators rarely received credit beyond a silent on-court share.

This is a genuine **sequential attribution** failure: terminal conversion absorbed value that was created earlier.

## 2. Current (pre-fix) attribution formula

```text
replacementEp = EPV(state) + roleMatchedR1Residual
residual      = possession.points − replacementEp

weight_i = 1
         + 1[player appears on a possession event]
         + 1[player is FGA shooter]

offense_share_i = residual × weight_i / Σ weight_offense
defense_share_j = (−residual) × weight_j / Σ weight_defense
```

Assists/screens/drives/defender distance: **not used**.

## 3. Data limitations

| Feature | Status |
| --- | --- |
| FG/FT, x/y, rebound, TO, steal, block, foul | **Observed** (CDN) |
| Assist person id | **Strongly observed** on CDN (`assistPersonId`); now normalized; description `(Name AST)` fallback for stored JSON |
| Screens, drives, cuts, secondary assists, defender distance, shot clock | **Unavailable** — do not invent |
| Unobserved advantage creation | Parked in `unobserved` when no actor; not assigned to nearest event by fiat |

## 4. New state-value model

Player-neutral shot opportunity:

```text
contextEp = leagueAvgMake%(distance, isThree) × pointValue
```

No player name/position in `contextEp`.

Possession prior: Approach B `replacementEp` (same counterfactual as before).

## 5. Opportunity / execution decomposition

```text
opportunityDelta = contextEp − startEp
executionRaw     = actualPoints − contextEp
# Algebra: opportunity + execution = actual − startEp
```

- **Assisted, opportunity ≥ 0:** `connection` → assister; `execution` → shooter  
- **Unassisted:** `creation` (or negative `conversionOpportunity`) → shooter; `execution` → shooter  
- **Blocked miss:** half of negative execution to shooter; half to `unobserved` contest (not full miss to rebounder)

`EXECUTION_SKILL_FRACTION = 1.0` for stable totals so season value stays on the residual scale; season-level EB (`k=200`) still regularizes rates. A lower fraction was tested and **rejected** (collapsed WAR scale and revived small-sample ranks).

## 6. Rebound and turnover treatment

- **DREB:** mild weight bump only on defense’s `−residual` split — not the full miss swing.  
- **OREB:** no extra points (second-chance value is in the final shot credits).  
- **TO:** full `totalDelta` to TO actor; stealer gets full defensive opposite when observed.

## 7. Credit-conservation results

Automated tests (`sequential-attribution.test.ts`):

- Assisted make: offense sum ≈ `actual − startEp`; defense ≈ opposite  
- Miss + DREB: offense ≈ `−startEp`; DREB < half of swing  
- TO + steal: conserved; stealer credited  
- Outcome-luck: same connection credit for make vs miss on same assisted shot quality  
- Role/name invariance: identical state → identical credits regardless of id/label  

## 8. Regularization method

Unchanged EB on rates: `posterior = n/(n+200) × raw + …`. No second event-level shrink of execution for ranking totals.

## 9. Ensemble-calibration method

Unchanged OOF stack for LN/B when present. Sequential reform is **inside DRBL-P shares**. Full re-fit of fusion weights deferred; remaster merges new P-driven season value into the artifact.

## 10. Out-of-sample performance

Not re-fit in this pass (no new season-forward target). Predictive OOS for fusion/EPV remains as previously reported. This change is identified attribution, not a new stacking objective.

## 11. Role-bias diagnostics

On 400-game sequential reattribute (`reports/sequential-attribution/`):

- Top-10 median possessions ≈ **3620** (healthy volume)  
- Top creators (e.g. SGA, Tatum, Wagner) show higher `creationValuePer100` than pure finishers  
- `connectionValuePer100` remains **small** on average — expected when `contextEp ≈ startEp` for many jumpers; **rim assists** get more connection credit. Open-three creation still mostly unobserved without tracking/gravity.  
- DRBL-B assist features remain the retrospective box proxy for that gap.

Do **not** interpret positional balance as a success metric.

## 12. Files changed

- `drbl/types.ts` — related actor fields  
- `drbl/ingest/normalize.ts` — CDN assist/steal/block ids  
- `drbl/models/sequential-attribution.ts` — new module  
- `drbl/models/player-value.ts` — sequential shares + category rates  
- `drbl/models/__tests__/sequential-attribution.test.ts`  
- `scripts/drbl-sequential-reattribute.ts`  
- `docs/sequential-attribution-audit.md`  
- Outputs under `reports/sequential-attribution/`  
- Updated `src/data/drbl/precomputed/2024-25.json`

## 13. Tests added

Conservation, outcome-luck, role/name invariance, assist parse/resolve, Phase-17 algebraic check.

**Suite: 70 passed** (after EXEC_FRAC fix).

## 14. Before/after leaderboard (400 games, season_value)

**Sequential top 10 (stable residual split):** Nikola Jokić, Nikola Vučević, Franz Wagner, Norman Powell, Jayson Tatum, De'Andre Hunter, Shai Gilgeous-Alexander, Tyler Herro, Domantas Sabonis, Pascal Siakam.

Creators (SGA, Tatum, Wagner) appear with measurable creation rates; connection remains limited by data.

## 15. Remaining limitations

- **No possession-level screens/drives/cuts/closest defender/shot clock** in CDN PBP. Public **season aggregates** exist on stats.nba.com (Drives, Hustle screen assists, shot-clock / defender-distance **buckets**) — see `docs/public-tracking-data.md`. Do not fabricate event streams from those totals.
- **Possession-age proxy** (game-clock delta) supplies a weak late-clock assist boost; it is not a real shot clock.
- Open-three assists still get limited base connection when `contextEp ≈ startEp`; age boost helps only late-clock creations.
- Player-neutral make model is bucket-heuristic (not OOF-calibrated shot model).
- Fusion weights not re-learned after P share change.
- Defense still mostly equal-ish share of `−residual` with mild event bumps.
- Success is **not** agreement with media rankings.

## Commands

```bash
npm run drbl:test
npm run drbl:sequential -- 2024-25 400
npm run drbl:sequential -- 2025-26 400
```
