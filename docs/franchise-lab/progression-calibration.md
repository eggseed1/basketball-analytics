# Franchise Lab: ten-season progression calibration

Updated November 2, 2026.

## Purpose

Prevent ratings inflation and inert development traits in long Franchise Lab saves while preserving meaningful annual player growth and regression. The calibration tests the **actual** player checkpoint, summer progression and trait-review functions; it is not a simulation of every possession, trade, or contract.

## Method

Run \`npm run test:franchise-multiseason\`.

- Three seeded generated leagues, 30 team rosters, 450 players per league, 10 seasons (13,500 player-season observations).
- Deterministic minutes, games, scoring, assists, rebounds and true shooting conditioned on opening OVR with independent player-season variation, including missed time.
- Four regular-season development checkpoints, then the real offseason progression pass and trait review.
- Award scenarios assign MVP, Most Improved and All-NBA candidates based on the modeled season output.
- Each summer, 45 rookies replace 45 departing players. Departures favor older players and weaker fringe contributors but include stochastic role/contract turnover. **Do not always replace the 45 lowest-OVR players:** that causes survivorship bias and artificial league inflation.
- Assesses aggregate means, 85+/90+/95+ tails, OVR movement, under-25 growth, 34+ decline, promotions/demotions, replay protection, and export/import persistence. JSON report: \`/tmp/franchise-calibration/multiseason.json\`.

This is a stress-test model with stylized playtime/production. An eventual full ten-year end-to-end league and cap simulation should supplement it rather than be inferred from it.

## Results (three-seed average, after refinement)

| Season | Mean OVR | 85+ | 90+ | 95+ | Players moving | Under-25 OVR change | Age 34+ OVR change | Trait promotions | Trait demotions |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 2027 | 73.7 | 42.0 | 18.0 | 1.3 | 78.0% | +2.41 | -2.53 | 1.0 | 2.0 |
| 2028 | 73.6 | 48.0 | 17.3 | 2.7 | 69.2% | +1.54 | -2.53 | 1.3 | 3.0 |
| 2029 | 73.3 | 45.0 | 17.3 | 2.3 | 59.1% | +1.23 | -2.63 | 1.0 | 2.3 |
| 2030 | 73.3 | 45.0 | 15.7 | 2.7 | 59.5% | +1.33 | -2.66 | 1.7 | 2.0 |
| 2031 | 73.3 | 44.3 | 15.3 | 3.0 | 60.5% | +1.42 | -2.47 | 1.0 | 1.0 |
| 2032 | 73.4 | 42.3 | 13.3 | 2.3 | 63.5% | +1.65 | -2.50 | 0.7 | 1.7 |
| 2033 | 73.6 | 45.0 | 16.0 | 2.7 | 61.8% | +1.78 | -2.54 | 2.0 | 2.3 |
| 2034 | 73.8 | 46.7 | 15.3 | 2.0 | 62.5% | +1.79 | -2.48 | 1.7 | 2.3 |
| 2035 | 74.0 | 48.0 | 16.0 | 1.7 | 63.1% | +1.83 | -2.60 | 2.7 | 1.7 |
| 2036 | 74.2 | 49.3 | 17.7 | 1.3 | 65.2% | +1.83 | -2.56 | 2.3 | 2.0 |

Before calibrating, the 45 lowest-rated players were always replaced, raising mean league OVR from 73.6 to 76.7 and the 85+ count from 42 to 67 over ten years. The revised turnover model removed that artificial inflation. Development tuning also reduced average age 34+ regression from approximately -3.1 to -2.5 per season and let standout players in their early 30s earn realistic trait promotions.

## Reference constraints, not exact matching targets

- NBA aging-curve research finds overall performance generally rises into roughly age 28–29, with meaningful variation by player and position. Source: https://pmc.ncbi.nlm.nih.gov/articles/PMC6690864/
- NBA.com's NBA 2K26 top-100 launch ratings list 24 players at 90+ and around 53 at 85+. Those are external scale checks, not calibration ground truth for DRBL's generated cohorts. Source: https://www.nba.com/news/nba-2k26-top-100-player-ratings-announced

## Automated guardrails

The ten-season regression rejects major population OVR inflation, large expansion of the elite tiers, low player-year movement, unreasonable under-25 gains or veteran losses, runaway X-Factor counts, and inert trait promotions/demotions.

Re-run this check after editing potential generation, player development, awards, coaching bonuses, or offseason progression. \`Franchise Lab\` CI executes it in its own \`balance\` job; \`npm test\` also includes the test script.
