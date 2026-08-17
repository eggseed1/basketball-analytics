# Player ranking audit (rankingFormulaVersion 2.0.0)

## Root cause

The published top-100 leaderboard was an **ordinal descending sort of `drbl100`** (fused per-100 rate), applied after eligibility filtering. Realized season value (`seasonalImpact` / `drblWar`) was computed but **never used as the ranking score**. Truncating/selecting on the noisy rate excluded high-minute players who were outside the top 100 by `drbl100` but would rank inside by season value (e.g. several All-NBA creators). Re-sorting only the exported 100 could not restore them.

Secondary issues:

- Small-sample winner’s curse on rate extremes.
- Component “disagreement” = raw population SD of `drblP`, `drblLn`, `drblB` on mismatched scales.
- Uncertainty half-width capped at 4 and unused for ranking.
- Forensic `seasonalImpact ≈ drblP·(n+200)/100` is an **empirical-Bayes algebraic identity** with `totalValue = raw·n/100`, not evidence that the accumulator added prior pseudo-possessions to exposure. The formula must still be written with **actual possessions only**.

## Verified old formulas

From `finalizePlayerSeasonRows` (pre-2.0) and the frozen export `reports/ranking-audit/legacy_top100_2024_25_by_drbl100.csv`:

| Field | Old behavior |
| --- | --- |
| `rank` | Descending ordinal of `drbl100` |
| `drbl100` | OOF fusion (or lite blend) of P/LN/B — **sort key** |
| `seasonalImpact` | `accumulator.totalValue` (= `rawRate · actualPossessions / 100`) |
| `drblWar` | `seasonalImpact × pointsToWins` with provisional `pointsToWins = 1/30` |
| `disagreement` | `populationSD(drblP, drblLn, drblB)` |
| `uncertainty` | `min(maxHalfWidth=4, scaleMultiplier · (1/√(n/100) + coef·disagreement))` |
| `intervalLo/Hi` | `drbl100 ± uncertainty` |

Forensic fit constants (~37.12, ~0.555) come from fitted `scaleMultiplier` × raw scale, not hardcoded literals in source.

## Corrected ranking definition

`rankingFormulaVersion = "2.0.0"`.

Three explicit modes (`drbl/models/ranking-config.ts`):

1. **`ability`** — `finalRankingScore = posteriorAbilityRate` (EB-shrunk fused rate).
2. **`ability_conservative`** — posterior − `confidencePenalty · abilityStandardError`.
3. **`season_value`** (default leaderboard) — `finalRankingScore = seasonWar`.
4. **`forecast_value`** — `finalRankingScore = forecastWar` over explicit `forecastPossessions` (default 2500).

Architecture:

```text
all players → components → posterior ability → season/forecast value
  → finalRankingScore → filter eligible → stable sort → top N → rank
```

Default mode is **`season_value`** because the product’s prior “top 100” export was functioning as a season leaderboard while sorting a rate. Ability remains available; `drbl100` is redefined as **posterior ability rate**, not the sort key under the default mode.

### Corrected formulas

```text
rawAbilityRate = 100 * totalValue / actualPossessions

posteriorAbilityRate = reliability * fusedRateRaw + (1-reliability) * priorMean
reliability = actualPossessions / (actualPossessions + priorEquivalentPossessions)
priorEquivalentPossessions = 200   # shrinkage only
priorMean = 0                       # Approach B residuals vs R1

seasonalImpact = rawAbilityRate * actualPossessions / 100
               = totalValue
# NEVER (actualPossessions + priorEquivalentPossessions)

seasonWar = seasonalImpact * pointsPerWin
pointsPerWin = 1/30 (provisional; WAR module may override when calibrated)
replacementLevelRate = 0  # residuals already vs R1 replacement

forecastImpact = posteriorAbilityRate * forecastPossessions / 100
forecastWar = (posteriorAbilityRate - replacementLevelRate)
              * forecastPossessions / 100 * pointsPerWin

componentDisagreementIndex = SD(z-scored components)
abilityStandardError = sqrt(samplingSe² + modelSe²)
interval = posterior ± intervalCriticalValue * analyticalSE
displayUncertainty = min(4, analytical half-width)  # charts only
```

