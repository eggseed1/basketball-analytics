# DRBL Site Master Workbook

**Version:** v3 · **As of:** 2026-09-20  
**Repo:** `basketball-analytics`  
**Host:** Cloudflare Workers (OpenNext) · `https://basketball-analytics.drbl-analytics.workers.dev`  
**Stack:** Next.js 16 App Router · React 19 · TypeScript · Tailwind 4 · `@/` → `src/`

> This workbook is the living map of **every public function**, **design philosophy**, **proprietary system**, and **recommended next steps**.  
> Older companions still useful: `WORKBOOK.md` (ChatGPT paste), `docs/PRODUCT_ROADMAP.md` (phased plan — partially stale), `docs/data-architecture.md` (truth rules), `docs/design-foundation.md` (UI contract), `drbl/PLAN.md` (research pipeline).

---

## 0. How to use this document

| If you need… | Go to… |
| --- | --- |
| What the product is for | §1 |
| What every route does | §3 |
| How DRBL / WAR1 / Ask / Trade / FO work | §4 |
| Visual / UX rules | §2 + §5 |
| What not to invent | §6 |
| Deploy / bake | §7 |
| What to build next | §9 |

**Mental model:**

```
External feeds (ESPN, NBA Stats/CDN, BRef, DARKO, RAPTOR, hustle, PBP)
        │
        ▼
 Transformers → Canonical types (PlayerSeason, Game, …)
        │
        ▼
 Providers → Queries (pages call THESE)
        │
        ▼
 Runtime bake (CF JSON overlays) ──┐
        │                          │
        ▼                          ▼
 UI destinations / explore / Ask / Learn
```

**Rules that keep the codebase coherent:**

1. UI never speaks provider field names — only canonical types.
2. Pages call **queries**, not raw providers (usually).
3. Filter once in the query layer; charts and tables share the same array.
4. Percentages are fractions in `[0, 1]`; format in `src/lib/format.ts`.
5. Seasons are canonical `YYYY-YY` (e.g. `2025-26`).
6. Missing ≠ zero. Unsupported stays unsupported.

---

## 1. Product thesis

### North star

**Simple surface → extremely deep rabbit hole.**  
**Data → discovery → explanation.** Never LLM → random opinion.

Audience: analytics-literate fans who still need plain language. The site should feel like a calm sports product (Apple Sports–inspired light glass), not a Fantasy dashboard of cards.

### What DRBL the product sells

| Layer | Meaning |
| --- | --- |
| **Core DRBL Intelligence** | On-court performance: players, teams, games, compare, standings, historical context |
| **Proprietary value** | DRBL/100 (rate), R1 Points (realized), WAR1 (R1 ÷ frozen P1) — seasons **2020-21 → 2025-26** |
| **Context overlays** | DARKO, RAPTOR, BRef advanced, hustle — season-true, never redefined as DRBL |
| **Live intelligence** | Sentiment (perception) and Movement (reported possible moves) — **never** blended into value |
| **Transactions** | What actually happened (ESPN events + structured ledger when present) |
| **Ask DRBL** | Constrained NL → AST → trusted executors (no invented metrics) |
| **Franchise Lab `/gm`** | Simulation scaffold — separate from live product truth |

### Separation invariants (do not cross-contaminate)

```
DRBL / WAR1 / R1     ≠   DARKO / RAPTOR / BPM
Performance value    ≠   Sentiment (fan/media perception)
What happened (tx)   ≠   What may happen (Movement)
Free-text ESPN blurb ≠   Structured ownership edges
Role / archetype     ≠   Quality / impact rating
Roster season chrome ≠   Stats season (offseason prior-year fallback)
```

---

## 2. Design philosophy

### 2.1 Visual system

