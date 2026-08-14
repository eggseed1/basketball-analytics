# MyLeague Architecture

**Status:** Milestone 3 in progress — `SiteRealNBADataProvider`, CBA registry,
historical snapshot ingest, Offseason Hub shell. Parallel simulator remains out
of scope. Playable annual loop is Milestone 4.

**Workspace reality:** This repository is
[`basketball-analytics`](../README.md), which already ships an original
**Franchise Lab** GM (`src/gm/`). It is **not** a checkout of
[ZenGM / Basketball GM](https://github.com/zengm-games/zengm).

**License constraint:** ZenGM’s
[LICENSE](https://github.com/zengm-games/zengm/blob/master/LICENSE.md) allows
viewing, local private edits/runs, and sharing *source*, but **forbids hosting
a playable public fork** that competes with play.basketball-gm.com. Therefore:

| Layer | In this product |
| --- | --- |
| **Layer A — simulation engine** | Original Franchise Lab engine (`src/gm/engine/*`) + analytics data layer (`src/data/*`). **Not** ZenGM’s `GameSim.basketball`. |
| **Layer B — Deep MyLeague** | New franchise-management layer (this design). Feeds inputs into Layer A; never mutates ratings via analytics. |
| **ZenGM reference** | Audited locally under `/tmp` for lifecycle/schema mapping only. No ZenGM source is vendored into this repo. |

Private contributors who hold a local ZenGM tree may use the same Layer B
*interfaces* as a mental model for patches they contribute upstream under ZenGM’s
CLA — but this repo must remain original code.

---

## 1. ZenGM audit map (view-only)

Audited against ZenGM `master` (shallow clone). Basketball real-player window:
**1947 → 2027** (`REAL_PLAYERS_INFO`).

### Top-level layout

```
src/
  common/     # PHASE, PLAYER, types, constants, helpers (shared UI+worker)
  ui/         # React views, router, toWorker bridge
  worker/     # IndexedDB, Cache, core simulation, API surface
    api/      # promiseWorker-registered commands
    core/     # league, phase, draft, trade, FA, GameSim.*, realRosters, …
    db/       # connectIndexedDB, Cache, getCopies
    views/    # worker-side view data builders
```

### Lifecycle (source of truth in ZenGM)

| Concern | Primary location |
| --- | --- |
| Phase IDs | `src/common/constants.ts` → `PHASE` |
| Phase transitions | `src/worker/core/phase/newPhase.ts` → per-phase `newPhase*.ts` |
| Season end → lottery | `newPhaseBeforeDraft.ts` (wired as `PHASE.DRAFT_LOTTERY`) |
| Draft | `newPhaseDraft.ts`, `core/draft/*` (lottery, order, select, genPlayers) |
| After draft | `newPhaseAfterDraft.ts` |
| Resign / options | `newPhaseResignPlayers.ts`, `core/contractNegotiation/*` |
| Free agency | `newPhaseFreeAgency.ts`, `core/freeAgents/*` |
| Preseason | `newPhasePreseason.ts` (development, contracts tick, schedule) |
| Regular season | `newPhaseRegularSeason.ts`, `core/game/*`, `core/season/*` |
| Trade deadline | `newPhaseAfterTradeDeadline.ts` (`PHASE.AFTER_TRADE_DEADLINE`) |
| Playoffs | `newPhasePlayoffs.ts` |
| Game simulation | `src/worker/core/GameSim.basketball/` (**do not replace**) |
| Player develop | `core/player/develop*.ts` |
| Contracts / gen | `core/player/genContract.ts`, negotiation module |
| Cap / finances | `gameAttributes` (salaryCap, luxuryPayroll, …), `core/finances/*`, TeamFinances UI |
| Trades | `core/trade/*` |
| Real historical data | `core/realRosters/*` (`getLeague`, `loadData.basketball`, draft prospects) |
| Expansion / relocate | `phase/relocateExpand.ts`, `core/expansionDraft/*` |
| IndexedDB | `worker/db/connectIndexedDB.ts`, `connectLeague.ts`, `Cache.ts` |
| Worker ↔ UI | `promiseWorker` in `worker/index.ts`; UI `toWorker` |
| Player / team schema | `common/types.ts`, `types.basketball.ts` |
| UI routing | `ui/router`, `ui/views/*` (LeagueDashboard, Draft, Trade, Roster, …) |

### ZenGM `PHASE` (numeric)

```
EXPANSION_DRAFT=-2, FANTASY_DRAFT=-1,
PRESEASON=0, REGULAR_SEASON=1, AFTER_TRADE_DEADLINE=2, PLAYOFFS=3,
DRAFT_LOTTERY=4, DRAFT=5, AFTER_DRAFT=6, RESIGN_PLAYERS=7, FREE_AGENCY=8
```

Annual loop (simplified):

```
PRESEASON → REGULAR_SEASON → AFTER_TRADE_DEADLINE → PLAYOFFS
  → DRAFT_LOTTERY → DRAFT → AFTER_DRAFT → RESIGN_PLAYERS → FREE_AGENCY
  → PRESEASON (next season)
```

### What already exists vs what MyLeague adds

| Already in BBGM-class games | MyLeague Layer B addition |
| --- | --- |
| Phases, draft, FA, trades, sim, IDB | Deeper FO hub, staff org chart, analytics provider |
| Real-player leagues (BBGM) | Immutable RealityUniverse + SimulationUniverse + branch point |
| Mood / finances (BBGM) | DecisionLog, KnowledgeDate, CBARules by season, What-If lab |
| Ratings + fuzz | Explicit InformationCutoff + scouting fog modes |
| Scheduled events / expansion hooks | LeagueEvolutionEngine + Reality vs Your World timeline |

### Extend vs replace (ZenGM-private or Franchise Lab)

| Component | Action |
| --- | --- |
| Possession / box sim | **Preserve** (BBGM GameSim *or* Franchise Lab `simulate.ts`) |
| Phase / season advance | **Extend** with richer MyLeaguePhase substates |
| realRosters / RealNBADataProvider | **Extend** via provider adapters; never overwrite reality snapshots |
| Trade / FA negotiation | **Extend** with analytics evaluations (advisory only) |
| UI dashboards | **Add** MyLeague Home / Offseason Hub / History — do not gut existing screens |
| Analytics | **New pluggable** `AnalyticsProvider` — never required for sim |

---

## 2. Proposed architecture (this repo)

```
UI (/gm/myleague/*)
  ↓
MyLeagueController (client actions + phase guards)
  ↓
Worker / store (zustand + IndexedDB today; optional Web Worker later)
  ↓
Layer A — Franchise Lab engine (schedule, sim, standings, draft, cap, …)
  ↓
AnalyticsProvider (optional, read-only evaluations)
  ↓
RealNBADataProvider adapters → HistoricalSeasonSnapshot (immutable)
```

**Rules:**

1. Analytics providers **never mutate** game state; they return
   `AnalyticsEvaluation` only.
2. Real historical snapshots are **immutable**; saves reference them by ID.
3. Simulation state is a **clone** of a snapshot at `branchSeason` / `branchPhase`.
4. Every user-visible fact is filtered by `KnowledgeDate` / `InformationCutoff`.
5. When real data horizon ends, `LeagueEvolutionEngine` + future player
   generation take over — seeded from the last real environment.

---

## 3. Data model (conceptual)

See TypeScript in `src/gm/myleague/types.ts`.

Core objects:

- `MyLeague` — save root (settings, pointers, career resume)
- `HistoricalUniverse` — immutable reality seasons
- `SimulationUniverse` — branching playable state
- `HistoricalSeasonSnapshot` — one real season frozen
- `TimelineEvent` — reality or simulation event with optional real equivalent
- `DecisionLog` — FO decisions + analytics recommendation at decision time
- `CBARules` — season-specific CBA (not hardcoded to 2024–25)
- `StaffMember` — FO / coaching / medical
- `LeagueEvolutionState` — expansion, relocation, rule drift, future CBA
- `AnalyticsContext` / `AnalyticsEvaluation` — provider contract

---

## 4. Season flow

Formal state machine: [`myleague-season-flow.md`](./myleague-season-flow.md).

First **playable** loop (Milestone 4 target):

```
Historical Start → Draft → Free Agency → Preseason → Season → Playoffs → Next Draft
```

Deepen phases only after that loop is reliable across multiple seasons.

---

## 5. Extension points

| Hook | Interface / module |
| --- | --- |
| Real data ingest | `RealNBADataProvider` |
| Analytics | `AnalyticsProvider` (+ `NullAnalyticsProvider`) |
| CBA | `CBARules` registry by season |
| Staff effects | probabilistic modifiers on scouting/dev/injury uncertainty |
| AI FO | separate from AnalyticsProvider (org realism ≠ objective value) |
| Future gen | `LeagueEvolutionEngine` after `realDataHorizon` |
| Reality compare | `TimelineEvent.realWorldEquivalent` |

---

## 6. Franchise Lab mapping (Layer A today)

| MyLeague need | Current Franchise Lab |
| --- | --- |
| League state | `GmLeagueState` (`src/gm/types.ts`) |
| Persist | zustand + idb-keyval `franchise-lab-gm` |
| Sim | `src/gm/engine/simulate.ts` |
| Cap | `src/gm/engine/cap.ts` |
| Schedule / standings / playoffs | `schedule.ts`, `standings.ts` |
| Draft / injuries / develop | `progression.ts` |
| Trades | `trades.ts` |
| UI shell | `/gm/*` |

MyLeague types wrap and eventually supersede ad-hoc phase strings
(`regular` | `playoffs` | `draft` | …) with the richer
`MyLeaguePhase` machine — without throwing away the current vertical slice.

---

## 7. Success criteria (from product brief)

Not claimed complete until:

1. Start real historical season  
2–9. Full annual loop multi-season  
10–11. Persistent alternate history vs reality  
12–13. Pluggable analytics + backtest harness  
14. Continue into generated future past real data horizon  

---

## 8. Next milestones (implementation order)

1. ~~Architecture docs + types~~  
2. ~~MyLeague state scaffolding + Reality/Simulation stores~~  
3. ~~Historical initialization via RealNBADataProvider~~ — `SiteRealNBADataProvider` + CBA registry + Offseason Hub shell  
4. Annual flow playable loop  
5. Deep staff / scouting / AI FO / finances / evolution / analytics lab / History UI → polish  

### Milestone 2 deliverables (this repo)

| Module | Role |
| --- | --- |
| `src/gm/myleague/phase.ts` | Phase order, sim gates, Gm ↔ MyLeaguePhase bridge |
| `src/gm/myleague/knowledge.ts` | KnowledgeDate / InformationCutoff helpers |
| `src/gm/myleague/historical-universe.ts` | Immutable Reality snapshots (placeholder attach) |
| `src/gm/myleague/simulation-universe.ts` | Branching SimulationUniverse helpers |
| `src/gm/myleague/create-myleague.ts` | Bootstrap bundle around Franchise Lab league |
| `src/gm/myleague/controller.ts` | Phase advance + decision logging + sim gate |
| `src/gm/myleague/store.ts` | IndexedDB persist `franchise-lab-myleague` |
| `useGmStore` bridge | `bootstrap` / `sync` / sim gate on Layer A actions |

**Not in M2:** Offseason Hub UI, parallel simulator, real CBA registry, real roster ingest.
