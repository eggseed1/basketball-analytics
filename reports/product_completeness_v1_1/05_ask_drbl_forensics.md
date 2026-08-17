# 05 — ASK DRBL forensics (P17.1 Phase A)

**Scope:** Read-only product surface audit. No model code changes.  
**Worktree:** `C:\Users\parkh\Projects\basketball-analytics-integration`  
**Freeze:** `reports/product_completeness_v1_1/00_freeze.json`  
**Related gaps (v1):** G01 (no DRBL metrics in ASK), G25 (learn registry thin on DRBL concept ids)

---

## 1. Surface map

| Layer | Absolute path | Role |
| --- | --- | --- |
| Route | `src/app/ask/page.tsx` | RSC entry; parses `q`, builder params, `playerId`/`teamId`, Time Machine context |
| Loading | `src/app/ask/loading.tsx` | Skeleton |
| Query wrapper | `src/data/queries/ask-drbl.ts` | Thin re-export of `runAskDrbl` |
| Pipeline | `src/query-engine/run.ts` | interpret → context → entity override → resolve → validate → execute |
| Interpreter | `src/query-engine/interpret.ts` | NL → `BasketballQueryAst` |
| Metrics catalog | `src/query-engine/metrics.ts` | `ASK_METRICS` + `resolveMetric` |
| Types | `src/query-engine/types.ts` | `AskMetricId`, operations, result contract |
| Coverage gates | `src/query-engine/coverage.ts` | Season-true availability (DARKO/LEBRON special-cased) |
| Entities | `src/query-engine/entities.ts` | Aliases + ESPN search; `resolveQueryEntities` |
| Executor | `src/query-engine/execute.ts` | Trusted calls into existing query/analytics modules |
| Builder | `src/query-engine/ask-builder.ts` | Structured composer → natural language |
| Examples | `src/query-engine/ask-examples.ts` | Curated prompts (no DRBL vocabulary today) |
| Context | `src/query-engine/ask-context.ts` | History/`season=` inheritance rules |
| UI | `src/components/ask/ask-drbl-view.tsx` | Result chrome, builder, examples, recent |
| Builder form | `src/components/ask/ask-builder-form.tsx` | Metric dropdown from `ASK_METRICS` |

Brand promise (route metadata): *“Natural-language basketball analytics — structured queries over trusted DRBL data.”*  
**Forensic finding:** The product name is ASK **DRBL**, but executable metrics are box-score / DARKO / LEBRON / CPI / team boards — **no `drbl100` / R1 fields**.

---

## 2. Supported metrics today

From `AskMetricId` + `ASK_METRICS` (`src/query-engine/types.ts`, `metrics.ts`):

### Player / either

| id | Label | Scope | Notes |
| --- | --- | --- | --- |
| `ppg`, `points` | Points (per game / total semantics) | player_season | Counting |
| `rpg`, `rebounds` | Rebounds | player_season | Counting |
| `apg`, `assists` | Assists | player_season | Counting |
| `spg`, `bpg`, `tov`, `mpg` | Steals / blocks / TOV / minutes | player_season | Counting |
| `fg_pct`, `fg3_pct`, `ft_pct` | Shooting % | either | Board fields |
| `ts_pct`, `efg_pct` | TS% / eFG% | either | Derived |
| `usg_pct` | Usage | player_season | Coverage notes say unreliable historically |
| `darko` | DARKO DPM | player_season | Live snapshot only (see coverage) |
| `lebron` | LEBRON | player_season | Sparse season-keyed |
| `cpi` | Career Production Index | derived | Not impact |

### Team

`team_ppg`, `team_opp_ppg`, `team_diff`, `team_efg`, `team_ts`, `team_fg3`, `team_tov`, `team_rpg`

### Explicitly absent (product gap)

- `drbl100`, `drblO`, `drblD`, `drblP`, `drblLn`, `drblB`
- `r1Points`, `r1WinEquivalents`
- Learn registry (`src/content/learn/registry.ts`) has `darko` and `ask_drbl` but **no** `drbl100` / R1 concept ids (G25)

### Operations (`QueryOperation`)

`season_stat`, `team_season_stat`, `leaderboard`, `season_compare`, `team_season_compare`, `team_season_rank`, `team_season_game_evidence`, `season_rank`, `career_resume`, `game_lab`, `box_score_context`, `offseason_summary`

Executor switch: `src/query-engine/execute.ts` → `executeBasketballQuery`.

`readPlayerMetric` maps `darko` → `row.darkoDpm`, `lebron` → `row.lebron`; **no DRBL branch**.

---

## 3. Player grounding — how it works now

### Safe grounding paths (already exist)

1. **URL force-id** — `?playerId=` on `/ask`  
   - `src/app/ask/page.tsx` passes `playerId` into `getAskDrblAnswer`  
   - `runAskDrbl` → `applyPlayerIdOverride` (`src/query-engine/run.ts`) injects / overrides player entity id, clears ambiguity, enriches name via `getPlayer`

2. **Alias table** — `PLAYER_ALIASES` in `src/query-engine/entities.ts`  
   - Deterministic ESPN athlete ids for common names (Jokic, Curry, LeBron, …)

