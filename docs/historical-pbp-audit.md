# Historical PBP integration audit

**Status: DATASET NOT PRESENT IN THIS REPOSITORY**  
**Date:** 2026-08-14  
**Branch:** `drbl-ia-and-ask` @ `f6d9512` (+ local uncommitted health/nav polish)  
**Mode:** Read-only inspection — no PBP UI, ASK executors, or Game Lab changes.

---

## Executive finding

The historical play-by-play dataset that this task assumes has been imported **could not be located** in:

- `/Users/bombe/basketball-analytics` (tracked or ignored data paths)
- Adjacent home directories (`Desktop`, `Documents`, `Downloads`, `Projects`, `Dropbox`) under common `*pbp*` / `*play-by-play*` names
- Local git branches / worktrees (only `main` and `drbl-ia-and-ask`)

What exists today is a **contract stub** and honest capability denial — not an ingest.

`docs/PRODUCT_ROADMAP.md` already records:

> Historical PBP import (**external**) … **Not in this branch**

Until a concrete import path is attached to this repo, **no PBP capability gates can be marked READY**, and ASK / Game Lab must continue to refuse possession / clock / zone execution.

---

## 1. Source / storage location

| Item | Result |
| --- | --- |
| Exact storage location | **Not found** |
| File/database format | N/A |
| Schema | N/A (no tables/files) |
| Total size | **0 bytes of PBP events** |
| Partitioning / indexing | None |
| Ingestion version | None |
| Source | Unknown / not landed |
| Raw vs normalized | N/A |
| Derived fields | N/A |

### What *is* present (and is **not** PBP)

| Path | What it is | Why it is not PBP |
| --- | --- | --- |
| `src/pbp/index.ts` | Type stubs (`PbpEvent`, `Possession`) + `getPbpCapability()` | Returns all `false`; no I/O |
| `src/data/types/shot.ts` | Canonical `Shot` type | Live `getShots()` returns `[]` |
| `data/cache/games/*.json` | BallDontLie **game schedule/summary** cache | Keys: id, teams, scores, date, season — **no events** |
| `data/transactions/` | ESPN transaction event archive | Offseason/trades, not play-by-play |
| ESPN box scores / Game Lab | Period linescores + player box rows | Aggregates, not event timelines |

### Game-cache inventory (for contrast)

| Season file | Games | Source |
| --- | ---: | --- |
| 1960-61 … 1969-70 | 316–574 each | `balldontlie` |
| 2024-25 | 1230 | `balldontlie` |
| **Total cached games** | **5391** | Schedule/summary only |

Sample game object keys: `id`, `season`, `gameDate`, `homeTeamId`, `awayTeamId`, scores, `gameType`, `status` — **zero nested play events**.

---

## 2–15. Coverage audits (games / event / clock / score / IDs / shots / possessions / subs)

**All blocked:** no event rows to count.

| Audit section | Result |
| --- | --- |
| Game coverage | **0 PBP games** |
| Event coverage | **0 events** |
| Event types | **None observed** |
| Game clock | **N/A** |
| Score state | **N/A** |
| Canonical game ID mapping | **N/A** (nothing to map) |
| Team ID mapping | **N/A** |
| Player ID mapping | **N/A** |
| Season mapping | **N/A** |
| Shot location | **N/A** (type exists; no data) |
| Shot / play type | **N/A** |
| Possessions | Explicit: **NO** · Derivable: **UNKNOWN** (no events) · Confidence: **N/A** |
| Substitutions / lineups | **N/A** |

---

## 16. Flagship query feasibility

> What is Trey Murphy's FG% inside the college three with &lt;6:00 left in Q4?

### Verdict: **NOT POSSIBLE** (in this repository)

| Required field | Status |
| --- | --- |
| 1. Player identity in PBP | Missing — no PBP player keys |
| 2. FG attempt events | Missing |
| 3. Make/miss | Missing |
| 4. 2PT/3PT | Missing |
| 5. Shot location | Missing |
| 6. Quarter / period | Missing |
| 7. Game clock | Missing |
| 8. Canonical game ID | Site games exist; **no PBP link** |
| 9. Season | Site seasons exist; **no PBP link** |
| 10. Team/opponent | Site box/schedule exist; **no PBP link** |

ASK DRBL correctly keeps these dimensions in **unsupported / partial** states.

---

## 17. Future ASK DRBL dimension readiness

| PBP capability | Status |
| --- | --- |
| Period filter | **NOT READY** |
| Game clock filter | **NOT READY** |
| Shot zone / college three | **NOT READY** |
| Possession | **NOT READY** |
| Lineup | **NOT READY** |
| Defender / matchup | **NOT READY** |
| DRBL behavior | **NOT READY** |

