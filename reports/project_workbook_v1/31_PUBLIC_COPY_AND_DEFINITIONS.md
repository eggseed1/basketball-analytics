# 31 — Public copy and definitions

Extracted from `src/lib/stat-glossary.ts`, `src/app/learn/drbl/page.tsx`, and `src/components/explore/drbl-season-support-notice.tsx`.

## Learn / DRBL page (key copy)

- **Title:** What is DRBL? / DRBL
- **Tagline:** Differential Replacement Basketball Level — player impact relative to a contextual, role-matched R1 reference, measured in expected-possession value.
- **Three numbers:** DRBL/100 (ability rate), R1 Points (realized attribution), R1 Win Equivalents (R1 Points / frozen P1; not traditional WAR).
- **Limitations:** R1 ≠ claimed NBA fringe replacement; R1 Win Eq. ≠ causal roster-removal wins; attribution not exhaustive of scoreboard; high R1 Points ≠ higher ability than DRBL/100.
- **Historical:** frozen v1 retrospective; within-season ranks only; career cumulative R1 not yet canonical.
- **Estimation steps:** reconstruct possessions → Approach-B residuals vs cutoff-frozen R1 EP → raw rate → EB1600 posterior (k=1600).

## Support notice copy

Unavailable season:

> DRBL unavailable for this season. Canonical DRBL/100, R1 Points, and R1 Win Equivalents require play-by-play seasons that pass frozen-v1 support gates. Box-score stats may still load.

Historical Tier-B retrospective:

> Historical data quality: Limited — {dataQualityNote}
> Frozen v1 applied retrospectively.

Canonical production seasons render **no** partial-support notice.

## Stat glossary entries

### True shooting %

Shooting efficiency that credits 2s, 3s, and free throws. Higher means more points per scoring attempt.

### Effective field goal %

Field goal % with extra weight for threes (a make from deep counts as 1.5 field goals). Better than raw FG% for comparing shooters.

### Usage %

Share of team plays a player uses while on the floor (shots, free throws, turnovers). Higher = more of the offense runs through them.

### Player efficiency rating

All-in-one box-score rate (league average ≈ 15). Rewards positive production and penalizes misses and turnovers.

### Value over replacement player

Estimate of how many wins a player adds versus a cheap bench replacement, scaled to playing time. Higher is more valuable.

### DARKO DPM

Daily Player Metric from DARKO (darko.app) — estimated points per 100 possessions vs average, blending box score and on/off. 0 is average; stars are often +3 to +6.

### DARKO offensive DPM

Offensive half of DARKO DPM — estimated points added on offense per 100 possessions.

### DARKO defensive DPM

Defensive half of DARKO DPM — estimated points prevented on defense per 100 possessions.

### DARKO box DPM

Box-score component of DARKO DPM before on/off information is blended in.

### DARKO on/off DPM

On/off component of DARKO DPM — impact estimated from lineup plus/minus when the player is on the floor.

### DRBL ability rate

Estimated player impact rate relative to a contextual, role-matched R1 reference, per 100 combined possession appearances. This is an ability/rate statistic — not season cumulative value.

### DRBL possession component

DRBL-P — Approach B marginal contribution from expected-possession residuals versus role-matched replacement.

### DRBL lineup component

DRBL-LN — regularized possession lineup (RAPM-style) rating. Adjusted association, not a causal claim.

### DRBL behavior component

DRBL-B — regularized prediction from public box/PBP behavior features (usage, creation, shot mix, DRBL Gravity Proxy). Not optical tracking.

### DRBL leverage

Leverage-weighted seasonal impact Σ BaseValue × λ*, where λ* ∝ ∂WP/∂ExpectedPoints normalized to mean 1. Descriptive only — never added into R1 Points or R1 Win Equivalents.

### DRBL component disagreement

Scale-standardized disagreement among DRBL-P, DRBL-LN, and DRBL-B (z-scored components). Diagnostic only — not a calibrated standard error and not a ranking penalty.

