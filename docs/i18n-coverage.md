# i18n coverage and verification evidence

Translation quality: **machine-assisted; human language review pending**.  
Durable verification artifacts: [`reports/i18n-perf-completion/`](../reports/i18n-perf-completion/).

## Versions audited

| Package | Installed |
|---------|-----------|
| next | 16.3.0 |
| next-intl | 4.14.9 |
| @opennextjs/cloudflare | 1.20.2 |
| wrangler | 4.125.0 |
| playwright | 1.62.1 (chromium, firefox, webkit binaries installed) |

## Catalog metrics

| Metric | Value |
|--------|-------|
| Message keys (en) | **1321** |
| Locales | 9 + en-XA (dev) |
| `npm run test:i18n` | pass (parity, ICU, empty, English-copy allowlist + pending-translation list, force-locale, cache-key, learn locale files) |
| Full en catalog JSON | ~67.5 KB |
| Learn locale content files | 9 (en templates + es/de for 3 topics) |
| Client provider | Root shell namespaces; `Games` / `Findings` / `LearnPages` / arcade / GM via `RouteMessagesProvider` |

## Route coverage table

Legend: **Wired** = UI chrome uses next-intl. **Partial** = chrome wired; long bodies still English or locale-file limited. **Redirect** = no UI. **Gap** = interiors mostly English.

| Route template | Status | Notes |
|----------------|--------|-------|
| `/` (home) | Wired | Modules + findings chrome; **insight headline/description** still English (archived generator prose) |
| `/scores` | Wired | Gamefeed chrome; tip clocks locale-aware |
| `/standings` | Wired | |
| `/standings/visualizations` | Partial | Page chrome incomplete vs main standings |
| `/explore/players` | Wired | |
| `/explore/players/hot-cold` | Wired | Locale dates |
| `/explore/players/visualizations` | Wired | Race/scatter live here |
| `/explore/players/race` | **Redirect** | → visualizations `?view=race` (no page UI) |
| `/explore/games` | Wired | |
| `/explore/teams/trade` | Wired | |
| `/players/[playerId]` (+ rank/compare) | Wired | PlayerDetail |
| `/teams/[teamId]` (+ history/vs) | Wired | TeamDetail |
| `/compare` | Wired | Deep chart interiors partial |
| `/sentiment` `/movement` `/acquisitions` `/offseason` `/injuries` | Wired | |
| `/history` `/history/records` | Wired | `/history/[season]` interior partial |
| `/awards` | Wired | |
| `/franchises` | Wired | |
| `/franchises/[id]` | **Redirect** | → team History tab |
| `/findings`, `/findings/[id]` | Wired | Filters/meta/RSS/categories; **card body prose** English by design until regen |
| `/ask` | Wired | |
| `/learn` | Wired | |
| `/learn/[slug]` | Partial | Section headings + loader; **es/de bodies** for pace, plus-minus, how-drbl-works; others English fallback |
| `/learn/drbl`, `/learn/salary`, `/learn/drbl/war1` | Partial | Chrome; long TSX bodies mostly English |
| `/arcade` + games | Wired | |
| `/about` `/privacy` `/terms` `/sources` | Wired | Long legal body paragraphs still partly English |
| `/dashboard` | Wired | |
| `/games/[gameId]` | Wired | Games namespace: tabs, preview, unavailable, possession chrome; deep lab/PBP English |
| `/gm` + interiors (schedule, night, medical, lineup, …) | Wired | GmUi chrome; **engine narrative** English |
| `/internal/*` | Intentional English | |

## Content-class honesty

| Surface | Translated? |
|---------|-------------|
| Nav / settings / empty / error chrome | Yes (catalogs) |
| Findings category labels + archive filters | Yes |
| Findings headline/description text in archive JSON | **No** (English data until locale-aware nightly regen) |
| Learn section headings | Yes |
| Learn topic bodies | **Partial** (locale JSON pipeline; 3 topics × es/de) |
| Game detail deep lab / PBP | Mostly English |
| GM engine news / injury types / scheme labels | English by design |
| Player/team names, metric IDs, numbers | Never translated |
| Dates | Locale `Intl` via `src/i18n/format-date.ts` + tip-time locale arg on high-traffic surfaces |

## Remaining gaps (honest)

1. Insight/finding **generated prose** in `findings-archive.json` / `recent-insights.ts` bodies.
2. Learn bodies for locales other than es/de and topics beyond the three proof slugs; `/learn/drbl` and `/learn/salary` TSX portals.
3. Game Lab deep UI, possession explorer interiors, status badge strings.
4. GM engine-authored strings; some award ballot copy.
5. ~214 new catalog keys still English-filled in several locales (`src/i18n/pending-translation.ts`) pending MT/human pass.
6. Human review of all machine-assisted catalogs.
7. OpenNext Cloudflare **edge** HIT/MISS not observed from this workspace.

## Browser / device / locale verification

| Check | Result | Evidence |
|-------|--------|----------|
| Chromium × desktop/tablet/phone × 14 templates | Pass | `reports/i18n-perf-completion/screenshots/devices/chromium/` |
| Firefox × same profiles | Pass | `.../devices/firefox/` |
| WebKit × same (7 retries after nav race) | Pass after retry | `webkit-retry.json` |
| Locale smoke 9 languages + Accept-Language ja | Pass | `locale-smoke.json` |
| en-XA stress screenshots | Captured | `screenshots/locales/en-XA/` |
| Physical devices | **Not tested** (emulated only) | — |
| Dual-context cache isolation (local `next start`) | Pass | `cache/dual-context.json` |
| Worker PAGE_CACHE unit keys | Pass | `cache/locale-key-unit.json` + `test:i18n` |
| OpenNext Worker preview / deployed edge | **Not run** | Preview script is heavy; no live edge probe |

## Performance (post-localization starting point)

See `docs/perf.md` and `reports/i18n-perf-completion/perf/`. Medians of 3, Chromium lab.

| Profile | Route | FCP ms | Wall ms | HTML KB |
|---------|-------|--------|---------|---------|
| desktop | players | 188 | 3039 | 1025.9 |
| desktop | player-detail | 64 | 7977 | 916.4 |
| mobile-slow4g | players | **1920** | 5064 | — |
| mobile-slow4g | home | 2288 | 7097 | 669.5 |

Earlier baseline players HTML ~1885 KB / Slow-4G FCP ~4712 ms (pre page-size + SSR slim).

## Caching

Worker `PAGE_CACHE` keys: `page:{CF_VERSION_METADATA.id}:{locale}:{path}?{query}` via `localeCacheKeySegment` (cookie → Accept-Language → force env). RSC / prefetch skipped. Version id changes on deploy so old locale-blind entries are not reused.

## Reproduction

```bash
npm run test:i18n
npm run build
PORT=3001 npm run start
PERF_BASE=http://localhost:3001 npx tsx scripts/verify-i18n-perf-completion.mjs
PERF_BASE=http://localhost:3001 node scripts/perf-lab-focused.mjs reports/i18n-perf-completion/perf/lab
# OpenNext Worker preview (heavy; distinguish from next start):
# npm run preview
```

## Rollback

| Action | Effect |
|--------|--------|
| Settings → English / `DRBL_LOCALE=en` | Browser English |
| Clear cookie → Automatic | Accept-Language (not English-only) |
| `DRBL_FORCE_LOCALE=en` | Deploy-wide English |
| Do not delete `src/middleware.ts` | Locale Vary + i18n wiring |
