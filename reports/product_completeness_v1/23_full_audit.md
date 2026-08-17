# 23 — Full product completeness audit (executive)

**Milestone:** P17 DRBL Product Completeness  
**Branch:** `product/drbl-site-completeness-v1`  
**Freeze:** `00_freeze.json` (source/product HEAD `64cc231` at audit start)  
**Verdict:** **PRODUCT_COMPLETENESS = PARTIAL**

## What shipped (honest FIXED)

1. **Player identity join** — `player-id-aliases.json` **0 → 676**, all labeled `HIGH_CONFIDENCE_UNIQUE_NAME` (unique-name policy; not silent exact-id). Crosswalk artifact `08_…` documents ALIAS vs unmatched.
2. **Player destination DRBL** — DRBL Snapshot + DRBL-before-DARKO headline; identity-aware peer merge; R1 null-safe merge (`mergePlayerSeasonStats`).
3. **Team roster value** — DRBL-first when valid estimates exist; DARKO fallback.
4. **Explore teams names** — full/canonical display names restored.
5. **Learn / glossary / banner copy** — O/D/P/LN/B pedagogy; replacement/gravity/WAR/uncertainty framing corrected; live-board ≠ DRBL overlay clarified.
6. **Team identity forensics** — ESPN canonical key, namespace matrix, 30/30 modern completeness, historical eras sampled; historical logo asset map intentionally empty.

## What remains open (drives PARTIAL)

- **ASK** — no DRBL metrics in the query engine.
- **Compare** — no DRBL.
- **Home** — still DARKO-first impact rail.
- **UI smoke screenshots** — deferred.
- **`next build`** — recorded **TBD** for this product seal.
- Live ESPN-board → DRBL join **rate not re-measured**; do not claim 100%.
- Season-rank / season-compare / dashboard / historical DRBL leaders still thin or absent.
- Orphaned savant components remain in tree but unmounted.

## Firewall / research integrity

- `DRBL_V1_REOPENED`: **NO**
- `K`: **1600**, `P1` unchanged
- Precomputed current + historical **mismatches: 0** (untouched)
- Research seals **unchanged**; **M17c not started**
- Engineering carry-forward: **drbl 201/201**, **tsc PASS**, **data-truth PASS**, **site-nav PASS**; new identity/merge/learn tests added

## Dual-system clarity

| System | Key | Purpose |
|---|---|---|
| Teams | ESPN canonical id | Season destinations, brands, ASK entities |
| Franchises | Slug lore | Narrative history; not season metrics |
| Modern brand | Current abbr/name/CDN | Default product chrome |
| Historical brand | `TEAM_ERAS` + text marks | Era-correct labels; logos blocked until assets exist |
| Players | ESPN route ↔ NBA DRBL via aliases | Overlay + destination snapshot |

## Recommendation

Treat P17 as a **partial product seal**: core destination/explore/roster/learn identity+DRBL gaps closed with documented confidence; do not market site-wide DRBL completeness until ASK/compare/home + build + screenshots close.