### DRBL offense

Offensive half of DRBL-P — value added on offensive possessions versus replacement.

### DRBL defense

Defensive half of DRBL-P — value added on defensive possessions versus replacement.

### R1 Points

Realized player-attributed point residual above the contextual role-matched R1 reference over actual season exposure. Accounting value — not latent ability.

### R1 Win Equivalents

R1 Points expressed in marginal win-equivalent units. Not traditional WAR; not a causal roster-replacement effect. R1 is not claimed to equal conventional NBA fringe replacement.

### R1 Win Equivalents

R1 Points expressed in marginal win-equivalent units. Not traditional WAR; not a causal roster-replacement effect. R1 is not claimed to equal conventional NBA fringe replacement.

### DRBL seasonal impact

Legacy companion field related to realized Approach-B attribution. Prefer R1 Points as the canonical realized attribution total.

### DRBL uncertainty (legacy diagnostic)

Not available for the validated DRBL/100 point estimate — predictive intervals remain unresolved. Legacy ± fields are diagnostic-only and are not shown as calibrated confidence intervals.

### Differential Replacement Basketball Level

Possession-based impact versus a contextual role-matched R1 reference. DRBL/100 is the posterior ability rate; R1 Points is realized attributed season value; R1 Win Equivalents convert R1 Points with a frozen points-per-win factor.

### Box plus/minus

Estimated point differential per 100 possessions vs league average from box-score stats. 0 is average; +2 is strong.

### Offensive box plus/minus

Offensive half of box plus/minus — estimated points added on offense per 100 possessions.

### Defensive box plus/minus

Defensive half of box plus/minus — estimated points prevented on defense per 100 possessions.

### Win shares

Credit for team wins from box-score production (offense + defense). Roughly, 1 WS ≈ a win contributed.

### Win shares per 48 minutes

Win shares rate so playing time is equalized. League average is about .100; stars are often .200+.

### Offensive win shares

Portion of win shares from offensive production.

### Defensive win shares

Portion of win shares from defensive production.

### Offensive rating

Points produced per 100 possessions. Team or on-court context; higher means more efficient offense.

### Defensive rating

Points allowed per 100 possessions. Lower is better defense.

### Net rating

Offensive rating minus defensive rating — point margin per 100 possessions. Positive means outscoring opponents.

### Player impact estimate

NBA Stats share of “stuff that happens” in a game (scoring, rebounding, playmaking, etc.). Average players sit near the team share of minutes.

### Assist %

Estimated share of teammate field goals a player assisted while on the floor. Measures playmaking load, not just raw assists.

### Turnover %

Turnovers per 100 plays used. Lower is better; high-usage creators often run higher than spot-up players.

### Offensive rebound %

Estimated share of available offensive rebounds grabbed while on the floor.

### Defensive rebound %

Estimated share of available defensive rebounds grabbed while on the floor.

### Total rebound %

Estimated share of all available rebounds grabbed while on the floor.

### Steal %

Estimated steals per 100 opponent possessions while on the floor.

### Block %

Estimated share of opponent 2-point attempts blocked while on the floor.

### Three-point attempt rate

Share of field goal attempts that are threes. Higher = more perimeter-oriented shot diet.

### Free throw rate

Free throw attempts per field goal attempt. Higher means getting to the line more often.

### Pace

Possessions per 48 minutes. Higher teams play faster; lower teams grind.

### Plus/minus

Point margin while the player (or team) is on the floor. Context-heavy — teammates and opponents matter a lot.

### Winning percentage

Wins divided by games played.

### Points per 36 minutes

Scoring rate normalized to 36 minutes so different playing times compare more fairly.

### Assists per 36 minutes

Assist rate normalized to 36 minutes.

### Rebounds per 36 minutes

Rebound rate normalized to 36 minutes.

### Steals per 36 minutes

Steal rate normalized to 36 minutes.

### Blocks per 36 minutes

Block rate normalized to 36 minutes.

