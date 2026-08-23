# Product Roadmap — Interactive Analytical Database

> Derived from the Master Product + Engineering Prompt and an audit of the
> living repo (see `WORKBOOK.md`). This is the practical plan for expanding
> the site without rewriting what already works.

**North star:** Simple surface → extremely deep rabbit hole.  
**Rule:** Data → discovery → explanation. Never LLM → random opinion.

---

## 0. Audit summary (Phase 0)

### Surface map vs vision

| Vision area | Status | Existing foundation |
| --- | --- | --- |
| Player Intelligence | **Partial** | Bio, career, gamelog, percentiles, similar comps |
| Player Comparison | **Partial** | Metric comps only; no dedicated compare route |
| Career Resume | **Missing** | GM FO types only; no public thresholds |
| Team Intelligence | **V2** | `/teams/[teamId]` narrative: overview → performance → identity → arc → roster → games → evidence → transactions → Ask. See `docs/team-intelligence.md`. |
| Lineup Lab | **Missing** | GM lineup only |
| Game Lab | **Partial** | Box score + PBP flow timeline + raw PBP panel; validated possessions via `getGamePossessions` |
| Historical Time Machine | **Partial** | Explore/games + BDL cache; no discovery product |
| Stat Detective | **Missing** | — |
| Automated Discovery / Home | **Partial** | `ComputedInsight` + `FindingsSection` existed but unused on Home |
| Ask the NBA / NL → AST | **Missing** | — |
| Offseason tracker | **Missing** | Salaries CSV + GM stubs only |
| Context engine | **Partial** | Rich on player page; not systemic |
| Learn interactivity | **Partial** | Guides + explainers; little interactivity |
| Shareable queries | **Partial** | URL filters; no query IDs |
| PBP infrastructure | **Partial** | On-demand CDN/stats PBP + per-game possession pipeline; bulk `PBP_DATA_PATH` corpus optional for batch |
| DRBL hooks | **Missing** | Design-compatible stubs only |

### Reuse first

- Types / queries / filter-utils / search-params  
- `player-stat-comps`, percentile panel, Learn guides, `stat-explainers`  
- Home `ComputedInsight` shape + `FindingsSection`  
- Historical BDL + game caches, DARKO / LEBRON, brand chrome  

### Dependencies that block later phases

| Dependency | Blocks | Status |
| --- | --- | --- |
| Historical PBP import (external) | Batch ASK / season-scale indexes | Optional — per-game PBP already on-demand |
| DRBL research | Deep behavioral layer | Not required to ship foundations |
| Transaction / rumor feeds | Offseason tracker | ESPN events shipped; **Movement Center** (reported movement) is separate — see Phase 9 |
| Lineup / tracking data | Lineup Lab | Not available via current ESPN board |

### What can ship immediately (no PBP)

1. Analytical foundations (`src/analytics/*`) — context, explanations, finding shapes  
2. Domain stubs for query-engine / offseason / pbp (types only, no fake data)  
3. Wire Home “What the board is saying” from existing insights  
4. Progressive disclosure UI on player profiles (Level 1 → 2)  
5. Documented thresholds for future career resume / discovery  

### What must be staged

- Ask the NBA (needs AST + validators + limited metric vocabulary first)  
- Game Lab possession explorer UI (pipeline ready via `getGamePossessions`)  
- Offseason intelligence (need transaction ingest)  
- Lineup Lab (need lineup minutes / ratings source)  
- Optional what-if sandbox (after real offseason system)

---

## 1. Phase plan (execution order)

### Phase 1 — Analytical foundations ← **done (foundations)**

- [x] Audit + this roadmap  
- [x] `src/analytics` context / explanation / finding contracts  
- [x] `src/query-engine`, `src/offseason`, `src/pbp` type stubs  
- [x] Wire Home findings (existing discovery → UI)  
- [x] Progressive disclosure primitive on player page  
- [x] Player YoY evolution / biggest changes  
- [x] `/compare` skeleton  
- [x] Team profile route `/teams/[teamId]`  
- [x] Expand context chips into leaderboard  
- [x] Box-score Level-2 context on `/games/[gameId]`   

### Phase 2 — Player + Team Intelligence

- [x] Player hero narrative summary (data-backed, not LLM fluff) — initial  
- [x] YoY “biggest changes” from career `PlayerSeason` rows  
- [x] `/compare?a=&b=` side-by-side  
- [x] Same-player season compare / Best Season Lab (`/players/[id]/season-compare?a=&b=`)  
- [x] Rank My Seasons (`/players/[id]/season-rank?seasons=…`) — Copeland aggregation of pairwise compares  
- [x] Career resume with documented thresholds (`docs/career-resume.md`)  
- [x] Season-true historical impact foundation (`docs/historical-impact.md`) — CPI Career Resume unchanged  
- [x] Team profile route `/teams/[teamId]`  
- [x] Team trends (prior season vs current when sample allows)  
- [ ] Expand similar-player modes / Peak Impact UI (blocked on impact coverage)

