# Performance optimization evidence

Lab environment: Next.js `16.3.0` production (`next build --webpack` + `PORT=3001 next start`), Chromium via Playwright, localhost.  
**Not field Core Web Vitals.** TBT was not used as INP. Physical devices and Firefox/WebKit browsers were not fully re-run (Chromium only for lab timings).

Localization (`next-intl`, nine locales) was preserved (`npm run test:i18n`).

## Route inventory

69 public `page.tsx` routes under `src/app` (excluding `internal/*`). Representatives measured: `/`, `/scores`, `/standings`, `/explore/players`, `/players/1966`, `/teams/13`, `/ask`, `/arcade`, `/compare`, `/sentiment`, `/learn`, `/gm`. Full list: `/tmp/tm/perf/route-inventory.txt`.

## Pass 1 — client JS (9.4 MB → 878 KB)

**Bottleneck:** Basketball-Reference season-tables JSON entered the client webpack graph via comps/futures + Luka/savant import chains.

| Change | Why |
|--------|-----|
| Split `@/lib/player-comp-futures-shared` for chart types; keep loaders server-only | Stop client chart from importing 9MB JSON |
| `import "server-only"` on `bref-advanced-snapshot.ts` | Hard-fail if snapshot re-enters a client module |
| Luka types / `brefSeasonYear` / `isDarkoSeasonAvailable` slim modules | Break scraper → snapshot client graph |
| Root client messages scoped; arcade/GM nest `RouteMessagesProvider` | Avoid shipping arcade/GM catalogs everywhere |
| Geist `display: "swap"` + `adjustFontFallback` | Faster text paint |

Largest static chunk after pass 1: **878 KB** (GM-route scoped). `getBundledBrefAdvancedSeason` absent from `.next/static/chunks`.

## Pass 2 — HTML payloads (players / player detail)

**Bottlenecks:** `/explore/players` ~1.9 MB HTML (67 columns × 100 rows) and `/players/[id]` ~1.2 MB RSC (percentile series + multi-metric comps).

| Change | Why |
|--------|-----|
| `EXPLORE_PLAYERS_PAGE_SIZE` 100 → **50** | Matches p18perf budget; infinite scroll unchanged |
| Omit derived `mpg`/`ppg`/… from board rows; derive in `boardStatValue` | Smaller RSC / API row JSON |
| Omit null `portraitUrl`; `includeContext: false` on board page | Drop unused percentile pools from SSR work |
| `slimPercentileMetricsForSsr` — keep series only on default metric | ~100–170 KB less player-detail flight; idle full upgrade refills |
| Comps/futures SSR ships **primary metric only**; chip fetch via `/api/players/[id]/comp-futures` | ~70–100 KB less flight; chips still work |

### HTML size (median of 3, `DRBL_LOCALE=en`)

| Route | Baseline KB | After pass 1 KB | After pass 2 KB |
|-------|-------------|-----------------|-----------------|
| `/` | 677.5 | 668.1 | 668.1 |
| `/explore/players` | **1885.3** | 1874.8 | **1025.5** |
| `/players/1966` | 1207.4 | 1196.9 | **915.6** |
| `/scores` | 153.8 | 143.3 | 143.3 |
| `/standings` | 388.7 | 378.2 | 378.2 |
| `/ask` | 98.2 | 87.5 | 87.5 |
| `/gm` | 89.0 | 81.9 | 81.9 |

Artifacts: `/tmp/tm/perf/baseline/ttfb-html.json`, `/tmp/tm/perf/after/ttfb-html.json`, `/tmp/tm/perf/after/ttfb-html-v2.json`.

### Lab Chromium FCP / wall (pass 2)

Script: `scripts/perf-lab-focused.mjs` → `/tmp/tm/perf/after-v2`. LCP often NaN in this harness.

| Profile | Route | Pass 1 FCP | Pass 2 FCP | Pass 1 wall | Pass 2 wall |
|---------|-------|------------|------------|-------------|-------------|
| desktop | players | 132 | 184 | 2811 | 2952 |
| desktop | player-detail | 52 | 64 | 8006 | 7862 |
| mobile-slow4g | players | **4712** | **3300** | 8747 | **5963** |
| mobile-slow4g | player-detail | 2000 | 2184 | 14934 | 14427 |
| mobile-slow4g | home | 2292 | 2264 | 7104 | 7183 |
| mobile-slow4g | scores | 1972 | 1860 | 4576 | 4465 |

