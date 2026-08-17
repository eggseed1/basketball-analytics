# DRBL Project Workbook v1 — Master Document

**Status:** READ-ONLY forensic snapshot  
**Branch:** `integration/analytics-web`  
**Integration commit:** `28827fbdfb6509756b35284f80c27bafac1f356c`  
**HEAD (docs seal):** `64cc231a215c579f3498e6122a0230f7388971cc`  
**Workbook freeze:** see `00_PROJECT_FREEZE.json`  
**Semantics changed by workbook:** **NO**

Evidence classes used below:

| Tag | Meaning |
|---|---|
| **ESTABLISHED** | Sealed / production contract; do not reopen casually |
| **DIAGNOSTIC** | Useful for inspection; not ranking/canonical |
| **EXPERIMENTAL** | Research sidecar; not public product truth |
| **HYPOTHESIS** | Plausible claim not sealed as true |
| **UNRESOLVED** | Open question or blocked work |

---

## 1. Executive overview

This package documents the **merged analytics + web-design** state of the DRBL basketball analytics project after a successful integration on `integration/analytics-web`.

**ESTABLISHED (integration):**

- Model semantics preserved (`k=1600`, `P1=37.490662671779255`, ability `drbl-ability-eb1600-r1-v1`)
- Web design intent preserved (ASK DRBL IA, progressive destinations, explore resilience)
- Production precomputed artifacts byte-equal to analytics premerge for `2024-25` / `2025-26` (0 mismatches)
- Historical Tier-B seasons `2020-21`…`2023-24` likewise 0 mismatches vs analytics premerge
- DRBL tests **201/201 PASS**, typecheck **PASS**, build **PASS**
- Integration seal: `7616954121ce6263018a364d205aa10681ac95cfca89fa2a489fd15dfd692e15`
- `INTEGRATION_READY_FOR_RESEARCH = YES`

**ESTABLISHED (research lineage, selected seals):**

- M16j point-estimate reserved: **STRONG_PASS** (`84f4eadc…`)
- M16l2 reserved R1 value: **STRONG_PASS** (`dc556c35…`)
- M16l3 product cutover: **CUTOVER_COMPLETE** (`48a9d39e…`)
- M17a.2 historical corpus: **PARTIAL_HISTORICAL_BACKFILL_COMPLETE** (`60ef9954…`); Tier A = **NONE**; Tier B = 2020-21…2023-24
- M17b multi-season temporal: **STRONG_MULTI_SEASON_PASS** (`b606cf60…`)
- M18a UIR reserved: **STRONG_PASS**; UIR = **PERSISTENT_PLAYER_RESIDUAL_ESTABLISHED**; off-ball = **NO** (`ba98a652…`)
- M18b.0 tracking readiness: **T3** / **POSSIBLE_REQUIRES_USER_ACCESS** (`ade47897…`)

**NOT STARTED (do not invent progress):**

- **M17c** external common-target benchmark — **NOT_STARTED** (authorized, not executed)
- **M18b** tracking off-ball identification — **NOT_STARTED** beyond readiness (M18b.0)

**PRODUCT / DATA-INTEGRATION DEBT (not model failures):**

1. ESPN ↔ NBA player-ID join may leave live DRBL columns empty until identity mapping succeeds  
2. Live team-evidence fixture schedule/sample miss (`test:drbl-release:fixture` / team-identity)

---

## 2. What DRBL is

**Plain English (basketball-literate, nontechnical):**

DRBL (**Differential Replacement Basketball Level**) is a player-impact framework built around **sequential possession attribution**. Instead of only assigning team wins or box-score totals to players, it tries to locate where value appears **within possessions** relative to a contextual, role-matched reference called **R1**.

Three distinct public numbers:

1. **DRBL/100** — ability / rate estimate (posterior impact per 100 combined possession appearances)  
2. **R1 Points** — realized accumulated attribution over actual season exposure  
3. **R1 Win Equivalents** — R1 Points divided by a frozen points-per-win factor (**P1**)

**What DRBL does NOT currently establish:**

- causal player value under full counterfactual roster swaps (**Approach A** not shipped)  
- complete optical off-ball value (**OFFBALL_VALUE_ESTABLISHED = NO**)  
- conventional fringe-replacement WAR  
- calibrated individual predictive uncertainty intervals  
- superiority over every competing public metric

