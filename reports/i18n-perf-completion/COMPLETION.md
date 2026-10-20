# Completion report: localization gaps + verification + performance

**Date:** 2026-10-20  
**Deploy:** not performed (per request)  
**Translation quality:** machine-assisted; human review pending  

This report separates **implementation** (code/catalogs) from **verification** (browsers, cache, perf). Evidence lives under `reports/i18n-perf-completion/` (not only `/tmp`).

---

## 1. Implementation completed

### Coverage gaps addressed

| Gap | Outcome |
|-----|---------|
| Insight/finding prose | **Chrome done** (`Findings` +47 keys): filters, meta, RSS, period labels, hero labels, **category labels at render**. Archived headline/description strings remain English data. |
| Learn article bodies | **Pipeline + proof**: `load-localized.ts`, locale JSON for 3 topics × en/es/de; section headings in `LearnPages`. Other topics/locales fall back to English with note. `/learn/drbl` & `/learn/salary` bodies still English. |
| Game detail | **`Games` namespace (69 keys)** wired on page + identity/preview/unavailable + possession chrome. Deep Game Lab / PBP interiors still English. |
| Remaining GM interiors | **`GmUi` +~195 keys**; schedule/night/medical/lineup/teams/cap/standings/transactions/offseason/players/game chrome. Engine narrative English. |
| `/explore/players/race` | **Redirect only** → visualizations `?view=race` (documented; no UI work). |
| `/franchises/[id]` | **Redirect only** → team History (documented). |
| Date formatting | Shared `src/i18n/format-date.ts`; tip-time + LocalTipTime + high-traffic surfaces use request/UI locale. Timezones (UTC calendar days, America/New_York tips) preserved. |

### Catalog

- Keys: **991 → 1321**
- Locales: 9 + en-XA
- `npm run test:i18n`: **pass**
- Pending English fills tracked in `src/i18n/pending-translation.ts` (~214 keys)

### Performance (prior pass, still in tree)

- Players board page size 50; slim RSC rows; percentile series SSR trim; comps primary-only + API.
- Players HTML ~1885 → ~1026 KB; Slow-4G players FCP improved further in this verify pass (~1920 ms median).

---

## 2. Remaining coverage gaps

1. Findings **generated body prose** (archive JSON / generator templates beyond category map).
2. Learn bodies: all locales except es/de; all topics except pace / plus-minus / how-drbl-works; drbl/salary portals.
3. Game Lab deep UI, possession explorer interiors, some status badges.
4. GM engine strings (news, injuries, schemes); partial award ballot copy.
5. Catalog keys listed in `pending-translation.ts` still English-identical pending MT/human.
6. `/standings/visualizations`, `/history/[season]` interiors incomplete vs hubs.
7. Human language review of all non-English catalogs.

---

## 3. Browser / device / locale verification

**Emulated only** (Playwright 1.62.1). Physical devices **not** tested.

| Layer | Outcome |
|-------|---------|
| Chromium desktop / tablet / phone × 14 templates | Pass |
| Firefox desktop / tablet / phone × 14 templates | Pass |
| WebKit × same | 7 transient nav races; **all 7 passed on sequential retry** (`screenshots/webkit-retry.json`) |
| Locale smoke (en, es, fr, de, pt-BR, ko, ja, zh-Hans, zh-Hant + AL=ja) | Pass (`locale-smoke.json`) |
| Locale screenshots de/ko/ja/zh-Hans/en-XA × home/standings/players/learn-topic | Captured |
| Visual vs pre-change English | Emulated screenshots under `screenshots/devices/`; no intentional baseline replacement. Hierarchy/colors preserved in spot checks; longer CJK/en-XA labels widen chrome without clipping primary nav in captured desktop frames. |

Screenshot index: `screenshots/index.json` + device/locale trees.

---

## 4. Cache isolation evidence

### Unit (`localeCacheKeySegment`)

File: `cache/locale-key-unit.json` (+ `npm run test:i18n`).

- Cookie beats Accept-Language
- Force locale env wins
- `en-XA` isolated from `en`
- `zh-TW` → `zh-Hant`
- Distinct keys for de vs fr on same path

### Local dual-context (not Cloudflare edge)

File: `cache/dual-context.json` — Chromium contexts, same `/standings` URL, opposite cookie order (de↔fr, ja↔en), reload both. Each context kept its `lang`.  