CLS median 0.000 across focused routes. Screenshots: `/tmp/tm/perf/after-v2/screenshots/`.

## Regression checks (pass 2)

- `npm run build` (success)
- `npm run test:i18n` (pass)
- `npx tsx scripts/test-explore-players-board.ts` (ok; page size 50)
- `npx tsx --require ./scripts/lib/stub-server-only.cjs --test src/lib/player-comp-futures.test.ts` (8/8)
- Prod smoke: listed routes + `/api/players/1966/comp-futures?metric=darko` → 200
- Locale smoke: `DRBL_LOCALE=de` → `lang="de"`

**Not run / incomplete:** Firefox & WebKit full matrix; physical devices; OpenNext Worker preview; INP field metrics.

## Remeasure after i18n expansion (2026-10-20)

Same lab harness; evidence in `reports/i18n-perf-completion/perf/`. Catalog grew to 1321 keys with route-scoped providers.

| Profile | Route | FCP ms | Wall ms | HTML KB |
|---------|-------|--------|---------|---------|
| desktop | players | 188 | 3039 | 1025.9 |
| mobile-slow4g | players | **1920** | 5064 | — |
| mobile-slow4g | player-detail | 2176 | 14673 | 916.4 |

Players Slow-4G FCP continues below the pre-opt ~4.7 s and pass-2 ~3.3 s medians on this machine (variance expected).

## Pass 3 — player detail hero path (2026-10-20)

**Why it was slow:** `/players/[id]` HTML was ~1 MB (mostly percentile DOM + RSC). SSR waited on a ~650-row peer board (plus overlays) and serialized every metric category twice (panel + Similar).

| Change | Why |
|--------|-----|
| Fast SSR ranks from `percentile-pools-snapshot` cutoffs | Skip peer-board materialization on the HTML path |
| `slimPercentileMetricsForSsr` keeps Impact rails + one sparkline | Other categories idle-fetch via `/api/players/.../percentiles` |
| Similar strip is client-fetched (`?comps=1`) | Second peer wait stays off first paint |

Local `next start` after pass 3 (`/players/1966`): **HTML ~485 KB** (was ~916 KB), desktop FCP median **124 ms**, harness wall ~5 s (includes fixed wait; not field TTFB).

## Remaining limits (acceptable for this pass)

1. **`/explore/players` still ~1.0 MB** — 67-column first window of 50 rows. Further cuts need column virtualization or a narrower default view (appearance-sensitive).
2. **`/players/[id]`** — overview still streams career/stats/contract islands after the hero; Slow-4G wall stays higher than scores/home.
3. **Largest client chunk ~878 KB** — GM routes only; not on main boards.
4. Home HTML ~668 KB (shell + splash + messages) unchanged this pass.
5. **OpenNext Worker edge HIT/MISS** not measured in-workspace (see completion report).

## Reproduction

```bash
npm run build
PORT=3001 npm run start
PERF_BASE=http://localhost:3001 node scripts/perf-lab-focused.mjs /tmp/tm/perf/after-v2
npm run test:i18n
npx tsx scripts/test-explore-players-board.ts
npx tsx --require ./scripts/lib/stub-server-only.cjs --test src/lib/player-comp-futures.test.ts
rg -l "getBundledBrefAdvancedSeason" .next/static/chunks || echo OK
ls -lhS .next/static/chunks/*.js | head
```

## Rollback

**Pass 1:** shared futures types, `server-only` bref snapshot, Luka/savant slim modules, client message scoping, font `display: swap`.

**Pass 2:** `EXPLORE_PLAYERS_PAGE_SIZE`, board row wire shape, `slimPercentileMetricsForSsr`, comps `primaryOnly` + `/api/players/[playerId]/comp-futures`.

Do **not** remove `src/middleware.ts` or locale cache-key worker changes as part of perf rollback.