### Phase 3 — Game + Historical

- Game flow when play-by-play or win-prob available  
- “What decided the game?” from box + advanced when present  
- Possession explorer **architecture** (no fake possessions)  
- Time Machine browse: eras, landmark games, ranking boards from existing caches  

### Phase 4 — Offseason Intelligence

- [x] Canonical transaction + asset lineage types / empty-safe queries (`docs/transaction-lineage.md`) — **genealogy UI blocked**  
- [x] ESPN free-text transaction archive ingest (2000–present) — structured assets/ownership still missing  
- [x] Real Offseason Tracker v1 (`/offseason`) — transaction **events** only (`docs/offseason-tracker.md`)  
- Structured trade/pick ledger ingest (required for genealogy)  
- Timeline + “why it matters” using DARKO/LEBRON/salary where valid  
- REAL vs REPORTED vs MODEL labeling  
- Watchlist → “Your offseason”

### Phase 5 — Ask the NBA

- Constrained intent → AST → validator → compiler → queries  
- Visible interpretation + editable assumptions  
- Result page with sample size + baselines  
- Stable `/query/[id]` later  

### Phase 6 — Automated Discovery

- Risers / fallers from season boards  
- Stat Detective for YoY / rolling deltas  
- Home “What Matters Today” editorial layer (data-first)

### Phase 7 — Deep PBP / DRBL

- Plug PBP into stubs; never SSR-scan full history  
- DRBL as deepest evidence layer when ready  

### Phase 8 — Optional what-if

- Clone real roster state; separate from Franchise Lab  

### Phase 9 — Live NBA Intelligence: Movement Center ← **architecture (M0)**

> **After** core UX, performance, merge-safety, and data-quality consolidation.  
> **Before** play-by-play becomes the sole development focus.  
> See `docs/product/live-nba-intelligence.md` · `docs/architecture/movement-center.md`

- [x] M0 domain types (`src/movement-center/`)
- [x] Evidence class taxonomy + score spec (docs)
- [x] Player overview column shell (empty state — no fabricated rumors)
- [x] M1 curated snapshot (`data/movement-center/v1/snapshot.json`)
- [x] Evidence scoring (`src/movement-center/scoring.ts`)
- [x] Read-only `/movement` landing + player monitors
- [ ] M1 curated internal prototype (manual sources, clustering)
- [ ] M2 read-only monitors + landing
- [ ] M3 seasonal Rumor Mill modes (config-driven calendar)
- [ ] M4 Rumor → Reality + resolution windows
- [ ] M5 Ask DRBL citations + transaction linkage

**Trust:** Evidence strength ≠ trade probability. Reported ≠ confirmed. Completed transactions ≠ unresolved reports.

### Phase 10 — Live NBA Intelligence: Sentiment

> **After Movement Center M2** (read-only monitors).  
> See `docs/architecture/sentiment.md`

- [ ] S0 platform feasibility (Reddit/news; **no X scraping without permitted API**)
- [ ] S1 internal prototype (fan/media separation)
- [ ] S2 Player/team Sentiment tab
- [ ] S3 event association (associative wording only)
- [ ] S4 Time Machine + Ask DRBL

---

## 1b. Product layers (canonical)

| Layer | Systems |
| --- | --- |
| **Core DRBL Intelligence** | Players, teams, games, contracts/transactions, compare, Ask DRBL, Time Machine, PBP, DRBL, WAR1 |
| **Live NBA Intelligence** | Movement Center (Rumor Mill presentation), Sentiment |

Performance, rumor evidence, and sentiment **must not** share a unified rating.

---

## 2. Architecture additions (canonical)

Keep: transformers → types → providers → queries → UI.

New **domain modules** (not page-local logic):

```text
src/analytics/     # context, explanations, findings, comparisons
src/query-engine/  # NL → AST → validate → compile (no arbitrary SQL)
src/offseason/     # TransactionEvent + timelines (what happened)
src/movement-center/  # Movement claims, clusters, evidence scores (future)
src/sentiment/     # Fan/media sentiment observations (future)
src/pbp/           # possession/event contracts + future indexes
```

Pages still call **queries**. Domains produce structures queries/UI consume.

---

## 3. Trust rules (non-negotiable)

- Never invent stats, sources, or DRBL outputs.  
- Show sample size, timeframe, filters when claiming context.  
- Prefer empty / “not enough data” over false precision.  
- No unbounded scrapes on hot SSR paths.  
- Offseason: never blur REAL / REPORTED / MODEL / SIMULATION.

---

## 4. First shipped increments (this PR / branch work)

1. `docs/PRODUCT_ROADMAP.md` (this file)  
2. Foundation modules under `src/analytics`, `src/query-engine`, `src/offseason`, `src/pbp`  
3. Home surfaces existing `insights` via `FindingsSection`  
4. Player hero shows Level-1 answer + Level-2 context (percentile / baselines) via analytics primitives  

Next recommended ticket after this: **YoY player changes** + **`/compare`** skeleton using `src/analytics` comparison types.