| Principle | Implementation |
| --- | --- |
| Light-default glass sports shell | `docs/design-foundation.md`, `src/styles/drbl-tokens.css`, `globals.css` |
| Glass cheap by default | `GlassSurface` `effect="css"`; liquid SVG only for rare marketing |
| Atmosphere wash | `PageAtmosphere` + team palette radials so glass has color to sample |
| Dense boards stay dense | `boardType` tokens — not web `type` scale |
| Soft query continuity | Never blank the page; dim + 2px updating bar (`query-nav`, `destination-client-shell`) |
| Era cosmetics ≠ data model | `EraThemeScope` / `era-theme.ts` — one product, theme follows season |
| HOF honor | Gold outline / page frame (`hall-of-fame-style.ts`) — not a decoration toggle |

### 2.2 Destination composition

**Player** (`/players/[id]`): identity (role, vitals, accolades, FO) → percentile hero → tab bodies (career, games, stats, shooting, depth) → **Similar players last** on overview.

**Team** (`/teams/[id]`): who they are → how good → how they win → what’s changing → roster → games → movement → Ask. Not a clone of the player page (`docs/team-intelligence.md`).

**Progressive islands:** Suspense + skeletons; slim edge can drop heavy work.

### 2.3 Chart conventions

- Recharts only via `recharts-lazy.tsx` (`ssr: false`) — keep charts out of Worker SSR.
- Frost tooltips portal to `document.body` (`frost-recharts-tooltip.tsx`).
- Prefer `useChartTheme()` / `chartSemantic` over ad-hoc hex.
- Every major stats surface should eventually own a **unique** visualization (pattern started: Stat Detective divergence, Players board shape, Ask leaderboard bars).

### 2.4 Copy voice

- Plain questions over jargon where possible (“Who’s heating up?”).
- Honesty lines near models (“Describes how they’re used — not how good they are”).
- Prefer avoiding em dashes in user-facing copy when practical.
- Capability states: `supported | partial | unavailable | empty` — never conflate 0 with unavailable.

---

## 3. Complete site map (functions)

### 3.1 Primary navigation (`src/components/sports/site-nav.ts`)

| Nav | Hub | Children |
| --- | --- | --- |
| Home | `/` | — |
| Games | `/scores` | Scores, week schedule, Explore games |
| Players | `/explore/players` | Board, Stat Detective, Visualizations |
| Teams | `/explore/teams` | Board, Trade, Standings, Bracket, Tracker |
| Compare | `/compare` | — |
| Sentiment | `/sentiment` | League board, overrated watch |
| Transactions | `/offseason` | Offseason, Movement Center |
| Learn | `/learn` | — |
| Ask DRBL | `/ask` | (prominent) |
| History | `/history` | Time Machine |

**Outside primary nav:** `/awards`, `/dashboard`, `/gm/*`, `/franchises`, `/internal/*`.

---

### 3.2 Home `/`

**Function:** League desk — interesting recent information first.

| Block | Role |
| --- | --- |
| Week calendar | Schedule context |
| Standings panel | Conference snapshot |
| Top performers | Impact / counting highlights |
| Sentiment movers | Perception shifts |
| Stat Detective teaser | Hot/cold PPG windows |
| Findings | Baked recent insights cards |
| Offseason pulse | Transaction pulse |
| Watchlist | User-local interest |
| News desk | Analytics/NBA RSS |

---

### 3.3 Games

| Route | Function |
| --- | --- |
| `/scores` | Live / upcoming scores + schedule views |
| `/explore/games` | Historical/season game board + scoring scatter |
| `/games/[gameId]` | Game destination: identity, box, Game Lab, PBP, possession explorer |

**Game Lab** combines official box aggregates with reconstructed possessions when capability allows (`src/pbp/capability.ts`). Official totals ≠ reconstructed row counts.

---

### 3.4 Players

| Route | Function |
| --- | --- |
| `/explore/players` | Season leaderboard table + **board shape** (USG × PPG) |
| `/explore/players/windows` | **Stat Detective** — scoring vs own baseline |
| `/explore/players/visualizations` | Race tracker, league scatters, usage×efficiency |
| `/explore/players/race` | Redirect → visualizations `?view=race` |
| `/players/[playerId]` | Full player destination (tabs + islands) |
| `…/season-compare` | Two seasons side-by-side |
| `…/season-rank` | Rank a player’s own seasons |

**Player overview islands (typical):**

