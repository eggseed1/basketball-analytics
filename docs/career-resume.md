# Career Resume methodology (v1.0)

Deterministic analyzer: `computeCareerResume` in `src/analytics/career-resume.ts`.

## Purpose

Answer **what this player's career looks like analytically** on four axes:

| Axis | Question |
| --- | --- |
| **Peak** | How high did production get? |
| **Prime** | How long near that peak? |
| **Longevity** | How long still meaningfully productive vs own peak? |
| **Trajectory** | How did the arc evolve? |

## Primary metric — Career Production Index (CPI)

```
CPI = PPG + 1.5×APG + 1.2×RPG + 2.0×SPG + 2.0×BPG − TOV
```

All terms are **per game** from season-true career counting stats.

CPI is a transparent counting composite. It is **not** BPM, DARKO, or RAPTOR.

True shooting % is shown beside Peak for efficiency context; it does **not** enter CPI.

## Why not DARKO / RAPTOR for career ranking?

CPI remains the Career Resume primary axis so Peak / Prime / Longevity stay
comparable across eras on counting rates.

**Peak Impact** (companion on the player Career card) uses season-true overlays
with preference **DARKO → RAPTOR (≤2021-22) → BPM**. Metrics are never mixed into
one ranking scale. See `src/analytics/peak-impact.ts`.

When overlay coverage expands, bump Peak Impact notes — do not silently swap
CPI for impact.

## Population

All Peak / Prime / Longevity bands are **career_self**:

- Relative to **this player's own peak CPI**
- **Not** the filtered leaderboard board
- **Not** a same-season peer percentile

Do not equate resume “% of peak” with leaderboard “Nth percentile.”

## Qualifying seasons

A season qualifies when either:

1. **Standard:** `GP ≥ 20` and `MPG ≥ 15`, or
2. **Shortened-season accommodation:** `GP ≥ 15` and `MPG ≥ 18`

Rules:

- Multi-team seasons → keep the row with the most games.
- Incomplete current season below the GP floor → shown as incomplete, **excluded** from Peak / Prime / Longevity.
- Prime and Longevity labels require **≥ 2** qualifying seasons.

## Thresholds

| Band | Rule |
| --- | --- |
| **Peak** | Max CPI among qualifying seasons |
| **Prime** | CPI ≥ **90%** of peak |
| **Longevity** | CPI ≥ **70%** of peak |
| **Contiguous prime** | Longest run of prime-band seasons unbroken by a non-prime qualifying season |

**Overlap (not mutually exclusive):** Peak ⊂ Prime band ⊂ Longevity band. Seasons at 70–89% of peak are **longevity-only**. Longevity can continue after the contiguous prime ends.

See `/learn/peak-prime-longevity` and `/learn/career-arc` for plain-English education. Formal **Development Season** scoring is **not** part of Career Resume v1.0 (trajectory may say “Development → rise” descriptively).

## Trajectory

Phases are labeled only from measured CPI shape (early/rise, prime, late/decline/sustained, current). No causal claims.

## Biggest career changes

Top YoY transitions reuse `computePlayerEvolution` across consecutive qualifying seasons (largest magnitude deltas, capped at 3).

## Official awards

Not included. Public player types have no award feed. Keep official accolades separate if/when a provider exists.

## Revision policy

Treat v1.0 as **usable but revisable**. Freeze labels in UI only after more historical impact data lands; until then prefer bumping `methodology.version` when the primary metric changes.

## Related: season-true impact foundation

Production (CPI) and impact are separate lenses. Season-true historical impact types/queries live in `docs/historical-impact.md` and must **not** silently replace CPI. A future Peak Impact surface requires a new Career Resume methodology version after coverage audit.
