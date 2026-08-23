# Possession reconstruction calibration

Generated: 2026-08-23T03:12:46.237Z

## Methodology

Fixture-only calibration over recorded full-game PBP/box/advanced-box envelopes. No live network. Failures remain in the denominator.

## Sample composition

- Seasons: 1996-97, 2000-01, 2010-11, 2015-16, 2019-20, 2023-24, 2025-26
- Games per season (target): 20
- Seed: 42
- Fixture-only: true
- Offline: false
- Attempted games: 4
- Successfully fetched: 4
- Successfully reconstructed: 4
- Official totals available: 4
- Comparable games: 4

## Coverage

- Official-total availability rate: 100.0%
- Reconstruction failure rate: 0.0%

## Aggregate accuracy (comparable games)

| Metric | Value |
| --- | ---: |
| Exact match | 0.0% |
| Both teams within ±1 | 75.0% |
| Both teams within ±2 | 75.0% |
| Outside ±2 | 25.0% |
| Mean signed error | -1.13 |
| Mean absolute error | 1.13 |
| Median absolute error | 1.00 |
| 95th-percentile abs error | 4.00 |
| Max abs error | 4 |
| Home signed bias | -0.75 |
| Away signed bias | -1.50 |

### By season

| Bucket | Attempted | Comparable | Exact | ±1 | ±2 | MAE | Official avail |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2015-16 | 1 | 1 | 0.0% | 0.0% | 0.0% | 3.00 | 100.0% |
| 2019-20 | 1 | 1 | 0.0% | 100.0% | 100.0% | 0.50 | 100.0% |
| 2024-25 | 2 | 2 | 0.0% | 100.0% | 100.0% | 0.50 | 100.0% |

### By era

| Bucket | Attempted | Comparable | Exact | ±1 | ±2 | MAE | Official avail |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| cdn_supported_recent | 2 | 2 | 0.0% | 100.0% | 100.0% | 0.50 | 100.0% |
| cdn_transition | 1 | 1 | 0.0% | 100.0% | 100.0% | 0.50 | 100.0% |
| mid_2010s | 1 | 1 | 0.0% | 0.0% | 0.0% | 3.00 | 100.0% |

### By PBP source

| Bucket | Attempted | Comparable | Exact | ±1 | ±2 | MAE | Official avail |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| nba_cdn | 3 | 3 | 0.0% | 100.0% | 100.0% | 0.50 | 100.0% |
| stats_nba | 1 | 1 | 0.0% | 0.0% | 0.0% | 3.00 | 100.0% |

### By advanced-box source

| Bucket | Attempted | Comparable | Exact | ±1 | ±2 | MAE | Official avail |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| stats_nba | 4 | 4 | 0.0% | 75.0% | 75.0% | 1.13 | 100.0% |

### Regulation vs overtime

| Bucket | Attempted | Comparable | Exact | ±1 | ±2 | MAE | Official avail |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| overtime | 1 | 1 | 0.0% | 100.0% | 100.0% | 0.50 | 100.0% |
| regulation | 3 | 3 | 0.0% | 66.7% | 66.7% | 1.33 | 100.0% |

### Regular season vs playoffs

| Bucket | Attempted | Comparable | Exact | ±1 | ±2 | MAE | Official avail |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| playoffs | 1 | 1 | 0.0% | 100.0% | 100.0% | 0.50 | 100.0% |
| regular | 3 | 3 | 0.0% | 66.7% | 66.7% | 1.33 | 100.0% |

### Lineup validation

| Bucket | Attempted | Comparable | Exact | ±1 | ±2 | MAE | Official avail |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| lineup_invalid | 1 | 1 | 0.0% | 0.0% | 0.0% | 3.00 | 100.0% |
| lineup_valid | 3 | 3 | 0.0% | 100.0% | 100.0% | 0.50 | 100.0% |

### Technical/flagrant FT presence

| Bucket | Attempted | Comparable | Exact | ±1 | ±2 | MAE | Official avail |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| has_tech_or_flagrant_ft | 1 | 1 | 0.0% | 100.0% | 100.0% | 0.50 | 100.0% |
| no_tech_flagrant_ft | 3 | 3 | 0.0% | 66.7% | 66.7% | 1.33 | 100.0% |

### Unknown/dropped events

| Bucket | Attempted | Comparable | Exact | ±1 | ±2 | MAE | Official avail |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| clean_events | 2 | 2 | 0.0% | 100.0% | 100.0% | 0.50 | 100.0% |
| has_unknown_or_dropped | 2 | 2 | 0.0% | 50.0% | 50.0% | 1.75 | 100.0% |

## Worst discrepancies

| Game | Season | Δ home | Δ away | Grade | Lineup | Tech/Flag FT |
| --- | --- | ---: | ---: | --- | --- | ---: |
| 0021500001 | 2015-16 | -2 | -4 | outside_tolerance | false | 0 |
| 0022400001 | 2024-25 | 0 | -1 | within_one | true | 0 |
| 0021900001 | 2019-20 | -1 | 0 | within_one | true | 2 |
| 0042400101 | 2024-25 | 0 | -1 | within_one | true | 0 |

## Algorithm fixes made

- Wired live `boxscoreadvancedv3` fetch (stats → disk) so official totals are no longer unconditionally unavailable.
- Introduced `OfficialPossessionResult` / `GamePossessionData` boundary so reconstructed row counts cannot be labeled provider-reported.
- No possession-boundary algorithm changes in this pass (awaiting targeted failing sequences from live calibration).

## Remaining failure modes

- Historical games may still lack advanced possessions if the endpoint rejects the game or omits the field (`field_missing` / `game_not_supported`).
- Reconstruction can remain outside ±2 on technical/flagrant/jump-ball/end-of-period edge cases.
- Lineup validation remains independent; lineup-invalid games can still be possession-comparable.

## Feature-readiness recommendations

| Feature | Recommendation | Evidence |
| --- | --- | --- |
| Game-level pace | INSUFFICIENT_COVERAGE — official totals too sparse for product pace | official avail 100.0%; comparable 4 |
| Game/team PPP | INSUFFICIENT_COVERAGE — official totals too sparse for product pace | same official-total gate as pace |
| Sequence explorer | READY — sequences already shipped; keep mismatch/unavailable notices | reconstructed 4/4 |
| Clutch possession explorer | NEEDS_RECONSTRUCTION_FIXES — boundaries not yet accurate enough for clutch filters | ±1 75.0%; outside ±2 25.0% |
| Play-type efficiency | NEEDS_RECONSTRUCTION_FIXES | ±1 75.0% |
| Lineup PPP | INSUFFICIENT_COVERAGE — lineup validation and/or possession accuracy insufficient | lineup-valid share 75.0% |
| ASK DRBL possession queries | READY_WITH_GATING — index reconstructed possessions with coverage metadata; never imply official totals | reconstructed coverage + metadata required |
