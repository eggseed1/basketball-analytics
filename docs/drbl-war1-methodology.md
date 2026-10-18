# How DRBL/100 and WAR1 are made

DRBL/100 is a blended impact estimate, scaled so a player's number reads in points per 100 possessions on later games. WAR1 multiplies that estimate by the possessions he played and divides by a frozen constant. The baseline both numbers use is an average player. Baseball WAR and VORP use a replacement player instead.

The formulas in the product copy are in `src/content/stats/drbl-guides.ts`. The code that publishes the numbers is `drbl/models/box-forward.ts`, `drbl/models/box-prior.ts`, `drbl/models/published-rating.ts`, and `drbl/models/r1-value-v1.ts`. Ratings are published from 2018-19 on, for seasons whose play-by-play passes the minute checks. DRBL-O, DRBL-D, DRBL-P, DRBL-LN, and DRBL-B are separate reads. They do not add up to DRBL/100.

## Centering

Nothing in the publish step subtracts the league mean from DRBL/100.

The box features are standardized to a weighted mean of zero inside the season, and the forward features are standardized the same way. The lineup regression that produces those ratings includes a home term and an intercept, so a player with average features scores zero on the box half. The play-by-play rate is not centered. It is points above a role-matched expected value, and its possession-weighted mean in published seasons sits between about +0.13 and +0.16. Mixing that rate with the box rating, then multiplying each player by his own `n / (n + 500)`, moves the mean. The same multiplier is not applied to every player, so a mean of zero in the inputs would not survive the mix on its own.

In the published files the possession-weighted mean of DRBL/100 is close to zero without being forced there: +0.022 in 2018-19, +0.032 in 2019-20, +0.022 in 2020-21, +0.024 in 2022-23, +0.033 in 2024-25, and +0.023 in 2025-26. The unweighted mean is lower, because low-minute players are pulled toward zero and the high-minute players carry the weighted mean. Zero is the model's average-player reference: a player whose features sit at the standardized mean adds nothing on top of baseline scoring. The regression intercept is that baseline, the league's points per possession once home court is set aside. It is not the player's zero.

## What an appearance is

An appearance is one end of a possession. The player is on offense or on defense for that end, never both. A game in this pipeline has on the order of 200 ends, about 100 for each team. Kevin Durant played 39 minutes in game `0022400387` and was on the floor for 162 of its 201 ends. A player who plays the whole game has N near 200 for that game.

Two counters walk those ends:

- `n` in `n / (n + 500)`, and the lineup sums that `c` is fit on, use the appearance count in `drbl/models/anchored-lineup.ts`. A possession is skipped if either side has nobody listed. Partial lineups are included when both sides have at least one player.
- `N` in the box mix and in WAR1 is `actualPossessions` from the play-by-play credit. It adds one for every end he is listed on, including an end whose other side is empty.

On a normal five-on-five possession the two counts match. They are not stored as one shared integer. Published WAR1 does not divide N by two. An older internal win formula did, as `pairedOnCourtPossessions = N / 2`, because that formula treated the rate as already being on the NBA net-rating scale.

NBA.com net rating is team point margin per 100 possessions, and that denominator is one team's possessions, about half of these ends. The published rate is added on offense and subtracted on defense. A player at +2.5 therefore changes the margin by about 2.5 points per 100 offensive ends and again by about 2.5 points per 100 defensive ends. Over a stretch where he plays both ends, that is about +5 points per 100 NBA team possessions.

The rate-to-total arithmetic uses the end count, not the NBA denominator:

```
R1 Points = 2.5 × 6,000 / 100 = 150
WAR1 = 150 / 37.490662671779255 ≈ 4.00
```

Six thousand ends are about 3,000 paired team possessions. One hundred fifty points of margin over that span is 5 points per 100 paired possessions, the same figure as doubling +2.5.

## Play-by-play credit

Public play-by-play is turned into possessions and checked against the box score. A game that fails the score or minute check is left out. Each kept end is credited with an expected-points value from the state before the possession, plus a role-matched residual (Approach B in `drbl/models/player-value.ts`). The player's credit is his share of (actual points minus that expected value). Assists take connection credit. Make-or-miss noise is down-weighted in the stable total.