---

## 18. Canonical PBP contract (stub only)

Existing stub in `src/pbp/index.ts` (already in repo — **not expanded** by this audit):

```text
PbpEvent: id, gameId, period, clockSeconds?, wallTime?, type, teamId?, playerId?, description?, points?, locX?, locY?
Possession: id, gameId, period, offense/defense team, eventIds, points
getPbpCapability(): all false until ingest lands
```

**Do not** treat this stub as evidence of ingest. Do not widen the contract until real columns are observed.

---

## 19–20. Query layer / indexing

**Not created.** No dataset to index. Exposing `getGamePbp` / `queryPbp` against empty storage would only create a false sense of readiness.

Recommended **after** import lands:

1. Re-run this audit against the real path  
2. Then add indexes for `gameId`, `season`, `playerId`, `eventType`, `period`  
3. Only then add query primitives that refuse scans without required keys

---

## 21. Coverage by era

| Era / Season | Games (PBP) | PBP complete? | Shot data? | Player IDs? | Possessions? |
| --- | ---: | --- | --- | --- | --- |
| All eras in repo | **0** | No | No | No | No |
| 1960s (game **schedule** cache only) | 0 PBP / ~4k schedule games | No | No | No | No |
| 2024-25 (schedule cache) | 0 PBP / 1230 schedule games | No | No | No | No |

---

## 22–23. Capability gates & degradation

| Capability | Status |
| --- | --- |
| Game PBP | **NOT READY** |
| Player PBP | **NOT READY** |
| Period | **NOT READY** |
| Game clock | **NOT READY** |
| Shot location | **NOT READY** |
| Possession | **NOT READY** |
| Lineup | **NOT READY** |
| Defender | **NOT READY** |
| DRBL | **NOT READY** |

Current product degradation (already correct):

- **No PBP** → traditional Game Lab (box + linescores)  
- ASK DRBL → explicit unsupported / partial for PBP clauses  

---

## 24–25. Game Lab / ASK future paths

Documented conceptually only. **No code changes.** Game Lab already gates `pbpAvailable` off `getPbpCapability()`. ASK rejects PBP dimensions in the validator.

---

## 26. Real-world validation

**Cannot inspect event sequences** — no events.  
Schedule-cache games were spot-checked structurally (not PBP).

---

## 27. Suggested quality thresholds (for when import arrives)

Documented **targets for a future audit**, not current measurements:

| Gate | Provisional bar (justify on first real sample) |
| --- | --- |
| Game ID match to canonical | ≥ 99% of in-scope games, 0 ambiguous dual maps |
| Player ID resolution | ≥ 95% of event actor slots; unresolved list published |
| Event order / clock | &lt; 0.1% anomalous reverse-clock events before enabling CLOCK_FILTER |
| Shot location on FGA | ≥ 90% non-null before SHOT_LOCATION / college-three |
| Possession reconstruction | Holdout manual audit on ≥ 20 games before POSSESSION |

Do **not** enable ASK executors on nonzero row counts alone.

---

## 28. Testing

Added: `npm run test:pbp-capability` — asserts `getPbpCapability()` remains all-`false` until ingest is deliberately wired.

Mapping / clock / possession tests **require real fixtures** and are deferred.

---

## 29–30. Stop condition

**Honored.** No Game Lab PBP UI, ASK PBP execution, shot charts, Lineup Lab, or DRBL.

---

## Known problems

1. **Primary:** Historical PBP import is **not in this workspace**.  
2. Easy confusion: `data/cache/games` looks “historical” but is **schedule/summary**, not play-by-play.  
3. Stub types in `src/pbp` can be mistaken for a live pipeline — capability report correctly denies readiness.

---

## Safe next implementation (do not auto-start)

1. **Locate or land the external PBP import** into a documented path (e.g. `data/pbp/<source>/<version>/` or an external volume referenced by env).  
2. Record: source, version, schema dump, partition layout, row counts.  
3. **Re-run this audit** as a read-only pass against real files.  
4. Only after game/player ID mapping and clock validation pass thresholds, add `getGamePbp(gameId)` behind capability gates.

---

## Commands used (read-only)

- Filesystem search for `*pbp*`, `*play-by-play*` under repo + home project dirs  
- Inspection of `data/`, `src/pbp/`, `docs/PRODUCT_ROADMAP.md`  
- JSON schema probe of `data/cache/games/*.json`  
- `git branch` / worktree list  
