# 23 — Remaining debt (P17.1)

Honest open items after primary surface repair. None of these reopen DRBL math.

---

## Identity / join

| Debt | Status | Notes |
| --- | --- | --- |
| `UNIQUE_NAME_ONLY` aliases (57) | RETAINED_NOT_RUNTIME | Present in alias file; **rejected** for silent production joins |
| NBA id `1642935` Chucky Hepburn | UNRESOLVED | DRBL 2025-26 row; no ESPN byathlete unique-name hit; no invented alias |
| Production-approved static join | 92.1% / 94.4% | 2024-25 / 2025-26 verified rates (`03`, `07`); any-alias file presence is 100% / 99.8% |
| ESPN live board estimated join | ~93.9% | Measured estimate in `04_live_join_coverage.json` — not 100% |
| NBA id board live join | ~98.8% | `hasValidDrblEstimate` 575/582 |

## Branding

| Debt | Status | Notes |
| --- | --- | --- |
| Historical verified logos | EMPTY intentional | `HISTORICAL_LOGO_IDENTITY_COMPLETE=NO` |
| Provider team namespace gaps | CARRY_FORWARD | Canonical ESPN id preserved; residual namespace matrix debt from P17 |

## Product surfaces

| Debt | Status | Notes |
| --- | --- | --- |
| Dashboard DRBL | INTENTIONALLY_DEFERRED | Secondary lab / Contour — do not invest in P17.1 |
| All-time / GOAT DRBL leaders | INTENTIONALLY_NOT_SUPPORTED | History is season leaders only |
| Orphaned savant UI | NOT_REMOUNTED | Snapshot remains canonical |
| ASK example chips | POLISH | Landing examples still box-score heavy; methodology path grounded |
| Ordinal grammar (`62th`) | POLISH | Player page rank wording |
| Compare headshot placeholders | POLISH | Empty avatar slots when image missing |

## Visual / workbook

| Debt | Status | Notes |
| --- | --- | --- |
| Visual QA screenshots | COMPLETE | `13_visual_qa_index.md` + `screenshots/` (27 PNGs incl. History DRBL full page) |
| Workbook v2 | COMPLETE | `reports/project_workbook_v2/DRBL_PROJECT_WORKBOOK_V2.zip` |

## Research

| Debt | Status | Notes |
| --- | --- | --- |
| M17c external common-target benchmark | NOT_STARTED | Authorized only after human review of this seal |
| K / P1 | UNCHANGED | K=1600; `DRBL_V1_REOPENED=NO` |

## Acceptable for PASS (documented debt)

- Historical logos empty + text/palette complete  
- Unique-name-only retained but not used at runtime  
- Single unresolved DRBL id without invented mapping  
- Minor UI polish (ASK chips, ordinals, placeholders)  

Do **not** invent joins, logos, or model changes to clear this list.