**Layer:** `next start` on localhost. **Not** Worker KV HIT/MISS. Deployed edge not probed.

### Worker design (code review)

`worker.ts` keys `page:{version}:{locale}:{path}?{query}`; skips RSC/prefetch; `CF_VERSION_METADATA.id` changes on deploy so prior locale-blind entries are not reused. Auth cookies → `set-cookie` responses not stored.

### OpenNext Worker preview

**Not run** in this pass (`npm run preview` is a long runtime bake + wrangler). Local `next start` verification only.

---

## 5. Performance results

### HTML size (median of 3, en cookie, `next start`)

From `perf/html-sizes.json`:

| Route | HTML KB | Median TTFB-ish ms |
|-------|---------|-------------------|
| `/` | 669.5 | 66 |
| `/scores` | 143.7 | 21 |
| `/standings` | 378.6 | 44 |
| `/explore/players` | **1025.9** | 44 |
| `/players/1966` | **916.4** | 195 |
| `/teams/13` | 482.7 | 65 |
| `/learn/pace` | 89.2 | 9 |
| `/findings` | 480.3 | 26 |
| `/gm` | 91.6 | 10 |

### Lab Chromium (median of 3) — `perf/lab/`

| Profile | Route | FCP | Wall | CLS |
|---------|-------|-----|------|-----|
| desktop | home | 96 | 2769 | 0 |
| desktop | players | 188 | 3039 | 0 |
| desktop | player-detail | 64 | 7977 | 0 |
| mobile-slow4g | home | 2288 | 7097 | 0 |
| mobile-slow4g | players | **1920** | 5064 | 0 |
| mobile-slow4g | player-detail | 2176 | 14673 | 0 |
| mobile-slow4g | scores | 2100 | 4699 | 0 |

LCP often NaN in this harness. JS byte counts via Content-Length under-count chunked responses.

### Translation JSON vs page weight

- Catalog en file ~67.5 KB on disk; route-scoped providers avoid shipping Games/Findings/LearnPages/arcade/GM on every page.
- Dominant players HTML cost remains **67-column × 50-row board RSC**, not message JSON.

### Before/after (players board, from prior perf pass + this verify)

| Metric | Pre-opt | This verify |
|--------|---------|-------------|
| HTML KB | ~1885 | ~1026 |
| Slow-4G FCP ms | ~4712 | ~1920 |

---

## 6. Reproduction commands

```bash
# Catalog / cache-key / learn locale gates
npm run test:i18n

# Production build + local server
npm run build
PORT=3001 npm run start

# Locale smoke, dual-context, multi-browser screenshots
PERF_BASE=http://localhost:3001 npx tsx scripts/verify-i18n-perf-completion.mjs

# Focused lab timings
PERF_BASE=http://localhost:3001 node scripts/perf-lab-focused.mjs reports/i18n-perf-completion/perf/lab

# Playwright browsers (if missing)
npx playwright install chromium firefox webkit

# OpenNext Worker preview (heavy; not executed here)
# npm run preview
```

---

## 7. Verification still blocked / incomplete

| Item | Status |
|------|--------|
| Physical phones/tablets | Not tested |
| Deployed Cloudflare PAGE_CACHE HIT/MISS | Not observed |
| `npm run preview` OpenNext Worker | Not run (bake + wrangler cost) |
| Pixel-diff automation vs frozen English baselines | Spot screenshots only; no CI visual-regressor gate |
| Full MT of `pending-translation.ts` keys | Listed, not finished |
| Full Learn body localization (all topics × 9 locales) | Pipeline only + 3×2 proof |

---

## 8. Artifact index

| Path | Contents |
|------|----------|
| `summary.json` | Combined verify run |
| `locale-smoke.json` | 9 locales + auto + en-XA |
| `cache/locale-key-unit.json` | Key segment unit cases |
| `cache/dual-context.json` | Browser context isolation |
| `perf/html-sizes.json` | Route HTML sizes |
| `perf/lab/` | Focused lab metrics + screenshots |
| `screenshots/devices/{chromium,firefox,webkit}/{desktop,tablet,phone}/` | Template shots |
| `screenshots/locales/{de,ko,ja,zh-Hans,en-XA}/` | Locale stress |
| `screenshots/webkit-retry.json` | WebKit retest results |
| `logs/` | build, verify, perf-lab, playwright-install |
| `docs/i18n-coverage.md` | Route honesty table |
| `docs/perf.md` | Perf change history |
