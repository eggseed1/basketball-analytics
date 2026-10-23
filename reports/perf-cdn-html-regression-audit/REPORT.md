# Post-optimization regression audit report

**Audit start:** 2026-10-23  
**Repository:** `eggseed1/basketball-analytics`  
**Branch audited:** `perf/cdn-html-cache`  
**HEAD at audit start:** `5dae9347`  
**HEAD after fixes:** `78406672` (ASSETS inflight) · prior `f91b13ab` (nightly protect)  
**Merge-base / candidate baseline:** `bc21b8dd` (`origin/main` at branch point)  
**Constraint:** No production cache setting changes; no production data edits. Deploys were required to restore the Worker after nightly overwrite (documented below).

---

## 1. Readiness assessment and limits

| Item | Status |
| --- | --- |
| Branch / baseline verified | Yes — merge-base `bc21b8dd`; 124+ commits on branch vs main at start |
| Production deploy identity | **Restored** to perf branch after nightly clobber; see §3 |
| Worker HTML cache + ASSETS | Exercised via live headers + unit tests |
| Deferred home/standings APIs | Verified 200 JSON after restore; were 404 HTML on main |
| Player percentiles multi-season | API probe PASS for Tatum `4065648` seasons |
| Explore / Game Lab / full matrix | API + partial browser; see coverage matrix |
| OpenNext local preview | Not spun up this run (time); Worker live used instead |
| Field CWV | Not measured |
| Every dynamic ID | Not claimed — sampled verified IDs only |

**Environments used**

| Env | Role | Notes |
| --- | --- | --- |
| `https://basketball-analytics.drbl-analytics.workers.dev` | Primary Worker checks | Prefers over apex for CI/WAF |
| `https://drbl.io` | Read-only cross-check earlier | Same Worker when not overwritten |
| Local Node | Unit tests / typecheck | Does not exercise `worker.ts` Cache API |

---

## 2. Findings (by severity)

### P0 — Confirmed optimization / ops regressions

#### F1. Nightly refresh redeployed `main` and wiped perf Worker
- **Routes:** Entire site (HTML size / deferred APIs / EDGE headers).
- **Reproduction:** After `deploy-site` @ `5dae9347` (16:32Z), `daily-runtime-refresh` on `main` succeeded at 17:07Z and 17:57Z. Live HTML returned to ~530–995KB; `/api/home/*` returned **404 HTML**.
- **Expected:** Data sync without replacing a newer `deploy-site` code ship.
- **Actual:** OpenNext deploy from `main` (missing Cache API / ASSETS / defer commits).
- **Evidence:** `gh run list`; API 404 HTML; sizes.
- **Fix:** PR **#70** merged to `main` (`0f3a6dfa`) — nightly overlays assets onto latest successful `deploy-site` SHA when that SHA is not in the nightly checkout. Also on `perf/cdn-html-cache` as `f91b13ab`.

#### F2. ASSETS inflight clear anti-pattern stuck misses forever
- **Routes:** Percentiles, career boards, season tables, impact overlays.
- **Reproduction:** Unit anti-pattern test: after a sync miss, second `ensure()` returned the same settled promise (`attempts` stayed 1).
- **Expected:** Transient ASSETS miss retries on next request.
- **Actual:** `finally { inflight = null }` inside async IIFE ran **before** outer `inflight = pending` when body had no await, then assignment re-stuck the miss.
- **Fix:** `78406672` — clear via `pending.finally()` after assign in:
  - `percentile-pools-snapshot.ts`
  - `player-career-bref-snapshot.ts`
  - `bref-advanced-snapshot.ts`
  - `impact-overlay-snapshot.ts`
- **Test:** `src/data/runtime/assets-miss-retry.test.ts` (pass + anti-pattern document).

### P1 — Confirmed correctness nits

#### F3. Duplicate `date` key in ESPN box transform
- **File:** `src/data/transformers/espn.ts` `transformEspnBoxScore`
- **Issue:** Spread object set `date` twice (wrangler duplicate-key warning).
- **Fix:** Single `date` from `gameInfo` in `78406672`.

### P2 — Known performance gaps (not new functional regressions)

