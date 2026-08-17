# 00A — Design reference diff (P17.2)

**Current branch:** `product/drbl-site-completeness-v1_2`  
**Design reference:** `C:\Users\parkh\Projects\basketball-analytics-design-ref` @ `7e764ceb5c834a19696dad84ed6696e7e3289a6a` (`origin/drbl-ia-and-ask`)

**Rules applied:** Design/presentation = reference. Analytics/data/identity/routing = current. No wholesale UI checkout. No invented design. No stale DARKO-first / old WAR / pre-DRBL resurrection. Fix only `UNINTENTIONAL_DESIGN_DRIFT`. Keep P17.2 identity repairs (NBA→canonical team, game route lookup, `providerTeamId` fields).

---

## Classification legend

| Class | Meaning |
|---|---|
| `IDENTICAL` | Byte-identical vs design reference |
| `INTENTIONAL_SEMANTIC` | DRBL/product/identity wiring; presentation shell preserved |
| `UNINTENTIONAL_DESIGN_DRIFT` | Presentation drifted while fixing identity/routing — must repair |
| `REF_MISSING_CUR_ADDED` | Surface exists only on current (product completeness addition) |

---

## Explore Players — `player-season-table.tsx`

| | |
|---|---|
| **Reference path** | `design-ref/src/components/explore/player-season-table.tsx` |
| **Current path** | `integration/src/components/explore/player-season-table.tsx` |
| **Structural diffs** | +`hasDrbl` + DRBL/100 / R1 Points / R1 Win Equivalents columns; multi-team/TOT/2TM–4TM branch (no logo, label `TOT`/`Multiple`); digit-id label guard (`—`); `formatOptionalDrbl` |
| **Design decisions to preserve** | Compact `PlayerIdentity` + headshot badge logo; TM cell `inline-flex gap-1` + `TeamLogo xs` + `text-[11px] font-semibold uppercase tracking-wide`; sports-card table chrome; sortable heads |
| **Semantic additions to keep** | DRBL columns; multi-team policy; no raw `16106127xx` in TM; canonical `teamId` for logos |
| **Classification** | `INTENTIONAL_SEMANTIC` (TM composition matches reference for single-team rows) |

---

## Player destination identity — `player-destination-identity.tsx`

| | |
|---|---|
| **Reference path** | `design-ref/src/components/players/player-destination-identity.tsx` |
| **Current path** | `integration/src/components/players/player-destination-identity.tsx` |
| **Structural diffs** | Destructure `teamName`; wrap `TeamLogo` in `TransitionLink` → `/teams/{teamKey}` with `aria-label` (mark composition otherwise identical) |
| **Design decisions to preserve** | `sports-card score-card-wash` header; headshot xl; season chip strip; bio/detail bit typography; historical mark vs modern logo branch |
| **Semantic additions to keep** | Canonical ESPN `teamKey`; `Team unavailable` via parent bio bits; team link `/teams/{espnId}` |
| **Classification** | `INTENTIONAL_SEMANTIC` after repair (removed gap/sr-only wrapper drift) |

**Repair:** Restored reference mark composition (logo-only child) while keeping `/teams/{espnId}` link + `teamName` aria-label.

---

## Player page — `players/[playerId]/page.tsx`

| | |
|---|---|
| **Reference path** | `design-ref/src/app/players/[playerId]/page.tsx` |
| **Current path** | `integration/src/app/players/[playerId]/page.tsx` |
| **Structural diffs** | Multi-team / numeric-NBA `teamKey` gating; `teamLabel` (`TOT`/`Multiple`/`Team unavailable`); pass `teamName` into identity |
| **Design decisions to preserve** | Progressive destination shell; identity outside Suspense; season chip routing |
| **Semantic additions to keep** | Never pass raw NBA Stats ids as `teamKey`; unavailable label |
| **Classification** | `INTENTIONAL_SEMANTIC` |

---

## Player core island — `player-core-island.tsx`

| | |
|---|---|
| **Reference path** | `design-ref/src/components/players/player-core-island.tsx` |
| **Current path** | `integration/src/components/players/player-core-island.tsx` |
| **Structural diffs** | DRBL Snapshot card; identity resolve for peer merge; headline prefers `drbl100` |
| **Design decisions to preserve** | Island layout, resume bits, disclosure chrome, sports-card spacing |
| **Semantic additions to keep** | DRBL-primary snapshot; empty reasons UNSUPPORTED / IDENTITY_UNRESOLVED / MISSING |
| **Classification** | `INTENTIONAL_SEMANTIC` |

---

## Game page + identity shell

| Surface | Ref | Current | Diff | Classification |
|---|---|---|---|---|
| `app/games/[gameId]/page.tsx` | yes | yes | **IDENTICAL** | `IDENTICAL` |
| `components/games/game-identity-shell.tsx` | yes | yes | **IDENTICAL** | `IDENTICAL` |
| `components/games/game-lab-view.tsx` | yes | yes | **IDENTICAL** | `IDENTICAL` |

| | |
|---|---|
| **Design decisions to preserve** | Full game identity shell / score wash / lab view composition |
| **Semantic additions to keep** | Corrected game-id lookup / link contract (data layer; UI unchanged) |
| **Notes** | No presentation drift from routing fix |

---

## TeamLogo — `team-logo.tsx`