Classification: core production metrics **ESTABLISHED**; causal/off-ball/WAR claims **NOT ESTABLISHED**.

---

## 3. What the website is

A Next.js App Router product that surfaces live NBA boards (primarily ESPN-backed on Vercel), DRBL overlays from precomputed season artifacts, progressive player/team destinations, ASK DRBL, Learn/History/Time Machine IA, and a GM sandbox.

Primary nav authority: `src/components/sports/site-nav.ts` (`PRIMARY_NAV`).

Canonical DRBL education surface: `/learn/drbl`.

---

## 4. What problem DRBL is trying to solve

Estimate **player impact versus a contextual role-matched baseline** using possession reconstruction and Approach-B residual attribution, then publish:

- a shrunk **ability rate** suitable for ranking (`validatedDRBL100` → `drbl100`)  
- a **realized accounting** total (`r1Points`) and win-equivalent display (`r1WinEquivalents`)

without claiming exhaustive team-scoreboard allocation or optical off-ball completeness.

---

## 5. Current canonical metrics

| Display | Field | Status |
|---|---|---|
| DRBL/100 | `drbl100` (= `validatedDRBL100`) | **CANONICAL / ESTABLISHED** |
| R1 Points | `r1Points` | **CANONICAL / ESTABLISHED** |
| R1 Win Equivalents | `r1WinEquivalents` | **CANONICAL / ESTABLISHED** |

Formulas (frozen):

```text
rawAbilityRate_i = 100 * ApproachBAttributedValue_i / N_i
validatedDRBL100_i = N_i / (N_i + 1600) * rawAbilityRate_i
drbl100 = validatedDRBL100
R1Points = ApproachBAttributedValue   # primitive
R1WinEq = R1Points / 37.490662671779255
```

`k=1600`, prior mean `0`, calibration **identity**. Ability version: `drbl-ability-eb1600-r1-v1`.

Canonical rank: descending **unrounded** `drbl100`.

---

## 6. Current diagnostic metrics

Public/API fields that are **not** canonical ranking keys:

| Display | Field | Class |
|---|---|---|
| DRBL-P | `drblP` | DIAGNOSTIC component |
| DRBL-LN | `drblLn` | DIAGNOSTIC (adjusted association) |
| DRBL-B | `drblB` | DIAGNOSTIC behavioral |
| DRBL-O / DRBL-D | `drblO` / `drblD` | DIAGNOSTIC halves of P |
| DRBL-L | `drblL` | DIAGNOSTIC leverage; never added into R1 |
| DRBL Δ | `drblDisagreement` | DIAGNOSTIC disagreement index |
| SDV / shot-making | `sdv100`, `shotMaking100` | DIAGNOSTIC |
| DRBL ± / intervals | `drblUncertainty`, `drblIntervalLo/Hi` | **LEGACY DIAGNOSTIC ONLY** — not calibrated CI |

---

## 7. Current research-only metrics

| Metric | Status |
|---|---|
| UIR / UIR-C | **EXPERIMENTAL** research sidecar; `UIR_PUBLIC_CANONICAL = NO` |
| Lineup impact m18 (`m18-lineup-impact-v1`) | EXPERIMENTAL |
| Tracking / off-ball OBV | **NOT ESTABLISHED**; M18b not started |

UIR status after M18a: **PERSISTENT_PLAYER_RESIDUAL_ESTABLISHED**.  
Off-ball value: **NO**.

---

## 8. Retired / deprecated metrics

**RETIRED / NEVER REINTRODUCE** (see also § in `02_CANONICAL_METRIC_CONTRACT.md`):

- +200 prior pseudo-possessions counted as exposure  
- N/2 cumulative exposure rules  
- 5.835 / 2.918 historical ability scalings  
- `/30` provisional WAR conversion  
- double empirical-Bayes layers  
- legacy P/LN/B fusion as published ability  
- legacy uncertainty interval as calibrated CI  
- public plain WAR / `drblWar` as canonical cumulative value (`LEGACY_WAR_PUBLIC = NO`; field may remain for storage compatibility as **DEPRECATED_NONCANONICAL**)

---

## 9. Approach-B possession attribution

**ESTABLISHED implementation path** (not Approach A simulation):