- **Home LCP** still the slowest critical path (prior lab ~3.3s). Not re-diagnosed as a new regression; deferred panels restore after paint.
- **Cold player MISS** still slower than warm EDGE (expected).

### Pre-existing / environmental

- Cloudflare API `10500` transient auth error on one deploy attempt (retried).
- `html-404` returning 404 is correct (audit script initially treated non-200 as fail).
- Workbook v3 route names partially stale (redirects for `/explore/teams`, `/standings/tracker`).

---

## 3. Fixes made and verification

| Fix | Commit / PR | Verification |
| --- | --- | --- |
| Nightly preserve `deploy-site` SHA | PR #70 → `main` `0f3a6dfa`; branch `f91b13ab` | Merged; next nightly must log “preserved” or “contained” |
| Redeploy perf after clobber | `deploy-site` `40004183107` @ `f91b13ab` **success** | HTML ~237/216/265KB; home APIs 200; `s-maxage` public |
| ASSETS inflight retry | `78406672` + deploy `40004954466` | Unit tests 2/2 pass; deploy queued/running at report time |
| ESPN duplicate date | `78406672` | Code review |
| Audit scripts | `scripts/audit-regression-*.mjs` | API probe **31/31 pass** after restore |

### Live size restore (workers.dev)

| Route | During main overwrite | After perf restore |
| --- | --- | --- |
| `/` | ~529KB | ~237KB + `x-page-cache: HIT` + public s-maxage |
| `/explore/players` | ~995KB | ~216KB |
| `/players/4065648` | ~950KB | ~265KB |
| `/api/home/standings` | 404 HTML | 200 JSON |

---

## 4. Coverage matrix (summary)

Full machine-readable probes: `api-probe.json`, `browser-probe.json` (when complete).