1. Identity — portrait, team/position, **scout role phrase**, vitals, draft, accolades, schedule, contracts  
2. Percentile ranking (hero) — teaser → Similar  
3. Career board / analysis  
4. Season statistics  
5. Historical career surface (when present)  
6. **Similar players** (profile + metric comps, historical profiles)  
7. Other tabs: games, shooting, splits, advanced, highs, sentiment  

**Offseason split:** roster/chrome = current ESPN team; counting stats / percentiles / similar / role = `statsSeason` (often prior year until tip-off).

---

### 3.5 Teams

| Route | Function |
| --- | --- |
| `/explore/teams` | Team season board |
| `/explore/teams/trade` | Two-team trade sketch + salary-fit suggestions |
| `/teams/[teamId]` | Team destination (overview → FO → history, etc.) |
| `…/payroll` | Payroll presentation |
| `…/draft-assets` | Draft capital view |
| `…/vs/[oppId]` | Franchise matchup history |
| `/franchises` | All-time franchise table |
| `/franchises/[id]` | Redirect → team History |

---

### 3.6 Standings / bracket

| Route | Function |
| --- | --- |
| `/standings` | Conference tables |
| `/standings/tracker` | Trajectory charts |
| `/explore/bracket` | Playoff bracket model |

---

### 3.7 Compare `/compare`

Player or team season compare / team season rank. Metric-rich; visualization pass still thin relative to Detective/board.

---

### 3.8 Sentiment `/sentiment`

League perception board. Pilot / seed-backed snapshot. **Not** a performance rating.

---

### 3.9 Transactions

| Route | Function |
| --- | --- |
| `/offseason` | ESPN transaction timeline (REAL events) |
| `/movement` | Reported/rumored movement evidence (separate plane) |

Trade-tree genealogy UI is gated until structured ownership edges are trustworthy.

---

### 3.10 Ask DRBL `/ask`

Natural language or builder → interpret → AST → validate → execute.

Statuses: `ok | partial | ambiguous | unsupported | invalid | no_result | insufficient_data`.

Leaderboard answers now include ranked bar charts when payload present.

---

### 3.11 History (Time Machine)

| Route | Function |
| --- | --- |
| `/history` | Landing + era controls |
| `/history/[season]` | Season slice with era-true branding |

`resolveHistoricalTeamBrand(teamId, season)` — never silently show modern logos for historical identities.

---

### 3.12 Awards

| Route | Function |
| --- | --- |
| `/awards` | Trophy index |
| `/awards/[slug]` | Award history boards |

Product polish + unique visualizations still below player/trade bar.

---

### 3.13 Learn

| Route | Function |
| --- | --- |
| `/learn` | Glossary index |
| `/learn/[slug]` | Stat guides / topics |
| `/learn/drbl` | What is DRBL |
| `/learn/drbl/war1` | WAR1 methodology |

---

### 3.14 Franchise Lab `/gm/*`

Simulation scaffold (roster, trade, cap, draft, FA, medical, staff, schedule, standings, game). **Not** live NBA truth. Own nav via `GmNav`.

---

### 3.15 Internal (noindex)

| Route | Function |
| --- | --- |
| `/internal/design-system` | Owner appearance lab |
| `/internal/sentiment` | Sentiment health iteration |
| `/internal/luka` | Frozen BRef profile experiment |
| `/internal/hof-player` | HOF presentation preview |

---

### 3.16 Secondary

| Route | Function |
| --- | --- |
| `/dashboard` | Contour-style multi-board lab (secondary) |

---

### 3.17 API surface (summary)

~30 handlers under `src/app/api/`: players (profile, seasons, games, percentiles, search, directory, board), games (box, PBP), stats, impact (DARKO/RAPTOR), scores, history product, search, news, GM league seed, cron warm-cache, runtime-policy, sentiment health, DRBL provenance.

Pages should prefer queries over client `fetch` to these except where intentional (percentile slider, live scores).

---

## 4. Proprietary & analytics systems

### 4.1 DRBL (Differential Replacement Basketball Level)

**Purpose:** Public-data player impact via Approach B residual attribution vs role-matched **R1** replacement — not optical tracking, not “DRBL beats DARKO.”