```text
raw PBP → normalized events → lineup state → possessions
→ EPV(S) from pre-possession state
→ contextual R1 V0 (role-matched residual on EP)
→ realized possession result → residual Δ
→ sequential attribution (creation / connection / conversion / execution / …)
→ offensive/defensive player accumulation
→ unassigned residual retained
```

Primary sources: `drbl/models/player-value.ts`, `sequential-attribution.ts`, `replacement.ts`, `expected-points.ts`, `compute-season.ts`.

Detail: `03_APPROACH_B_AND_ATTRIBUTION.md`.

---

## 10. R1 semantics

**Classification:** `ROLE_MATCHED_REFERENCE_BASELINE` — **not** conventional NBA fringe replacement.

Construction (`drbl/models/replacement.ts`):

- Candidates frozen by `asOfDate` / cutoff (no future leakage)  
- Role vector: usage, threeRate, starterRate, minutesPerGame  
- Prefer MPG roughly 8–32  
- k-nearest role match (default **k=8**)  
- Approach B replacement EP = context EP + clamped role-matched residual  

Zero on rate metrics: average vs this R1 residual baseline (zero semantics `r1_replacement`), **not** “worthless player.”

---

## 11. Ability vs realized value

| Concept | Meaning | Public field |
|---|---|---|
| **ABILITY** | Posterior impact rate /100 appearances | `drbl100` |
| **REALIZED VALUE** | Accumulated Approach-B attribution | `r1Points` |
| **FORECAST** | Future impact with expected exposure | **NOT a published canonical product metric** |

Do not infer ability from R1 Points alone; high cumulative value can reflect exposure.

---

## 12. Historical data system

- Normalization: `historical-pbp-normalized-v1`  
- Support contract: `historical-support-contract-v2`  
- Tier A seasons: **NONE**  
- Tier B (published retrospective frozen v1): **2020-21…2023-24**  
- Tier C/D archive classification exists in M17a.2 seal (pre-2020-21 not product-supported)  
- Season registry **single source**: `drbl/historical/season-registry.ts` (bridged via `src/data/drbl/season-registry.ts`)  
- Career cumulative R1 / all-time DRBL ranking: **NOT public**  

See `07_HISTORICAL_DATA_COVERAGE.md`, `08_SEASON_REGISTRY.csv`.

---

## 13. Research lineage

Abbreviated sealed chain (hashes in freeze JSON):

```text
M16j point estimate freeze → reserved STRONG_PASS
→ M16l* R1 value / product cutover
→ M17a.1 raw import → M17a.2 historical corpus + support tiers
→ M17b multi-season temporal STRONG_MULTI_SEASON_PASS
→ M18a UIR reserved STRONG_PASS (persistent residual; not off-ball)
→ M18b.0 tracking readiness (access required)
→ analytics+web integration seal
```

**M17c / M18b full:** not started. Timeline: `05_RESEARCH_TIMELINE.md`.

---

## 14. Validation evidence

| Gate | Result | Evidence class |
|---|---|---|
| M16j reserved point | STRONG_PASS | ESTABLISHED (consumed reserved) |
| M16l2 reserved value | STRONG_PASS | ESTABLISHED (2025-26 reserved consumed once) |
| M17b season→next / early-late | STRONG_MULTI_SEASON_PASS | ESTABLISHED on Tier B |
| M18a validation→reserved UIR | STRONG_PASS | ESTABLISHED for residual; off-ball NO |
| Integration production/historical regression | 0 mismatches | ESTABLISHED vs `72272b2` |
| M17c external benchmarks | — | **NOT_STARTED** |
| Off-ball tracking validation | — | **NOT_STARTED** / access blocked |

Detail: `06_VALIDATION_EVIDENCE.md`.

---

## 15. Current website architecture

- App Router pages under `src/app/**`  
- Sports IA: Home, ASK DRBL, Games, Players, Teams, Compare, Transactions, Learn, History  
- Explore players board + `DrblSeasonSupportNotice`  
- Progressive player/team destination shells  
- Soft-fail scoreboard / catalog resilience  
- Time Machine / franchise history  

See `11_WEBSITE_INFORMATION_ARCHITECTURE.md`, `12_ROUTE_MANIFEST.csv`.

---

## 16. Current data / API architecture

