# Possession reconstruction calibration

Generated: 2026-08-23T03:18:01.468Z

## Methodology

Deterministic season schedule sample (stats.nba.com scheduleleaguev2) with seeded shuffle; live PBP/box/advanced-box fetches via product clients. Checkpoint/resume supported. Failures remain in the denominator and are not silently dropped.

## Sample composition

- Seasons: 1996-97, 2000-01, 2010-11, 2015-16, 2019-20, 2023-24, 2025-26
- Games per season (target): 20
- Seed: 42
- Fixture-only: false
- Offline: false
- Attempted games: 140
- Successfully fetched: 140
- Successfully reconstructed: 140
- Official totals available: 140
- Comparable games: 140

## Coverage

- Official-total availability rate: 100.0%
- Reconstruction failure rate: 0.0%

## Aggregate accuracy (comparable games)

| Metric | Value |
| --- | ---: |
| Exact match | 4.3% |
| Both teams within ±1 | 28.6% |
| Both teams within ±2 | 50.7% |
| Outside ±2 | 49.3% |
| Mean signed error | -2.33 |
| Mean absolute error | 2.68 |
| Median absolute error | 2.00 |
| 95th-percentile abs error | 5.00 |
| Max abs error | 93 |
| Home signed bias | -2.29 |
| Away signed bias | -2.36 |

### By season

| Bucket | Attempted | Comparable | Exact | ±1 | ±2 | MAE | Official avail |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1996-97 | 20 | 20 | 5.0% | 20.0% | 50.0% | 2.02 | 100.0% |
| 2000-01 | 20 | 20 | 0.0% | 5.0% | 25.0% | 2.95 | 100.0% |
| 2010-11 | 20 | 20 | 0.0% | 10.0% | 45.0% | 2.65 | 100.0% |
| 2015-16 | 20 | 20 | 5.0% | 10.0% | 30.0% | 2.65 | 100.0% |
| 2019-20 | 20 | 20 | 0.0% | 15.0% | 40.0% | 6.53 | 100.0% |
| 2023-24 | 20 | 20 | 0.0% | 65.0% | 80.0% | 1.07 | 100.0% |
| 2025-26 | 20 | 20 | 20.0% | 75.0% | 85.0% | 0.88 | 100.0% |

### By era

| Bucket | Attempted | Comparable | Exact | ±1 | ±2 | MAE | Official avail |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| cdn_supported_recent | 40 | 40 | 10.0% | 70.0% | 82.5% | 0.97 | 100.0% |
| cdn_transition | 20 | 20 | 0.0% | 15.0% | 40.0% | 6.53 | 100.0% |
| early_2000s | 20 | 20 | 0.0% | 5.0% | 25.0% | 2.95 | 100.0% |
| early_stats_nba | 20 | 20 | 5.0% | 20.0% | 50.0% | 2.02 | 100.0% |
| mid_2010s | 20 | 20 | 5.0% | 10.0% | 30.0% | 2.65 | 100.0% |
| pre_tracking_modern | 20 | 20 | 0.0% | 10.0% | 45.0% | 2.65 | 100.0% |

### By PBP source

| Bucket | Attempted | Comparable | Exact | ±1 | ±2 | MAE | Official avail |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| nba_cdn | 57 | 57 | 7.0% | 54.4% | 70.2% | 2.89 | 100.0% |
| stats_nba | 83 | 83 | 2.4% | 10.8% | 37.3% | 2.54 | 100.0% |

### By advanced-box source

| Bucket | Attempted | Comparable | Exact | ±1 | ±2 | MAE | Official avail |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| stats_nba | 140 | 140 | 4.3% | 28.6% | 50.7% | 2.68 | 100.0% |

### Regulation vs overtime

| Bucket | Attempted | Comparable | Exact | ±1 | ±2 | MAE | Official avail |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| overtime | 10 | 10 | 10.0% | 50.0% | 70.0% | 1.45 | 100.0% |
| regulation | 130 | 130 | 3.8% | 26.9% | 49.2% | 2.77 | 100.0% |

### Regular season vs playoffs

| Bucket | Attempted | Comparable | Exact | ±1 | ±2 | MAE | Official avail |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| playoffs | 21 | 21 | 0.0% | 23.8% | 42.9% | 2.24 | 100.0% |
| regular | 119 | 119 | 5.0% | 29.4% | 52.1% | 2.76 | 100.0% |

### Lineup validation

| Bucket | Attempted | Comparable | Exact | ±1 | ±2 | MAE | Official avail |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| lineup_invalid | 102 | 102 | 2.9% | 17.6% | 41.2% | 3.21 | 100.0% |
| lineup_valid | 38 | 38 | 7.9% | 57.9% | 76.3% | 1.25 | 100.0% |