`rawAbilityRate` is 100 times that credit divided by N. It is an input. It is not the number on the site.

## The box rating for the same season

A second rating is fit from the box score. The features are per-100 rates for points, field-goal attempts, three-point attempts and makes, free-throw attempts, offensive and defensive rebounds, assists, steals, blocks, turnovers, and personal fouls, plus minutes per game and start rate. Weights come from a regression of the points scored on each five-on-five end against the summed features of the ten players on the floor, with a home term and an intercept. The target is the scoreboard.

Per-100 rates are shrunk toward the league rate with 25 pseudo-possessions. Minutes per game and start rate are shrunk with 10 pseudo-games. If a season has fewer than 10,000 five-on-five possessions, its own weights are not fit, and last season's frozen box weights are used instead.

## Mixing play-by-play with the box

Call the box rating `box`. The same-season mix is

```
w = N / (N + 3200)
mix = w × rawAbilityRate + (1 − w) × 2 × box
```

At 3,200 possessions the play-by-play rate and the scaled box rating have equal weight. Below that, the box carries more of the mix. The 2 puts the box rating on the play-by-play scale. Both constants are frozen in `BOX_PRIOR_CONFIG`.

## The forward half

A second box rating, `forward`, uses the same box features plus two more: the shrunk play-by-play rate (`drblPbp100`, an empirical-Bayes pull of the raw rate toward zero with 1,600 pseudo-possessions) and on-court net per 100 appearances. On-court net is shrunk with 1,500 pseudo-appearances at zero. Those two added features are standardized before the weights are applied.

The forward weights are fit on later ends, not on the ends being rated. The blocks that produce the weights are half-season blocks (first half to second half) and season-pair blocks (a full season to the next season). Early-season windows do not enter the weight solve. They enter the choice of K and the calibration curve below. The fit is `npm run drbl:box-forward-fit`. The nightly compute reads the frozen file `drbl/models/box-forward-weights.json`.

`forward` is rescaled by `s`, the ratio of the appearance-weighted standard deviation of `mix` to that of `forward`, so the two halves have the same spread. The rescaling uses the unshrunk values. The blend is an equal average:

```
blend = ½ × mix + ½ × s × forward
```

## Shrinkage and calibration

The published rating is

```
DRBL/100 = c × n / (n + 500) × blend
```

`c` is fit after that sample shrink, not before it. For each candidate K in {500, 1000, 2000, 4000, 8000}, every player's row in the lineup sum is multiplied by `n / (n + K)`, and a regression of later points on those sums is fit with three terms: the slope, a home term, and an intercept. The slope, times 100, is `c` for that window length. K = 500 is the candidate with the smallest residual sum of squares on those later ends. Below 500 the later-points error was flat and bench ratings stopped carrying into the next season.

The number that enters the published formula is the predictor that regression saw. A full-season +1 is the fit's reading of one point per 100 ends, with home court and the intercept held aside. It is not a claim that every later season landed on a slope of 1. The displayed DRBL/100 is rounded to two decimals. WAR1 is computed from the unrounded value.

The frozen curve, fit on 11 October 2026, is:

| League games in the window | c |
| --- | --- |
| 50 | 0.357 |
| 100 | 0.412 |
| 200 | 0.525 |
| 400 | 0.624 |
| 615 | 0.747 |
| 1230 | 0.799 |

Between those points, `c` is interpolated linearly in the log of games. Short of 50 games it stays at 0.357. Past 1,230 it stays at 0.799. Player ratings are not forced to add up to the team's scoring margin.

## What the fit saw

The shipped weight file is fit on every local season with at least 500 normalized games, from 2020-21 through 2025-26. An end that is a target in one block is often a feature in another block of the same fit. No game is excluded from every fitting and tuning step of that file. 2018-19 and 2019-20 are published, and they are not in the weight file.