| Public label | Field | Meaning |
| --- | --- | --- |
| DRBL/100 | `drbl100` | Impact **rate** / 100 combined possession appearances |
| R1 Points | `r1Points` | Realized seasonal attribution |
| WAR1 | `r1WinEquivalents` | R1 Points ÷ frozen P1 (`37.490662671779255`) — **not** traditional WAR |
| DRBL O/D | `drblO` / `drblD` | Splits |
| DRBL-P / LN / B | diagnostics | **Do not sum** to DRBL/100 |

**Ability (production):** EB1600 shrink of raw ability (`drbl-ability-eb1600-r1-v1`).

**Seasons:** Registry **2020-21 → 2025-26** (`drbl/historical/season-registry.ts`). Pre-2020: unavailable.

**Key paths:** `drbl/` pipeline · `src/data/drbl/precomputed/` · CF `drbl-overlay-snapshot` · `drbl-loader.ts` · Learn `/learn/drbl`.

**Forbidden claims:** `src/query-engine/drbl-vocabulary.ts` (`FORBIDDEN_DRBL_CLAIMS`).

**Must not leak into:** player role phrases, sentiment, movement evidence, trade “legality.”

---

### 4.2 Percentiles, similar players, roles

| System | What it does | Impact inputs? |
| --- | --- | --- |
| Percentiles | Peer ranks per metric with own eligible universe | Yes for impact metrics; honesty on missing |
| Similar (profile) | Avg percentile gap across USG/TS/AST%/TRB% + optional DRBL O/D axes | Shape distance — not a new rating |
| Similar (metric) | Nearest on one selected metric | Per-metric |
| Historical profiles | Cross-era with `maxPerSeason` | Same axes; CF thin archive boards |
| **Roles** | Scout phrases from behavior + shot diet | **Never** DRBL/WAR/DARKO/RAPTOR |

**Role closed set:** Half-court engine · Secondary initiator · Volume scorer · Catch-and-shoot spacer · Cut/roll finisher · Post/paint big · Stretch big · Connector · (unclear).

Defense clause optional: disruption / paint protection — rates/hustle only.

---

### 4.3 Stat Detective

**What it is:** Who’s scoring way more or less than **their own** usual rate (PPG windows).

**What it is not:** General “find any interesting stat,” Synergy play-types, or impact movers.

| Window | Question |
| --- | --- |
| `last5` | Who’s heating up right now? |
| `last10` | Is the surge/slump sticking? |
| `split5` | Who just flipped? |

Floor: ~20 RS games, ≥18 MPG both sides; playoffs excluded. UI: steps + divergence chart + before/after bars.

Paths: `src/analytics/stat-detective-windows.ts` · bake script · `/explore/players/windows`.

---

### 4.4 Ask DRBL

Pipeline: NL → interpret → `BasketballQueryAst` → validate → execute → result.

Supports: player/team season stats, leaderboards, season compare/rank, career resume, limited game/offseason questions — per `docs/ask-drbl-coverage.md`.

Does **not** invent PBP filters, player ORtg as ASK metric when unsupported, or substitute blocked metrics.

---

### 4.5 Trade simulator + CBA salary matching

**Route:** `/explore/teams/trade`

| Layer | Honest claim |
| --- | --- |
| Roster | Current ESPN membership (FO sync) |
| Impact stats | Last completed DRBL/board season when current empty |
| Salary matching | Expanded / Standard / Room / 2nd apron **salary-fit only** |
| Package suggest | Salary-fit packaging — **not** full CBA legality |

**Never invent:** picks, TPEs, dead money, NTCs as free assets.

Paths: `trade-simulator.ts`, `trade-salary-matching.ts`, `trade-package-suggest.ts`, `docs/trade-builder-architecture.md`.

---

### 4.6 Front office / asset ledger / payroll

Disk: `data/asset-ledger/v1/`, `data/front-office/v1/` → runtime snapshots.

Presentation discloses incomplete cap sheet limits. Free-text ESPN ≠ structured ownership. Genealogy blocked until edges are real.

