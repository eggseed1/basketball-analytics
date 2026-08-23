# DRBL Release Baseline

## Snapshot

| Field | Value |
| --- | --- |
| Date | 2026-08-17 |
| Exact SHA | Matching `git rev-parse drbl-pre-merge-2026-08-17` (must equal snapshot HEAD) |
| Branch | `drbl-ia-and-ask` |
| Tag | `drbl-pre-merge-2026-08-17` |
| Backup branch | `backup/drbl-pre-merge-2026-08-17` |

After tagging, verify with:

```bash
git rev-parse HEAD
git show drbl-pre-merge-2026-08-17 --no-patch --decorate
```

The tag SHA and HEAD must match.

## Product areas completed

- **Player Intelligence** — destination identity/stats islands, career resume, percentiles, notable games, explore board
- **Team Intelligence** — board resolution, roster buckets, evidence, assets section, destination islands
- **Game Lab** — scoreboard shell, matchup theme, identity shell, season evidence arrival
- **ASK DRBL** — structured interpret/execute, coverage honesty, follow-ups
- **ASK Builder** — structured builder + example rotation
- **Time Machine** — `/history` route, era theme scope, snapshot controls
- **Offseason / Transactions** — tracker UI, event presentation, safe player links (genealogy UI still blocked)
- **Compare / Season Compare / Rank My Seasons** — player and team season compare/rank surfaces
- **Historical identity** — canonical ESPN team ids, team-era resolution (e.g. 1978 Seattle ≠ OKC)
- **Historical branding** — era-aware marks/palette; logo assets remain optional/absent
- **Performance / continuity** — progressive destination shells, loading frames, query-nav continuity

## Infrastructure completed

- Production provider guard (sample ≠ live ESPN careers)
- Provider parity audit (CLI vs Next env; loud NBA-required helper)
- Canonical team identity map (ESPN ≠ BDL numeric namespaces)
- Historical game identity normalization
- ESPN soft-fail resilience (player board, teams catalog, scoreboard)
- Request caches / dedupe / destination budgets
- Progressive destinations (Player / Team / Game / Offseason / History)
- Cross-route / UI continuity tests
- PBP **attach** boundary (`getPbpCapability` remains non-executable)

## Data truth

- Missing ≠ zero (no invented DRtg/NET/0 ratings when source omits fields)
- ESPN individual DRtg / NET unavailable as product columns
- No fabricated advanced season ratings in user-facing boards
- Production must not silently serve `LocalDataProvider` sample ids for canonical ESPN athlete pages
- ESPN player-season team filters do not expand BDL ids (BDL OKC `21` ≠ ESPN OKC `25` / ESPN PHX `21`)

## Current known blockers

- Per-game PBP: on-demand via CDN/stats (`getGamePossessions`, Game Lab flow)
- Bulk PBP corpus (`PBP_DATA_PATH`): optional for batch; attach-only gate via `getPbpCapability()`
- BDL GOAT advanced season access unavailable (401 / `accessBlocked`)
- Historical advanced ratings not production-ready
- Historical official logo assets absent (text marks only)

## Release gate

```bash
npm run test:drbl-release
npx tsc --noEmit
npm run build
```

See `docs/BRANCH_DELIVERABLES.md` for inventory and environment contract.
