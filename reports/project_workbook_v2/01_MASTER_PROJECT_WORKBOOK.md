# DRBL Project Workbook v2 — Master (P17.1)

**Status:** Product-completeness review package  
**Branch:** `product/drbl-site-completeness-v1_1`  
**HEAD:** `64cc231a215c579f3498e6122a0230f7388971cc` (+ uncommitted P17/P17.1 product work)  
**Integration commit:** `28827fbdfb6509756b35284f80c27bafac1f356c`  
**Freeze:** `00_PROJECT_FREEZE.json`  
**Semantics changed by workbook:** **NO**

This workbook is the **entry package for P17 / P17.1**. Deep research lineage, metric math, and pre-P17 integration evidence live in **workbook v1** (`../project_workbook_v1/`). Use this file for deltas; use v1 for Approach B / seals / historical corpus depth.

---

## 1. What changed in P17

Product completeness pass after analytics+web integration (`28827fb`):

- Team identity forensics (ESPN canonical ids, modern 30/30 brands, historical text/palette with empty verified logos)
- First player identity crosswalk + alias file expansion (676 aliases)
- Player destination + explore DRBL overlay / Snapshot hierarchy
- Learn `/learn/drbl` pedagogy for public core metrics
- Honest debt log: join not 100%, historical logos empty

P17 seal package: `../product_completeness_v1/` (PARTIAL / earlier).

---

## 2. What changed in P17.1 (this package)

Repair + surface completion on `product/drbl-site-completeness-v1_1`:

| Area | Delta |
|---|---|
| Crosswalk | **v1.1** evidence classes; **619 productionApproved**; **UNIQUE_NAME_ONLY (57) not used at runtime** |
| Live join | Measured: NBA board **~98.8%** (`575/582`); ESPN estimated **~93.9%** |
| Home | DRBL-first TopPerformers hierarchy |
| ASK | DRBL vocabulary + grounded answers |
| Compare / season-compare / season-rank | DRBL columns; asymmetric Unavailable; ranks labeled distinctly |
| History | Season DRBL/100 leaders (registry seasons only); all-time intentionally unsupported |
| Dashboard | DRBL intentionally deferred |
| Firewall | K=1600, exact P1, precomputed EQUAL vs `28827fb`, research seals unchanged, **M17c NOT_STARTED** |

**Product seal:** `PASS_WITH_DEBT` — see `supporting_reports/product_completeness_v1_1/26_product_completion_seal.json`.

---

## 3. Numbers to trust (recorded from artifacts)

From `02_player_crosswalk_freeze.json`:

| Field | Value |
|---|---|
| version | `player-crosswalk-v1.1` |
| aliasCount | **676** |
| VERIFIED_MULTI_FIELD | 270 |
| HIGH_CONFIDENCE_MULTI_FIELD | 349 |
| UNIQUE_NAME_ONLY | 57 |
| productionApprovedCount | **619** |
| 1642935 (Hepburn) | UNRESOLVED (no invented alias) |

From `04_live_join_coverage.json` (2025-26):

| Path | Rows | Join |
|---|---|---|
| NBA id board | 582 | **575** valid DRBL → **0.987973** |
| ESPN board (estimated) | 578 | **543** via productionApproved → **0.939446** |

From `26_product_completion_seal.json` / `24_product_health.json`:

- static verified join: **0.920721** (2024-25), **0.944348** (2025-26)
- modern team identity complete **YES**; historical logo identity **NO**
- tests **201/201**, typecheck/build/data-truth/site-nav **PASS**

---

## 4. How to review (15 minutes)

1. `00_PROJECT_FREEZE.json` + `37_CRITICAL_FACTS_CHEATSHEET.md`
2. Identity: `TEAM_IDENTITY_AND_BRANDING.md`, `PLAYER_IDENTITY_AND_DRBL_JOIN.md`
3. Surfaces: `PLAYER_DRBL_PRODUCT_SURFACE.md`, `PUBLIC_METRIC_COVERAGE.md`
4. Evidence: `supporting_reports/product_completeness_v1_1/` (`02`, `04`, `09`, `23`, `25`, `26`)
5. Screenshots: `screenshots/` + `15_SCREENSHOT_INDEX.md`
6. Code: `critical_source_snapshot/` + `19_CRITICAL_SOURCE_MANIFEST.csv`
7. Research depth unchanged → `../project_workbook_v1/01_MASTER_PROJECT_WORKBOOK.md`

---

## 5. Still true from integration / research (pointer)

Unchanged vs workbook v1 / integration seal:

- Ability `drbl-ability-eb1600-r1-v1`; **K=1600**; **P1=37.490662671779255** (exact)
- Tier A = NONE; Tier B = 2020-21…2023-24; production 2024-25 / 2025-26
- M17b **STRONG_MULTI_SEASON_PASS**; M18a UIR persistent; off-ball **NO**
- **M17c = NOT_STARTED**; **M18b = NOT_STARTED** (M18b.0 readiness only)
- Integration seal hash `76169541…`; regression mismatches **0**

Copied still-accurate excerpts: `02_CANONICAL_METRIC_CONTRACT.md`, `03`–`04`, `06`–`08`, `24_PRODUCTION_INVARIANTS.md`, example records, selected seals under `supporting_reports/`.

---

## 6. Explicit non-claims

- Do **not** claim 100% ESPN↔NBA join
- Do **not** treat `UNIQUE_NAME_ONLY` as runtime production join
- Do **not** invent alias for `1642935`
- Do **not** treat empty historical logos as a model failure
- Do **not** start M17c from this workbook alone
- Do **not** reopen DRBL v1 math / change K or P1