3. **ESPN search** — `resolvePlayerQuery` → `searchNbaEntities`  
   - Ambiguity returned as `ast.ambiguous` (UI disambiguation)

4. **Player-page deep links** — `src/components/players/player-ask-links.ts` (+ core island “Ask DRBL about …”)  
   - Grounds by id without re-parsing the name

### Unsafe / incomplete for DRBL

| Risk | Detail |
| --- | --- |
| ESPN id ≠ NBA Stats id | DRBL overlay keys on NBA id via `resolveNbaIdForDrbl` (`players.ts`). ASK entities are ESPN-centric. Season-stat for DRBL must resolve ESPN→NBA **before** overlay lookup, same as explore/player destination. |
| Name-only leaderboard | Leaderboard executor uses filtered season boards; DRBL only appears if board path overlays DRBL (`getFilteredPlayerSeasons`). ASK metric catalog still cannot request `drbl100`. |
| Synonym collision | “DRBL” as product name vs metric; “ability”, “R1”, “win equivalents” are not synonyms today — adding them without scope discipline can steal matches from vague English. |
| Coverage honesty | `metricSeasonAvailability` must refuse non-registry seasons (`isDrblSeason` / `listDrblSeasons`) — never invent DRBL for unsupported years. Registry today: **2020-21 … 2025-26** (`drbl/historical/season-registry.ts`, six `drblAvailable: true` seasons). |

---

## 4. How to add DRBL vocabulary safely (recommended design — implement later)

### Minimal metric set (Phase B candidate)

| AskMetricId | Synonyms (examples) | Format | Coverage rule |
| --- | --- | --- | --- |
| `drbl100` | `drbl`, `drbl/100`, `drbl 100`, `ability rate`, `validated drbl` | impact/number | `isDrblSeason(season)` + valid estimate |
| `r1_points` | `r1 points`, `r1 pts` | number | registry R1 seasons |
| `r1_win_eq` | `r1 win`, `win equivalents` | number | registry R1 seasons |

Defer public ASK exposure of `drblO`/`drblD`/`drblP`/`drblLn`/`drblB` until learn tooltips + non-additive warnings exist (align with explore disclosure policy / G17).

### Patch points (ordered, no model changes)

1. **`src/query-engine/types.ts`** — extend `AskMetricId` union.  
2. **`src/query-engine/metrics.ts`** — add defs; put longer synonyms before generic “points”; prefer `learnHref: /learn/drbl`.  
3. **`src/query-engine/coverage.ts`** — `metricSeasonAvailability` for DRBL/R1 using `isDrblSeason` / R1 flags from season-registry bridge (`src/data/drbl/season-registry.ts`). Add rows to `getAskMetricCoverageAudit`. Optionally list DRBL under gaps until wired.  
4. **`src/query-engine/execute.ts`** — `readPlayerMetric` + `sourceForPlayerMetric`; ensure season_stat / leaderboard load rows that already have DRBL overlay (prefer `getFilteredPlayerSeasons` / career timeline overlay — **not** bare `getPlayerSeason`, which currently skips DRBL overlay).  
5. **`src/query-engine/ask-builder.ts`** — builder metric list inherits `ASK_METRICS` (automatic once catalog grows); validate season against registry when metric is DRBL.  
6. **`src/query-engine/ask-examples.ts`** — add 2–4 capability-aligned examples only after executor works.  
7. **`src/content/learn/registry.ts`** + **`src/lib/learn-column-concepts.ts`** — concept ids so `MetricHelp` / ASK tooltips resolve.  
8. **Player grounding** — keep `playerId` override as the preferred path; for NL, after ESPN resolve, call existing `resolveNbaIdForDrbl` before DRBL field read (reuse `players.ts` helpers — do not duplicate crosswalk).

### Safety checklist

- Refuse with `no_result` when season not in `listDrblSeasons()` (mirror DARKO’s honest refusal copy).  
- Refuse when estimate invalid / identity unresolved (same semantics as player core island empty reasons).  
- Do not substitute DARKO or CPI when DRBL missing.  
- Do not stamp current-season DRBL onto other seasons.  
- Leaderboard sort key must match explore: descending unrounded `drbl100` among valid estimates (`src/lib/player-explore-sort.ts` pattern).

---

## 5. Hierarchy recommendation for ASK

**DRBL-first vocabulary when the user asks for value/ability; keep box-score metrics as default for counting questions.**

- Synonym scoring: prefer `drbl100` over `darko` when query contains `drbl` / `ability` / `r1`.  
- Do **not** silently rewrite “who is the best player” → DRBL (still blocked by vague-competitive language in `interpret.ts`).  
- Examples + builder should surface DRBL as first-class impact metric once executable.

---

## 6. Non-goals for this forensics pass

- No changes to DRBL model / EB1600 / sealed parameters.  
- No new ASK operations required for DRBL season_stat / leaderboard.  
- Season-compare / season-rank ASK ops already exist; they inherit impact from historical DARKO/LEBRON snapshots — DRBL participation there is a **compare analytics** change (see `10_compare_drbl_audit.md`), not ASK-only.
