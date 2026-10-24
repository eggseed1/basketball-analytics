# Speed: visible-first homepage insights

**Branch:** `perf/visible-first-screen`  
**Baseline:** production lab `2026-10-24T03:03:46Z` (findings still client-fetched)  
**Shipped for paint:** `f2eeecc0`  
**Follow-up:** `b6453434` (mount web-vitals reporter)

**Lab script:** `scripts/audit-perf-lab.mjs`  
**Browser:** Playwright Chromium, 1280×800, no CPU/network throttle  
**Visits:** warm-ish (browser cache kept between runs)  
**Edge:** prefer `x-page-cache: EDGE` after warm curls  
**Host:** `https://drbl.io`  
**Local Chrome on this machine:** 156.0.8078.47  

Files: `lab-baseline-buffered.json`, `lab-after-f2eeecc0.json`, optional `lab-rewarm-home-player.json`.

---

## Before / after (median of 3 runs, ms)

| Route | Before FCP | After FCP | Before LCP | After LCP | After LCP text |
| --- | ---: | ---: | ---: | ---: | --- |
| `/` | 1,224 | 256 | 4,992 | 256 | Findings paragraph in first HTML |
| `/explore/players` | 244 | 872 | 864 | 872 | `H1` Players (run 1 was MISS) |
| `/standings` | 264 | 228 | 884 | 848 | Standings prose |
| `/players/4065648` | 260 | 1,724 | 1,244 | 1,724 | Cold MISS after deploy; rewarm separately |

Homepage LCP goal ≤1.5 s: first post-ship lab median **256 ms** (runs 204 / 256 / 1,260). A later rewarm after the vitals deploy (`lab-rewarm-home-player.json`) measured home median LCP **1,684 ms** on the same findings `<p>` — still far under the old ~5 s client-fetch LCP, a bit above the 1.5 s goal on that pass. Spread is real; do not pick the best run.

Explore EDGE-only samples stay near the prior ~864 ms band; the 872 median includes one MISS. Player rewarm median LCP **1,212 ms** (≈ prior 1,244).

Local Next on `:3001` (same SSR path): warm median LCP **872 ms** on the same findings paragraph.

---

## What shows up sooner

Homepage Recent Insights used to paint a pulse skeleton, then `useEffect` called `/api/home/insights`. Findings copy became LCP around ~5 s.

`loadHomeInsightsDesk()` now reads the bundled recent-insights snapshot, projects a compact model (headlines, descriptions, heroes, scorelines; no flow / moment / trend charts), and `HomeFindingsSection` puts that in the first HTML. Cards are `data-motion-static` so entry motion does not hide ready text. Above-norm shares the same desk load.

Prod HTML after ship: insight descriptions present, no `Loading recent insights`, document does not request `/api/home/insights` for first paint.

---

## JS and motion

Home first paint no longer waits on the insights API. Chart SVG modules stay off the home Flight path; full cards remain on `/findings`.

Phone standalone splash hides on `DOMContentLoaded` with an 1.8 s bound instead of waiting for `window.load`.

---

## Cache and freshness

Snapshot generation time still comes from `recentInsightsSnapshotMeta().generatedAt`. Live analysis is not on the homepage request path; refresh stays on the nightly bake and `/api/home/insights` for other callers.

Edge HTML uses `public, max-age=0, s-maxage=900, stale-while-revalidate=1800` with Worker `x-page-cache` EDGE / HIT / MISS. After a deploy, first hits are MISS until warm.

Warm EDGE HTML TTFB samples (ms, 5 curls, median): `/` 67, explore 75, standings 71, player 66, scores 75. Occasional ~1 s EDGE samples still show up (likely refresh work); they are not the typical hit.

---

## Checks

- `npx tsx scripts/test-home-findings-ssr.ts`
- `home-findings-project` in `test:lib-unit`
- Prod and `es` Accept-Language HTML contain findings text, no insights loading skeleton
- Lab after `f2eeecc0` deploy (table above)

Game fixtures `401914126` / `401704761` and full locale matrix were not re-run in this homepage-focused pass.

---

## Still open

1. Home LCP still varies with fonts/CSS and EDGE refresh (256 ms vs 1.7 s medians across labs). Next: trim above-fold CSS cost and confirm buffered HTML is not waiting on slower Suspense siblings.
2. Other home modules (standings, performers, hot-cold) still client-fetch below the fold; they are not the LCP element anymore.
3. Desktop lab does not prove mobile field p75. `WebVitalsReporter` is mounted with path, device class, and build id for field capture.

---

## Rollback

```bash
git revert f2eeecc0
gh workflow run deploy-site.yml --ref main
```

That restores client-fetched insights and the prior splash `window.load` behavior from the parent of that commit.