### Technical/flagrant FT presence

| Bucket | Attempted | Comparable | Exact | ±1 | ±2 | MAE | Official avail |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| has_tech_or_flagrant_ft | 103 | 103 | 4.9% | 26.2% | 44.7% | 2.17 | 100.0% |
| no_tech_flagrant_ft | 37 | 37 | 2.7% | 35.1% | 67.6% | 4.11 | 100.0% |

### Unknown/dropped events

| Bucket | Attempted | Comparable | Exact | ±1 | ±2 | MAE | Official avail |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| clean_events | 28 | 28 | 3.6% | 60.7% | 78.6% | 1.07 | 100.0% |
| has_unknown_or_dropped | 112 | 112 | 4.5% | 20.5% | 43.8% | 3.08 | 100.0% |

## Worst discrepancies

| Game | Season | Δ home | Δ away | Grade | Lineup | Tech/Flag FT |
| --- | --- | ---: | ---: | --- | --- | ---: |
| 0021900880 | 2019-20 | -91 | -93 | outside_tolerance | false | 0 |
| 0029600991 | 1996-97 | -1 | -7 | outside_tolerance | false | 3 |
| 0029600358 | 1996-97 | -3 | -6 | outside_tolerance | false | 1 |
| 0040000085 | 2000-01 | -2 | -6 | outside_tolerance | false | 1 |
| 0020001064 | 2000-01 | -6 | -5 | outside_tolerance | false | 3 |
| 0021001001 | 2010-11 | -4 | -6 | outside_tolerance | false | 3 |
| 0021000306 | 2010-11 | -5 | -6 | outside_tolerance | false | 0 |
| 0021000971 | 2010-11 | -6 | -4 | outside_tolerance | false | 1 |
| 0021500706 | 2015-16 | -6 | -5 | outside_tolerance | false | 0 |
| 0041900164 | 2019-20 | 0 | -6 | outside_tolerance | true | 0 |
| 0021900636 | 2019-20 | -3 | -6 | outside_tolerance | true | 1 |
| 0029601099 | 1996-97 | -1 | -5 | outside_tolerance | false | 0 |
| 0040000077 | 2000-01 | -3 | -5 | outside_tolerance | false | 1 |
| 0020001029 | 2000-01 | -4 | -5 | outside_tolerance | false | 3 |
| 0020000704 | 2000-01 | -5 | -4 | outside_tolerance | false | 4 |

## Algorithm fixes made

- Wired live `boxscoreadvancedv3` fetch (stats → disk) so official totals are no longer unconditionally unavailable.
- Introduced `OfficialPossessionResult` / `GamePossessionData` boundary so reconstructed row counts cannot be labeled provider-reported.
- No possession-boundary algorithm changes in this pass (awaiting targeted failing sequences from live calibration).

## Remaining failure modes

- Historical games may still lack advanced possessions if the endpoint rejects the game or omits the field (`field_missing` / `game_not_supported`). In this live sample, official totals were available for **140/140** games via `boxscoreadvancedv3`.
- Reconstruction systematically under-counts vs official (mean signed error ≈ −2.3), worse on `stats_nba` PBP eras than recent CDN eras.
- Incomplete/truncated PBP payloads can still reconstruct a tiny possession set while official totals remain full-game (e.g. `0021900880`: 107 events / period 1 only → 6/5 derived vs 97/98 official). Needs a coverage completeness gate before trusting aggregates from reconstructed rows.
- Lineup validation remains independent; lineup-invalid games can still be possession-comparable but correlate with worse MAE.
- No possession-boundary algorithm changes shipped in this pass — next slice should target documented failing sequences (tech/flagrant FT, period boundaries, incomplete feeds).

## Feature-readiness recommendations

| Feature | Recommendation | Evidence |
| --- | --- | --- |
| Game-level pace | READY_WITH_GATING — use provider-reported possessions only where available; hide otherwise | official avail 100.0%; comparable 140 |
| Game/team PPP | READY_WITH_GATING — use provider-reported possessions only where available; hide otherwise | same official-total gate as pace |
| Sequence explorer | READY — sequences already shipped; keep mismatch/unavailable notices | reconstructed 140/140 |
| Clutch possession explorer | NEEDS_RECONSTRUCTION_FIXES | ±1 28.6%; outside ±2 49.3% |
| Play-type efficiency | NEEDS_RECONSTRUCTION_FIXES | ±1 28.6% |
| Lineup PPP | INSUFFICIENT_COVERAGE — lineup validation and/or possession accuracy insufficient | lineup-valid share 27.1% |
| ASK DRBL possession queries | READY_WITH_GATING — index reconstructed possessions with coverage metadata; never imply official totals | reconstructed coverage + metadata required |
