# 27 — Technical debt

Careful search for `TODO`/`FIXME`/`HACK` under `src/` and `drbl/` found **no** active TODO/FIXME/HACK markers. Debt is primarily `@deprecated` / semantic / fixture / identity debt.

## Classification

### A. Deprecated API surface (compat retained)

| Location | Note |
| --- | --- |
| `src/data/types/player-season.ts` `drblWar` | `DEPRECATED_NONCANONICAL` — storage/API only; never display as canonical cumulative value |
| `drbl/models/player-value.ts` | Legacy WAR aliases / deprecated predict helpers |
| `drbl/models/pipeline-value.ts` | Deprecated possession field names |
| `drbl/models/leaderboard.ts` | Posterior/WAR CSV aliases |
| `drbl/historical/season-registry.ts` `supportTier` | Prefer `historicalSourceQualityTier` |
| `src/lib/nba-brand.ts` | Deprecated headshot / featured-abbr helpers |
| `src/query-engine/types.ts` | Prefer `pickAskExamples()` |
| `src/gm/*` | Older MyLeague save field aliases |
| `src/data/queries/teams-catalog.ts` | Soft-fail catalog helper |
| `src/components/sports/gamefeed.tsx` | Prefer `Gamefeed` export |

### B. ESPN identity + fixture debt (HIGH product risk)

- **Canonical team id = ESPN string** (`src/lib/team-identity.ts`, `src/data/identity/team-map`).
- **BDL numeric ids collide with ESPN** (documented: BDL OKC `21` = ESPN PHX). Filters/deep links must never pass bare BDL numerics into ESPN-scoped `?team=`.
- `game-team-identity.ts` must preserve provider namespace; guessing ESPN vs BDL from bare numbers is forbidden.
- Historical **team-era** branding depends on confirmed ESPN ids + season — anachronistic logos otherwise.
- Release gate: `test:drbl-release:live-espn` / team-identity live schedule samples can miss without meaning model regression (fixture fragility). Prefer fixture mode for CI seals.
- Transaction lineage / historical impact / PBP capability tests intentionally use **synthetic fixtures** that must not unlock production capabilities.

### C. Data / environment debt

- `data/drbl/normalized/*` may be absent in thin worktrees — some evaluation unit tests (`m16b-evaluation` chronological splits) ENOENT without the normalized corpus.
- PBP ASK/Game Lab capability stays gated even when `PBP_DATA_PATH` points at a corpus (`data/pbp/README.md`).
- Raw lineup completeness below strict Tier-A 99.9% gate for published seasons — product status remains canonical/retrospective via registry notes.

### D. Research vs production boundary debt

- UIR (M18a) established as research residual — **not** public canonical.
- Off-ball / tracking (M18b) blocked on licensed tracking access.
- Legacy WAR math remains in tree for forensics; public board must not re-surface it.

### E. Historical product debt

- Cross-era comparability not fully established; career cumulative R1 not published as canonical.
- Tier A seasons: none; Tier B historical starts 2020-21.