## Statistical corrections

| Issue | Fix |
| --- | --- |
| Rank by intermediate rate | Rank by `finalRankingScore` |
| Top-100 before full score | Score all eligible, then truncate |
| Prior in exposure | Exposure = `actualPossessions` only |
| Raw component SD | Standardized disagreement index |
| Uncertainty cap | Cap display only; export analytical SE uncapped |
| Magic 30 | Named `pointsPerWin` with R1 WAR semantics |
| Double meaning of `possessions` | `actualPossessions` vs `priorEquivalentPossessions` vs `forecastPossessions` |

## Files changed

- `drbl/models/ranking-config.ts` — typed config + version
- `drbl/models/leaderboard.ts` — EB, impact, WAR, sort, leaderboard
- `drbl/models/player-value.ts` — `finalizePlayerSeasonRows` v2
- `drbl/models/compute-season.ts` — artifact version metadata
- `scripts/drbl-ranking-remaster.ts` — remaster existing artifacts
- `scripts/export-drbl-top100.ts` — export by final score / rank
- `drbl/models/__tests__/leaderboard.test.ts`
- `drbl/models/__tests__/ranking-forensics.test.ts`
- `docs/player-ranking-audit.md` (this file)
- Outputs under `reports/ranking-audit/` and updated `src/data/drbl/precomputed/2024-25.json`

## Eligibility

- `minimumActualPossessions = 50` (configurable; display gate, not the primary statistical fix).
- Traded players: one league-level id (existing accumulation).
- Remaster 2024-25 (400 games): 471 players in artifact, all ≥50 possessions after prior filter.

## Validation (2024-25 remaster)

| Metric | Old (`drbl100`) | New (`season_value`) |
| --- | --- | --- |
| Top-10 median possessions | 618.5 | 3438.5 |
| Top-100 median possessions | 908.5 | (see baseline JSON) |
| Corr(rate, possessions) in old top100 | −0.34 | n/a |
| Top-100 churn | — | 52 entered / 52 left |
| Intervals crossing 0 (old top100) | 100/100 | diagnostic only |

Corrected season-value top 5 (400-game artifact): Nikola Jokić, Domantas Sabonis, Jayson Tatum, Karl-Anthony Towns, Giannis Antetokounmpo. Shai Gilgeous-Alexander enters at #7 (old rank 143).

## Remaining limitations

- Attribution remains Approach B residual shares; may still overweight finishing/rebounding vs creation.
- `pointsPerWin = 1/30` provisional when team WAR calibration fails.
- Posterior ability EB on fused rate is a second shrinkage layer on already-shrunk components; documented, not double-counted in season exposure.
- Component disagreement index is **not** a calibrated SE; model SE proxy (`×2`) is heuristic pending better OOF residual covariance.
- Ability intervals remain wide; they do not drive default season_value ranks.
- Remaster reuses stored `seasonalImpact`/`drbl100` without re-attributing possessions; full `npm run drbl:compute` regenerates from PBP under the same finalize path.
- External consensus used only as face-validity, never as a fitting target.

## Commands to reproduce

```bash
# Unit + integration + legacy forensics
npm run drbl:test

# Remaster existing precomputed season (no PBP recompute)
npm run drbl:ranking-remaster -- 2024-25 season_value

# Alternate boards (also written by remaster)
npm run drbl:ranking-remaster -- 2024-25 ability

# Full season recompute (writes precomputed JSON via compute pipeline)
npm run drbl:compute -- 2024-25

# Export top 100 CSV from precomputed artifact
npx tsx scripts/export-drbl-top100.ts 2024-25
```

Outputs:

- `reports/ranking-audit/top100_2024_25_season_value.csv`
- `reports/ranking-audit/top100_2024_25_ability.csv`
- `reports/ranking-audit/top100_2024_25_forecast_value.csv`
- `reports/ranking-audit/before_after_2024_25.csv`
- `reports/ranking-audit/baseline_summary_2024_25.json`
- `reports/ranking-audit/legacy_top100_2024_25_by_drbl100.csv`
