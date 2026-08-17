# Design visual regression — P17.2

**Audit date:** 2026-08-17  
**Current:** `product/drbl-site-completeness-v1_2` @ basketball-analytics-integration  
**Design reference:** `7e764ceb5c834a19696dad84ed6696e7e3289a6a` (basketball-analytics-design-ref / `origin/drbl-ia-and-ask`)

Companion: [`00A_design_reference_diff.md`](./00A_design_reference_diff.md)

---

## Method

Side-by-side read of P17.2-touched public UI and major hybrid surfaces vs design reference. Classify each delta:

- `IDENTICAL`
- `INTENTIONAL_SEMANTIC` (keep)
- `UNINTENTIONAL_DESIGN_DRIFT` (must be 0)

No wholesale UI checkout from design branch. No new invented presentation.

---

## Surface classifications

| Surface | Classification | Notes |
|---|---|---|
| Explore Players table (`player-season-table.tsx`) | INTENTIONAL_SEMANTIC | DRBL cols + multi-team/TOT + digit label guard; single-team TM = logo+abbr |
| Explore Players page / shell | INTENTIONAL_SEMANTIC / IDENTICAL | Notice + `hasDrbl`; shell identical |
| Player destination identity | INTENTIONAL_SEMANTIC | Link to `/teams/{espnId}`; mark composition restored to reference |
| Player page | INTENTIONAL_SEMANTIC | Canonical teamKey gating + Team unavailable |
| Player core island | INTENTIONAL_SEMANTIC | DRBL Snapshot primary |
| Game page | IDENTICAL | Presentation untouched; lookup fix in data layer |
| Game identity shell / lab | IDENTICAL | |
| TeamLogo | INTENTIONAL_SEMANTIC | Digit-guard only; markup/classes preserved |
| Home page + sections | INTENTIONAL_SEMANTIC / IDENTICAL | DRBL top performers / findings copy; other sections identical |
| Teams explore table | IDENTICAL | **Repaired** from fullName stack → logo+abbr |
| Team destination page | IDENTICAL | |
| Compare page + view | INTENTIONAL_SEMANTIC | DRBL fields + dimension groups |
| ASK page + view | IDENTICAL | |
| Learn index / slug | IDENTICAL | |
| Learn DRBL (`/learn/drbl`) | REF_MISSING_CUR_ADDED | Product completeness page |

---

## Repairs applied this audit

| File | Drift | Fix |
|---|---|---|
| `src/components/explore/team-season-table.tsx` | Stacked fullName + abbr subtitle; display-time `resolveCanonicalTeam` | Restored reference logo + single-line `abbreviation`; kept `/teams/{teamId}` href |
| `src/components/players/player-destination-identity.tsx` | Link wrapper `gap-1.5` + `sr-only` span | Restored logo-only child inside link; `aria-label` from `teamName` / brand; kept `/teams/{espnId}` |

**Not repaired (intentional keep):** DRBL columns/notices, multi-team TM policy, TeamLogo digit-guard, game route data fixes, player teamKey canonicalization, Compare DRBL groups, Home DRBL-primary when overlay ok.

---

## Drift counts

| Metric | Count |
|---|---:|
| `UNINTENTIONAL_DESIGN_DRIFT` found | 2 |
| `UNINTENTIONAL_DESIGN_DRIFT` repaired | 2 |
| **`UNINTENTIONAL_DESIGN_DRIFT` remaining** | **0** |
| Files repaired | 2 |

---

## Screenshot evidence

Reference worktree rendered at `http://127.0.0.1:3001` (`7e764ceb`).

| Set | Path | Count |
|---|---|---:|
| REFERENCE | `design_reference/*.png` | 11 |
| CURRENT P17.2 | `design_reference/current_p17_2/*.png` | 11 |

Surfaces: Home (desktop+mobile), Explore Players (desktop+mobile), player page, Explore Teams, team page, game page, Compare, ASK, Learn.

Paired visual review notes:

| Surface | Layout/nav/chrome | Content delta | Drift class |
|---|---|---|---|
| Explore Players | Match (filters, table chrome, TM logo+abbr) | +DRBL columns / provenance line | INTENTIONAL_SEMANTIC |
| Home | Match (Upcoming / board / watchlist / standings) | Findings DRBL-primary vs ref DARKO-first | INTENTIONAL_SEMANTIC |
| Player page | Match (tabs, identity hero, islands) | DRBL Snapshot primary; team link on mark | INTENTIONAL_SEMANTIC |
| Game page | Match | Lookup fixed in data layer only | IDENTICAL UI |
| Teams / ASK / Learn / Compare | Match chrome | DRBL fields where product requires | INTENTIONAL_SEMANTIC / IDENTICAL |

---

## DESIGN_INTENT_PRESERVED

**YES**

Remaining diffs vs design reference are analytics/identity/routing semantics only. Presentation shells for P17.2 hybrid surfaces match reference intent.

```text
UNINTENTIONAL_DESIGN_DRIFT = 0
DESIGN_REFERENCE = drbl-ia-and-ask @ 7e764ceb...
DESIGN_INTENT_PRESERVED = YES
```