---

### 4.7 Impact overlays (DARKO / RAPTOR / BRef / hustle)

Season-true joins only. Never average DARKO+RAPTOR. Never stamp current DARKO onto other seasons. RAPTOR ends ~2021-22. Hustle from ~2015-16.

CF bake: `impact-overlay-snapshot`, `bref-advanced-snapshot`, `hustle-overlay-snapshot`.

---

### 4.8 PBP / possessions / Game Lab

On-demand + optional bulk corpus. Capability object discloses raw PBP / timeline / derived possessions / lineup research status. Calibration docs: `docs/architecture/possession-calibration.md`.

---

### 4.9 Sentiment & Movement

| System | Answers | Must not |
| --- | --- | --- |
| Sentiment | How talked-about / framed | Blend into DRBL rankings |
| Movement | Strength of reporting that something *may* happen | Assert rumor as transaction fact |

Snapshots: `sentiment-snapshot`, `movement-snapshot` (pilot/partial).

---

### 4.10 Time Machine / historical branding

Era-true names, palettes, verified marks when present. Capability matrix in `src/lib/history/capabilities.ts` (roughly 1996-97→present field coverage; DRBL only where registry says so).

---

### 4.11 Identity (ESPN ↔ NBA)

`player-identity.ts` + production-approved aliases only for silent DRBL joins. Loose name match is not a production join path.

Unresolved identity → blank DRBL columns on ESPN pages even if NBA-id artifact exists.

---

## 5. Design system inventory (paths)

| Concern | Path |
| --- | --- |
| Foundation doc | `docs/design-foundation.md` |
| Tokens | `src/styles/drbl-tokens.css` |
| Global theme/type | `src/app/globals.css` |
| TS helpers | `src/lib/design-system.ts` |
| Glass | `src/components/brand/glass-surface.tsx` |
| Atmosphere | `src/components/brand/page-atmosphere.tsx` |
| Frost float / tooltips | `frost-floating-surface.tsx`, `frost-recharts-tooltip.tsx` |
| Shell / nav | `sports-shell.tsx`, `site-nav.ts` |
| Continuity | `src/components/continuity/*` |
| Era theme | `src/themes/era-theme.ts`, `era-theme-scope.tsx` |
| HOF | `src/lib/hall-of-fame-style.ts` |
| Owner theme | `theme-provider.tsx`, `owner-theme.ts` |
| Internal lab | `/internal/design-system` |

---

## 6. Data truth rules (condensed)

From `docs/data-architecture.md` — non-negotiable:

1. Missing ≠ zero  
2. Never fabricate stats for UI convenience  
3. Derived stats need valid inputs  
4. Label approximate/derived  
5. Season-true historical stats only  
6. Impact needs verified season provenance  
7. Provider IDs stay at boundaries  
8. Production never silently uses sample data  
9. Free-text transactions ≠ structured ownership  
10. Unsupported ASK stays unsupported  
11. Movement ≠ transaction ≠ sentiment ≠ DRBL  

**Also:** roles/archetypes are behavior metadata only; no inventing picks/TPEs/watch URLs/logos.

---

## 7. Runtime bake & deploy

Cloudflare Workers cannot rely on `node:fs` at request time for product data. Deploy/`preview` bake chain (order approximate from `package.json`):

game → bref → **drbl-overlay** → impact → hustle → awards → roster → FO sync → bio/draft/tx → asset ledger → FO snapshot → movement → team board → standings → sentiment → shots → game logs → recent insights → PBP → CF assets → OpenNext build → deploy → verify.

Local full artifacts: `data/`, `src/data/drbl/precomputed/`.  
CF reads slim `src/data/runtime/*`.

**Edge policy:** `FULL_EDGE_PRODUCT=1` on Workers; `preferBundledProductDataOnEdge` uses thin peer fan-out (prior + EDGE historical seasons) so similar/historical comps are not empty.

---

## 8. Recent shipping context (this workbook’s era)

Through mid/late Sep 2026 Cloudflare product pushes included:

