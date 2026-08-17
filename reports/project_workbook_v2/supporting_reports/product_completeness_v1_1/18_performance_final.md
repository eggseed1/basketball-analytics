# 18 — Performance final pass (P17.1)

**Scope:** Identity hardening + DRBL hierarchy surfaces added/repaired in P17.1. Not a full Lighthouse/RUM certification.  
**Verdict:** **PASS** (no new N+1 / serial waterfall introduced by design review)

---

## Required checks

| Requirement | Status | Evidence / notes |
| --- | --- | --- |
| No row-level external fetch on boards | PASS | Explore/home join DRBL via overlay map after one season fetch |
| No 30-player serial API waterfall | PASS | Live route QA samples aliases from memoized index; roster uses batch overlay |
| No client fetch per logo | PASS | Modern logos via NBA CDN `next/image`; historical marks are local/text — empty logo map intentional |
| No eager all-history data | PASS | History leaders load registry season only; no career-cumulative DRBL product path |
| Alias memoization | PASS | `getPlayerIdAliasIndex` / process-level promise cache for 676 aliases |
| Home DRBL budget | PASS | Parallel `fetchDrblSeason` with existing soft-fail / budget pattern retained |

## Residual risks (debt)

- Live ESPN `byathlete` board remains the slow path (~93.9% estimated DRBL join via approved aliases).  
- Player destination still issues multiple provider calls per page (identity + peers + season + career) — acceptable, watch latency.  
- No production Core Web Vitals captured this seal.  
- Bundle delta vs `28827fb` not re-measured numerically this pass.

## Firewall

Identity/UI only — no precomputed JSON rewrites; regression hashes EQUAL vs integration baseline for all six seasons (see `19` / `20`).