The check that does hold the target games out is `npm run drbl:outcome-test`, written up in `reports/drbl-outcome-test/latest.md` on 11 October 2026. For each test it refits the forward weights and the calibration on earlier possessions only, then scores later games. The metric is the final margin, not a player's next box line and not team wins. R² is the share of final-margin variance explained beyond home court. Slope is the final margin regressed on the margin the rating implies. A slope of 1 means the rating is in points per 100. Below 1, the rating is too wide. The comparison is the play-by-play-only rate the blend replaced.

Within a season, first 60% of games to the last 40%, the refit blend was:

| Season | Games scored | R² | Slope | Against play-by-play |
| --- | --- | --- | --- | --- |
| 2021-22 | 492 | 16.5% | 0.93 | no clear difference |
| 2022-23 | 492 | 21.9% | 1.21 | better |
| 2023-24 | 492 | 21.5% | 1.09 | better |
| 2024-25 | 492 | 18.6% | 1.00 | better |
| 2025-26 | 492 | 30.9% | 1.32 | better |

2020-21 has no blend row in that within-season test. There is no earlier season to fit the weights on.

Across seasons, the prior season's rating scored on every game of the next season:

| Rating season | Games scored | R² | Slope | Against play-by-play |
| --- | --- | --- | --- | --- |
| 2020-21 to 2021-22 | 1230 | 13.3% | 0.92 | better |
| 2021-22 to 2022-23 | 1230 | 11.3% | 0.76 | better |
| 2022-23 to 2023-24 | 1230 | 17.3% | 1.18 | better |
| 2023-24 to 2024-25 | 1230 | 19.0% | 1.07 | better |
| 2024-25 to 2025-26 | 1230 | 20.3% | 1.16 | better |

Slopes in these tests run from 0.76 to 1.32, so the points-per-100 scale is not stable across test periods. The points-per-100 label is the unit the regression was fit in. These rows score a refit that did not see the target games. They are evidence about that procedure. A historical rating taken from the shipped weight file is retrospective: the file for a completed season was fit with later seasons in it.

The same report does not score individual players. A separate check, recomputed for this note, asks whether last year's rating predicts next year's on-court net (offensive rating minus defensive rating). The sample is players with at least 1,000 minutes in both seasons: 1,362 players, seven target seasons from 2019-20 through 2025-26. A line is fit on the other target seasons and applied to the held-out season, so the slope absorbs the difference between DRBL's end-scale and NBA net rating. Doubling DRBL and refitting leaves the result unchanged.

| Predictor of next year's net rating | Correlation | Leave-one-season error |
| --- | --- | --- |
| Last year's DRBL/100, after a fitted line | 0.392 | 4.19 points per 100 |
| Twice last year's DRBL/100, after its own fitted line | 0.392 | 4.19 points per 100 |
| Last year's own net rating, after a fitted line | 0.483 | 3.95 points per 100 |

Carrying last year's net rating forward with no fitted line misses by 4.50 points per 100.

Using last year's DRBL/100 itself as the prediction, with no fitted line, misses by 4.39 points per 100. That comparison mixes the end-scale with the NBA net-rating scale. The fitted errors in the table are on one scale, and on those last year's net rating is the stronger predictor. The shipped weights still saw later seasons, so this player check is not a holdout of the weight file.

## WAR1

R1 Points are the points the published rate implies over the ends he actually played. WAR1 divides that by P1:

```
R1 Points = DRBL/100 × N / 100
WAR1 = R1 Points / 37.490662671779255
```

P1 was fit once, on 2024-25 only, and then frozen. For each of the 30 teams, net points are points scored minus points allowed, taken from the normalized game boxes. Ordinary least squares of wins on those net points, with an intercept, gave

```
wins = 40.833 + 0.0266733082 × net points
P1 = 1 / 0.0266733082 = 37.490662671779255
```

The slope printed as 0.026673 is rounded. One divided by that rounded figure is about 37.4911. The frozen divisor is the reciprocal of the unrounded slope.

So P1 is scoreboard points of margin per standings win in that one season. It was chosen over a fixed divisor of 30 because leave-one-team-out win error was lower (root-mean-square error 2.63 wins against 4.17). The 30 leave-one-team-out divisors ran from 36.57 to 38.10. The fit did not use DRBL, R1 Points, or WAR1, and it did not use 2025-26. The record is `reports/m16l1/17_final_ppw_fit.json`, from `scripts/drbl-m16l1.ts`. Freezing it keeps the win scale from moving every season. It does not make 37.49 a universal points-per-win constant.