- Provider selection (`src/data/providers/index.ts`): NBA/ESPN path on Vercel  
- DRBL overlay via `fetchDrblSeason` / precomputed JSON under `src/data/drbl/precomputed/`  
- Player season contract: `src/data/types/player-season.ts`  
- Missing R1 fields stay **null** (never coerce to 0)  
- Optional DARKO/LEBRON overlays are **not** DRBL substitutes  

See `16_API_AND_DATA_CONTRACT.md`.

---

## 17. Current merged design system

Apple Sports–inspired light tokens in `src/app/globals.css` (background `#f2f2f7`, ring/chart blue `#0071e3`, etc.), Tailwind v4 + shadcn, sports-card explore language. Analytics Savant-heavy player composition partially superseded by web progressive islands; DRBL semantics remain via overlay + Learn.

See `14_DESIGN_SYSTEM.md`. Screenshots: `15_SCREENSHOT_INDEX.md` (**SCREENSHOTS_NOT_AVAILABLE**).

---

## 18. Engineering architecture

```text
drbl/                 model, historical, research, tests
src/app/              Next.js routes
src/data/             providers, transformers, queries, DRBL bridge
src/components/       UI / IA
scripts/drbl-m*.ts    milestone runners (research seals)
reports/              seals, audits, this workbook
```

Integration hybrid ownership: analytics owns metric meaning/seals; web owns IA/ASK/resilience; ~12 files manually reconciled.

---

## 19. Known limitations

- Approach B ≠ full counterfactual Approach A  
- Attribution nonexhaustive (baseline + unassigned residual remain)  
- P1 era robustness **NOT_ESTABLISHED**  
- Historical cross-era comparability not fully established; ranks within-season  
- No Tier A seasons  
- Predictive uncertainty unresolved  
- UIR ≠ off-ball  
- Live ESPN↔NBA identity debt  
- Tracking access required for M18b player-value validation  

See `26_KNOWN_LIMITATIONS_AND_OPEN_QUESTIONS.md`.

---

## 20. Known product / engineering debt

| Debt | Class | Notes |
|---|---|---|
| ESPN ↔ NBA player identity | PRODUCT_DATA_INTEGRATION_DEBT | Live DRBL columns may appear empty |
| Team-evidence live fixture miss | PRODUCT_DATA_INTEGRATION_DEBT | Environmental; not precomputed regression |
| Identity mapping for traded/multi-team | PRODUCT | Web identity layer retained; still fragile live |

Do not treat these as DRBL formula failures.

---

## 21. Current research blockers

1. **Tracking license / access** for modern T0/T1 frames overlapping UIR eras (M18b.0)  
2. **M17c not started** — external common-target benchmark still open  
3. No local full-frame tracking (`TRACKING_GAMES_AVAILABLE = 0`)  
4. SportVU 2015-16 public prototype has **zero overlap** with sealed UIR seasons  

---

## 22. Authorized next work

Authorized but **not executed** in this workbook:

| Milestone | Authorization | Status |
|---|---|---|
| M17c external common-target benchmark | YES (independent parallel branch) | **NOT_STARTED** |
| M18b method prototype (SportVU) | YES | **NOT_STARTED** |
| M18b player-value validation | NO until tracking access | Blocked |
| User tracking access step | Preferred next for M18b path | External |

Integration health next-milestone label remains `M17c_EXTERNAL_COMMON_TARGET_BENCHMARK` with `M17C_EXECUTED = NO`.

Roadmaps: `29_RESEARCH_ROADMAP.md`, `30_PRODUCT_ROADMAP.md`.

---

## 23. How another reviewer should safely continue

1. Read `36_REVIEWER_QUICKSTART.md` and `37_CRITICAL_FACTS_CHEATSHEET.md`  
2. Trust seals in `00_PROJECT_FREEZE.json` / `supporting_reports/` — **do not invent seals**  
3. Do **not** reopen DRBL v1 (`k`, P1, EPV, R1, ability version) without an explicit new milestone  
4. Do **not** publish UIR as canonical or relabel UIR as off-ball  
5. Do **not** start M17c or M18b from this workbook task; if starting later, use separate branches as authorized  
6. Prefer precomputed overlays for metric truth; treat live ESPN boards as product surface with known identity debt  
7. Critical source copies: `critical_source_snapshot/` (44 files)  

`PROJECT_SEMANTICS_CHANGED_BY_WORKBOOK = NO`.
