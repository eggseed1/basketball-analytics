# DRBL — Differential Replacement Basketball Level

**Source of truth:** [`PLAN.md`](./PLAN.md) — DRBL **v2.1** implementation plan (milestones, rules, status).

This folder implements the public-data DRBL pipeline. The live site currently exposes **DRBL-L v1** (OOF-fused DRBL/100, calibrated ±, team WAR when validated, formal leverage impact); shot-decision / backtest work continues on the roadmap.

## What exists today

| Layer | Role |
|-------|------|
| Phase A | Download/cache → normalize → lineups/possessions → reconcile to box |
| Core v0 | Simple EPV residuals + on-court share + shrink → precomputed JSON for the site |
| Site | `PlayerSeason` fields, savant/advanced/explore, `/learn/drbl` |

## Commands

```bash
# Unit tests (possession / lineup / quarantine)
npm run drbl:test

# Phase A — one game or season sample
npm run drbl:phase-a -- --game 0022400001 --season 2024-25
npm run drbl:phase-a -- --season 2024-25 --limit 10
npm run drbl:phase-a -- --game 0022400001 --force   # re-download raw

# Core v0 — attribute + write site precomputed JSON
# (skips quarantined games that fail score reconciliation)
npm run drbl:compute -- --season 2024-25 --limit 100

# M5 — fit time-safe EPV coefficients from normalized possessions
npm run drbl:epv -- --season 2024-25
```

Writes:

- `data/drbl/raw/` — immutable NBA JSON (gitignored)
- `data/drbl/normalized/{season}/` — events, possessions, reconcile, offline player season
- `src/data/drbl/precomputed/{season}.json` — loaded by the website

## Layout

```
drbl/
  PLAN.md           # v2.1 source-of-truth plan (start here)
  download/         # CDN/stats fetch + immutable raw cache
  ingest/           # normalize PBP + box → DrblEvent / DrblBoxScore
  possessions/      # lineup + possession reconstruction + reconcile
  models/           # Core v0 EPV + player value + season compute
  types.ts
  index.ts
```

## Success criteria

**Phase A:** possession/box reconciliation within documented tolerances; failed games quarantined.

**Core v0 (site):** honest labeling; Learn more → `/learn/drbl`.

**v2.1:** milestones M1–M15 in [`PLAN.md`](./PLAN.md); success = holdout prediction/calibration, not leaderboard vibes.