Because the divisor is a fixed positive number, WAR1 has the same sign as DRBL/100, and sorting by WAR1 is the same order as sorting by R1 Points. A player at +2.5 over 6,000 ends has 150 R1 Points and WAR1 of about 4.00, as above.

Until October 2026, R1 Points used the play-by-play credit alone (`rawAbilityRate × N / 100`). That ledger is still computed and stored as `r1PointsPbp`. It is not the published WAR1.

The readable description is win-scaled value above average. One WAR1 is 37.49 R1 Points, by the frozen divisor. It is not one standings win. The roster fits below associate one WAR1 with about 1.31 to 1.33 standings wins, which is why the divisor cannot be read as a one-for-one conversion. A below-average rate over a large N produces a negative WAR1, including when the team had no better option on the roster.

## What a roster sum means

A full roster in regulation is team-games × 5 players × 48 minutes. For an 82-game season that is 19,680 minutes. Each overtime period adds 25 player-minutes for that team, five players times five minutes. Coverage below divides logged or tabled minutes by regulation minutes plus those overtime minutes. The overtime count is the number of periods after the fourth in the normalized possessions. A 72-game season is not judged against 19,680. Wins in both fits are scaled to 82 games. Wins come from the normalized game boxes.

The 180-team check uses the current published WAR1. Each player's whole WAR1 is placed on the team in his published row. No minute split, and no 8,000-minute cutoff. All 30 teams in each season from 2020-21 through 2025-26 are in the fit:

```
wins per 82 = 40.23 + 1.334 × roster WAR1
```

Correlation 0.928, mean absolute error 3.49 wins, on 180 team-seasons. The Learn page's 40.2 + 1.31 and correlation 0.93 is this sample. The recomputation above is the current `r1WinEquivalents`.

Minute coverage for that fit counts a player only when the advanced table gives him that single team. Traded players stay in the WAR sum, on whichever team the published row names, and their minutes stay out of the coverage numerator. Across the 180 teams the median coverage is 92 percent and the mean is 88 percent. The low is Toronto in 2023-24, at 48 percent. A team at the low end still has a full published WAR sum. The coverage number says how much of the roster's minutes sit on players the advanced table is willing to give that one team.

The wider check adds 2018-19 and 2019-20 and splits each player's WAR1 across teams by his logged regular-season minutes. Eight seasons and 30 teams is 240 team-seasons. A team is kept only when those logs, restricted to players on that season's advanced table who also have a published WAR1, sum to at least 8,000 minutes. Against regulation alone, 8,000 / 19,680 is about 41 percent of an 82-game roster. Overtime makes the full denominator a little larger. The floor is low enough that a kept team can be missing most of its minutes, and the missing minutes take their WAR1 with them.

The 45 dropped team-seasons are the whole of 2023-24, plus six teams in 2018-19, five in 2019-20, and four in 2020-21. The 2023-24 logs include 411 of those player ids, and no team's logged minutes reach 8,000. Charlotte is the high end, at 4,248. The earlier seasons are thin at the player-file level: 182 NBA-id logs in 2018-19, 214 in 2019-20, and 256 in 2020-21. From 2021-22 on, apart from 2023-24, every team clears 8,000.

On the 195 kept team-seasons:

```
wins per 82 = 37.34 + 1.307 × roster WAR1
```

Correlation 0.871, mean absolute error 4.40 wins. Logged-minute coverage on those 195 teams, regulation plus overtime, has a minimum of 41 percent (Orlando, 2018-19), a median of 82 percent, and a mean of 81 percent. The teams at the floor are the incomplete sums. The median team is not.

Both slopes, 1.33 and 1.31, say that one WAR1 has lined up with more than one standings win. That is a description of these roster sums. It is not the derivation of P1, and it is not a one-for-one conversion.

The game-margin tests support a blended rating when the weights are refit without the target games. They do not show that DRBL/100 predicts an individual player's next season better than his own net rating.