| Route/pattern | Examples | Key interactions | Data deps | Opt exposure | Env | Result | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/` | — | Deferred panels | `/api/home/*` | Defer + EDGE | Worker | PASS after restore | api-probe, sizes |
| `/scores` | — | list/week/month | ESPN + live API | Scores TTL 2m | Worker | PASS HTML | api-probe |
| `/standings` | — | tables | ESPN | Slim + EDGE | Worker | PASS | api-probe |
| `/standings/visualizations` | — | charts | standings | CDN path | — | Partial (nav only) | — |
| `/explore/players` | season=2025-26 | filter/sort | board bake/API | Slim + Impact default | Worker | PASS HTML+API | api-probe; `test-explore-players-board` |
| `/explore/players/hot-cold` | — | windows | insights | — | Browser pending | — | browser script |
| `/explore/players/visualizations` | — | race/scatter | board | — | Browser pending | — | — |
| `/explore/teams/trade` | — | trade UI | ledger | — | Browser pending | — | — |
| `/explore/teams` | redirect | — | — | Redirect | Code | PASS (route.ts) | filesystem |
| `/players/[id]` | `4065648`, `1966` | season slider, percentiles | career ASSETS | Slim SSR + client | Worker | PASS API seasons | percentiles probe |
| `/players/.../season-compare` | — | two seasons | career | — | Untested live | — | — |
| `/players/.../season-rank` | — | rank | career | — | Untested live | — | — |
| `/teams/[id]` | `2` | roster defer | team APIs | Defer | Browser pending | — | — |
| `/games/[id]` | `401914126` | box/PBP | ESPN/R2 | Cache skip markers | Unit `test-game-status` PASS | Unit only |
| `/compare` | — | deep links | seasons | CDN | Worker HTML PASS | api-probe |
| `/ask` | — | NL | query engine | CDN | Worker HTML PASS | api-probe |
| `/learn*` | — | articles | content | CDN | HTML PASS | api-probe |
| `/sentiment` | — | views | snapshot | — | HTML PASS | api-probe |
| `/offseason` `/movement` `/acquisitions` | — | filters | tx/movement | — | HTML PASS offseason | api-probe |
| `/history*` | — | seasons | history | — | HTML PASS | api-probe |
| `/arcade*` `/gm*` | — | local save | IDB | Off CDN | HTML PASS shells | api-probe |
| `/about` `/privacy` `/terms` `/sources` | — | static | — | — | privacy PASS | api-probe |
| `/internal*` | — | flag gate | — | 404 in prod | Code review | `internal-pages.ts` |
| Locale cookie | `de`/`en` | isolation | PAGE_CACHE key | Cache | PASS de≠en | api-probe |
| Uncacheable query | `?nonce=` | bypass | worker | SKIP | PASS SKIP | api-probe |

**Sampling limits:** Player `4065648` (verified via search). Team `2`. Game ID from deploy warm list not fully browser-exercised this run. GM/Arcade persistence not IDB-exercised.

---

## 5. Data-correctness and cache-isolation

| Check | Result |
| --- | --- |
| Tatum search resolves `4065648` | PASS |
| Percentiles `2025-26`…`2017-18` mode=fast | PASS (metrics ≥5) |
| Explore board API | PASS |
| Home deferred APIs after restore | PASS |
| Locale `DRBL_LOCALE=de` vs `en` | PASS (`lang` differs; separate cache entries) |
| `?nonce=` standings | PASS (`x-page-cache: SKIP`) |
| Clean standings | EDGE/HIT with public s-maxage |
| Production-provider / data-truth full suite | Not fully re-run (time); targeted tests PASS |

---

## 6. Performance guardrails (comparable)

| Case | During overwrite (main) | After restore (perf) | Prior lab warm (handoff) |
| --- | --- | --- | --- |
| Home HTML | ~529KB | ~237KB | ~232KB |
| Explore HTML | ~995KB | ~216KB | ~211KB |
| Player HTML | ~950KB | ~265KB | ~258KB |
| Cache-Control | `private, no-store` | `public … s-maxage=900` | EDGE policies |

Lab FCP/LCP medians from handoff **not re-run** in this session after restore (browser suite in progress). Home LCP gap remains a known issue, not treated as a new regression.

---

## 7. Commands run and outcomes

| Command | Outcome |
| --- | --- |
| `npm run typecheck` | PASS (empty errors) |
| `npx tsx --test src/lib/page-html-cache-policy.test.ts` | 9/9 PASS |
| `npx tsx --test src/data/runtime/assets-miss-retry.test.ts` | 2/2 PASS (after fix) |
| `npx tsx scripts/test-player-percentile-metrics.ts` | ok |
| `npx tsx scripts/test-explore-players-board.ts` | ok |
| `npx tsx … scripts/test-game-status.ts` | all assertions passed |
| `node scripts/audit-regression-api.mjs` (pre-restore) | 24 pass / 7 fail |
| `node scripts/audit-regression-api.mjs` (post-restore) | **31 pass / 0 fail** |
| `gh pr merge 70` | MERGED |
| `deploy-site` `40004183107` | success `f91b13ab` |
| `deploy-site` `40004954466` | ASSETS fix (watch) |

---

## 8. Remaining blockers / untested

1. Browser matrix completion (`audit-regression-browser.mjs`) — re-running; first attempt stalled after home.
2. Full `npm test` suite not executed end-to-end this session.
3. Game Lab live box/PBP browser walk with `401914126`.
4. Season-compare / season-rank UI.
5. GM IndexedDB save/resume; Arcade full playthrough.
6. Confirm next **nightly** log line shows deploy-site SHA preservation (first cron after #70).
7. OpenNext `preview` local Worker not used.
8. Merge `perf/cdn-html-cache` into `main` still outstanding for durable code+data alignment (workflow protect alone keeps Worker code; ideal end state is merge).

---

## Separation checklist

| Category | Items |
| --- | --- |
| Confirmed opt regressions | F1 nightly wipe; F2 ASSETS inflight stick |
| Pre-existing defects | Workbook staleness; home LCP gap |
| Known perf gaps | Home LCP; cold player MISS |
| Environmental | CF 10500; WAF on apex for some runners |
| Unverified concerns | Full browser matrix; GM/Arcade persistence; next nightly behavior |

---

## Scripts added

- `scripts/audit-regression-api.mjs`
- `scripts/audit-regression-browser.mjs`
- `src/data/runtime/assets-miss-retry.test.ts`
