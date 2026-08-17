# Branch inventory — analytics ↔ web integration

Timestamp: 2026-08-17T16:00:00Z (approx; see `01_premerge_freeze.json` for exact)

## Discovery summary

| Role | Ref | Tip | Dirty? |
|---|---|---|---|
| Working checkout (pre-checkpoint) | `main` | `629bb1b790bef21020940122194772b6921569ff` | **YES** — full sealed analytics tree uncommitted |
| Analytics line | uncommitted work on `main` → will become `analytics/sealed-pre-web-merge` | (pending checkpoint) | dirty until checkpoint |
| Web design line | `origin/drbl-ia-and-ask` (= `origin/backup/drbl-pre-merge-2026-08-17`) | `7e764ceb5c834a19696dad84ed6696e7e3289a6a` | clean (remote) |
| Merge-base | both descend from | `629bb1b790bef21020940122194772b6921569ff` | — |

## Other remotes inspected

| Ref | Tip | Notes |
|---|---|---|
| `origin/cursor/fix-home-infinite-load-f7de` | `4520103…` | older UI fix; **not** primary design tip |
| `origin/cursor/workspace-setup-fb1c` | `629bb1b…` | equals initial main |
| tag `drbl-pre-merge-2026-08-17` | `7e764ce…` | same as web tip |

## Classification decision

- **Analytics branch**: local sealed research (M17a.2 → M18b.0) living as uncommitted work on `main`.
- **Web-design branch**: `drbl-ia-and-ask` (ASK DRBL, IA destinations, Time Machine, progressive shells).

## Ahead/behind

- Analytics vs `origin/main`: all analytics is **local uncommitted** (0 commits ahead until checkpoint).
- Web vs `origin/main`: **22 commits ahead** (approx), 0 behind merge-base.

## Background jobs

- Historical importer / supervisor / watcher: **NONE RUNNING** (process scan for matching node CLIs).

## Seals present in analytics working tree (verified)

| Seal | Expected | Observed |
|---|---|---|
| M17A_2_HISTORICAL_CORPUS_SEAL_HASH | `60ef9954…4e11` | MATCH |
| M17B_MULTI_SEASON_VALIDATION_SEAL_HASH | `b606cf60…238c` | MATCH |
| M18A_SEAL_HASH | `ba98a652…391f` | MATCH |
| M18B_0_READINESS_SEAL_HASH | `ade47897…1763` | MATCH |

## Integration plan (next steps)

1. Checkpoint analytics → durable commit + backup ref  
2. Record web tip as WEB_PREMERGE + backup ref  
3. New branch `integration/analytics-web` from analytics  
4. Prefer separate worktree; merge web with `--no-commit`  
5. Manual hybrid reconcile; run gates; commit only if gates pass  