| | |
|---|---|
| **Reference path** | `design-ref/src/components/brand/team-logo.tsx` |
| **Current path** | `integration/src/components/brand/team-logo.tsx` |
| **Structural diffs** | Digit-guard on `markAbbr` only (`/^\d{6,}$/` → avoid `"161"` badge); markup/classes/`Image` fallback spans unchanged |
| **Design decisions to preserve** | Size scale, historical text mark palette path, secondary fallback span classes |
| **Semantic additions to keep** | Provider-numeric digit guard |
| **Classification** | `INTENTIONAL_SEMANTIC` (visual language preserved) |

---

## Home

| Surface | Ref | Current | Classification |
|---|---|---|---|
| `app/page.tsx` | yes | yes | `INTENTIONAL_SEMANTIC` (+`drblLeaders` / overlay props into right rail) |
| `home/findings-section.tsx` | yes | yes | `INTENTIONAL_SEMANTIC` (copy mentions DRBL ability) |
| `home/top-performers-panel.tsx` | yes | yes | `INTENTIONAL_SEMANTIC` (DRBL column + default sort when overlay ok) |
| Other home sections (calendar, standings, pulse, watchlist, …) | yes | yes | `IDENTICAL` |
| `home/home-game-list.tsx` | no | yes | `REF_MISSING_CUR_ADDED` (supporting; not first-viewport redesign) |

| | |
|---|---|
| **Design decisions to preserve** | Home composition: calendar + findings + standings/top performers rails; sports-card language |
| **Semantic additions to keep** | DRBL leaders / primary sort when overlay healthy — do **not** resurrect DARKO-first default when DRBL available |

---

## Explore Players page / shell

| Surface | Ref | Current | Classification |
|---|---|---|---|
| `app/explore/players/page.tsx` | yes | yes | `INTENTIONAL_SEMANTIC` (`DrblSeasonSupportNotice`, registry blurb, `hasDrbl`) |
| `explore-players-client-shell.tsx` | yes | yes | `IDENTICAL` |
| `player-board-health-banner.tsx` | yes | yes | `INTENTIONAL_SEMANTIC` (live board ≠ DRBL overlay copy) |
| `drbl-season-support-notice.tsx` | no | yes | `REF_MISSING_CUR_ADDED` |

| | |
|---|---|
| **Design decisions to preserve** | Leaderboard H1, filter shell, table card |
| **Semantic additions to keep** | DRBL registry notice + columns |

---

## Teams (Explore team board)

| Surface | Ref | Current | Classification |
|---|---|---|---|
| `team-season-table.tsx` | yes | yes | Was `UNINTENTIONAL_DESIGN_DRIFT` → **repaired to `IDENTICAL`** |
| `app/teams/[teamId]/page.tsx` | yes | yes | `IDENTICAL` |

| | |
|---|---|
| **Design decisions to preserve** | Team cell: `TeamLogo` + single-line abbreviation; sticky left column; inset brand bar |
| **Semantic additions to keep** | Route `href=/teams/{teamId}` (canonical product id from row) |
| **Repair** | Removed stacked fullName/abbr presentation and `resolveCanonicalTeam` display IIFE; restored reference logo+abbr |

---

## Compare

| Surface | Ref | Current | Classification |
|---|---|---|---|
| `app/compare/page.tsx` | yes | yes | `INTENTIONAL_SEMANTIC` (DRBL field merge into season rows) |
| `player-compare-view.tsx` | yes | yes | `INTENTIONAL_SEMANTIC` (dimension groups: rate_ability / realized_value / external / box) |

| | |
|---|---|
| **Design decisions to preserve** | Compare sports-card sections; dimension row chrome |
| **Semantic additions to keep** | DRBL dimension grouping + fields |

---

## ASK

| Surface | Ref | Current | Classification |
|---|---|---|---|
| `app/ask/page.tsx` | yes | yes | `IDENTICAL` |
| `ask-drbl-view.tsx` | yes | yes | `IDENTICAL` |
| `ask-builder-form.tsx` | yes | yes | `IDENTICAL` (assumed present both trees) |

| | |
|---|---|
| **Design decisions to preserve** | ASK DRBL builder / results IA from redesign |
| **Semantic additions to keep** | Query-engine DRBL vocabulary (non-UI) |

---

## Learn

| Surface | Ref | Current | Classification |
|---|---|---|---|
| `app/learn/page.tsx` | yes | yes | `IDENTICAL` |
| `app/learn/[slug]/page.tsx` | yes | yes | `IDENTICAL` |
| `app/learn/drbl/page.tsx` | no | yes | `REF_MISSING_CUR_ADDED` (DRBL learn destination; product completeness) |

| | |
|---|---|
| **Design decisions to preserve** | Learn index / slug article chrome |
| **Semantic additions to keep** | `/learn/drbl` explainer linked from player core |

---

## Summary counts (pre-repair → post-repair)

| Class | Pre | Post |
|---|---:|---:|
| `UNINTENTIONAL_DESIGN_DRIFT` | 2 | **0** |
| Surfaces repaired | — | 2 (`team-season-table.tsx`, `player-destination-identity.tsx`) |

Pre-repair drifts:

1. **Teams table** — fullName stacked cell vs reference abbr-only.
2. **Player destination** — link wrapper introduced `gap-1.5` + `sr-only` span altering mark composition.

---

## DESIGN_INTENT_PRESERVED

**YES** — after surgical repairs; remaining deltas are intentional DRBL/identity/routing semantics only.