- Trade sim UX + salary-fit suggestions + left/right sides  
- Offseason roster team assignment (ESPN FO)  
- Trade impact stats-season fallback  
- First-class Similar players + historical profiles + CF peer-board fix  
- Scout-phrase player roles on identity  
- Similar players moved below career/stats on overview  
- Stat Detective clarity + divergence chart  
- Board shape scatter + Ask leaderboard bars  

---

## 9. Next steps (prioritized)

### Tier A — Highest leverage (do next)

| # | Item | Why |
| --- | --- | --- |
| A1 | **Unique visualizations pass** — Compare radar + bar fix, Awards dynasty, Standings DIFF, Trade impact bars | **Shipped** in A1 viz batch |
| A2 | **Awards product polish** | **Shipped** — grouped trophy case, decade filters, sibling nav, dynasty links, chip↔trophy parity, browse/nav discoverability |
| A3 | **Time Machine discovery polish** | Era branding works; landing/storytelling still thin vs destinations |
| A4 | **Stat Detective v2 metrics** | Still PPG-only; add TS / rebound / impact windows carefully with same honesty |

### Tier B — Structural depth

| # | Item | Why |
| --- | --- | --- |
| B1 | Structured trade genealogy (ledger-proven edges only) | Unlocks Trade Tree without inventing assets |
| B2 | Ask result viz for compare/rank payloads | Leaderboards done; other ops still text-first |
| B3 | Player Ask entry points re-enabled | `PlayerAskLinks` currently stubbed null |
| B4 | Movement Center real ingest (licensed) | M0 shell; no fake production scores |
| B5 | Sentiment beyond pilot seeds | Keep separated from performance |

### Tier C — Research / hard

| # | Item | Why |
| --- | --- | --- |
| C1 | Lineup Lab (needs lineup minutes source) | Blocked on data |
| C2 | Full CBA validateTrade | Beyond salary-fit sketches |
| C3 | Broader DRBL seasons / Approach A | Research pipeline — don’t dilute product claims |
| C4 | Franchise Lab → real product | Keep sim truth-separated until intentional |

### Tier D — Hygiene

| # | Item |
| --- | --- |
| D1 | Refresh `docs/PRODUCT_ROADMAP.md` status table (many “Missing” rows are shipped) |
| D2 | Wire Stat Detective bake into `npm` deploy scripts if not already |
| D3 | Fix lingering CF verify flake (`player race pin search`) |
| D4 | Keep this workbook updated when major surfaces ship |

### Suggested immediate sequence

1. **Time Machine landing** (A3)  
2. **Stat Detective multi-metric** (A4)  

---

## 10. Quick path index

| Need | Start |
| --- | --- |
| DRBL math | `drbl/PLAN.md`, `drbl/historical/season-registry.ts` |
| Roles | `src/lib/player-role.ts` |
| Similar / percentiles | `player-stat-comps.ts`, `player-percentile-load.ts` |
| Stat Detective | `src/analytics/stat-detective-windows.ts` |
| Ask | `src/query-engine/`, `/ask` |
| Trade / CBA fit | `trade-simulator.ts`, `trade-salary-matching.ts` |
| Front office | `data/front-office/v1`, `data/asset-ledger/v1` |
| Impact overlays | `docs/historical-impact.md` |
| PBP / Game Lab | `getGamePossessions`, `src/pbp/capability.ts` |
| Sentiment / Movement | `docs/architecture/sentiment.md`, `movement-center.md` |
| Time Machine | `historical-team-brand.ts`, `/history` |
| Design | `docs/design-foundation.md` |
| Truth | `docs/data-architecture.md` |
| Deploy | `package.json` → `deploy` |

---

## 11. Document control

| Field | Value |
| --- | --- |
| Created | 2026-09-20 |
| Authors | Site audit from live `src/app`, `src/lib`, `drbl/`, `docs/`, recent CF shipping |
| Supersedes for “current whole-site map” | Partial overlap with `WORKBOOK.md` + stale rows in `PRODUCT_ROADMAP.md` |
| Update trigger | Any new primary nav surface, proprietary claim change, or deploy-chain change |

*End of Site Master Workbook v3.*
