# PRD — Luka Dončić example profile (Basketball-Reference backbone)

**Status:** Implementation spec for a single frozen example.  
**Route:** `/internal/luka` (noindex, not in public nav).  
**Does not replace** `/players/[playerId]`.

This document is the contract for the example. Anything not listed under **Ships now** is out of scope, even if it appears in the long-form product brief.

---

## 1. Why this exists

The production player page currently tries to be a dashboard, archive, résumé, scouting report, comparison tool, and AI launcher at once. This example proves one alternative:

> **Savant Overview (immediate thesis) on a Basketball-Reference statistical backbone (auditable ledger).**

It is locked to **one player** so we can get identity, grain, and hierarchy right before generalizing.

### First screen must answer, without scrolling on a 1280×800 desktop

1. Who is this? → **Luka Dončić** (Č), headshot, PG/SG, Slovenia  
2. What am I viewing? → season + regular/playoffs + team stint vs combined + rate mode  
3. How good? → five hero rates + percentile/rank  
4. What kind of player? → official position + a **labeled, non-model** role line  
5. What changed recently? → previous-season delta on heroes + one career trend

---

## 2. Frozen identity

| Field | Value | Rule |
| --- | --- | --- |
| Canonical display name | `Luka Dončić` | Never “uka Doncic”. Search alias `Doncic` is a future production concern, not this page. |
| Pronunciation | From BRef meta (`\LOO-kuh DON-chitch\`) | Render exactly as sourced. |
| BRef player code | `doncilu01` | Only player this route may load. |
| ESPN athlete id (headshot only) | `3945274` | Headshot CDN. Not a second canonical person. |
| NBA Stats id (display only) | `1629029` | Shown as “also known as”, not a second profile. |
| Current team | Parsed from BRef meta (`Los Angeles Lakers`) | **Current** is independent of **Viewing**. |
| Jersey | Parse from BRef when present; else omit (never invent) | |
| Official position | BRef Position string (e.g. Point Guard and Shooting Guard) | Do not collapse to a single `SG` as the whole explanation. |
| Offensive role (example copy) | `Primary creator` | Editorial tag, labeled “Role (editorial)”, not a BRef column. |
| Defensive role (example copy) | `Guard / wing assignment` | Same labeling rule. |
| Draft | BRef draft sentence | Plus one sourced annotation: “Rights traded to Dallas on draft night.” Mark as **annotation**, not a BRef table field. |
| Birth | `1999-02-28`, Ljubljana, Slovenia | From `data-birth` + Born line. |

**Hard rule:** This page is one person. Do not fetch ESPN career as a second Luka. Do not list Luka as a comparable to himself.

---

## 3. Data source and grain

### Source

| Asset | URL | Use |
| --- | --- | --- |
| Player page | `https://www.basketball-reference.com/players/d/doncilu01.html` | Bio, per-game, totals, per-36, per-100, advanced, playoff twins |
| League advanced | `https://www.basketball-reference.com/leagues/NBA_{endYear}_advanced.html` | Percentile cohort for the **viewing season only** |

User-Agent stays the existing educational scraper identity. Cache in memory like `bref-scraper.ts`. Do not scrape Stathead, game logs, shot charts, or lineups for this example.

### Grain (the bug this example must not repeat)

One row = `{ player: doncilu01, season, seasonType, teamAbbr }`.

| `teamAbbr` | Meaning |
| --- | --- |
| `DAL`, `LAL`, … | **Stint only.** Counting stats for that club that season. |
| `2TM` / `3TM` / `TOT` | **Combined season.** Normalize display label to `TOT`. |

Rules:

- DAL / LAL rows **must not** carry combined-season totals.
- Combined row is the BRef `2TM`/`3TM`/`TOT` row (as published), not copied onto each stint.
- Combined is **not** a third franchise and **not** another season in career-year counts.
- Regular season tables (`per_game_stats`, `totals_stats`, `advanced`, …) never mix with `*_post` / playoff tables.
- Empty / `-` / missing BRef cells → `null`. **Never coerce to 0.**
- Do not compute a “career average” by dropping seasons. Career totals/per-game come from BRef career footer if present; otherwise omit career summary rather than inventing one.

### Rate modes

| URL `rate` | BRef table |
| --- | --- |
| `perGame` (default) | `per_game_stats` / `per_game_stats_post` |
| `totals` | `totals_stats` / `totals_stats_post` |
| `per36` | `per_minute_stats` / `per_minute_stats_post` |
| `per100` | `per_poss` / `per_poss_post` |

Advanced rates (TS%, USG%, BPM, …) always come from `advanced` / `advanced_post` and are **not** rescaled when the counting-stat mode changes. UI must say so: “Rates from BRef Advanced; counting stats follow the rate toggle.”

Every counting column visible on screen has a unit in the header (`/G`, `TOT`, `/36`, `/100`).

---

## 4. URL state (shareable)

```
/internal/luka?season=2024-25&seasonType=regular&team=TOT&rate=perGame&tab=overview
```

| Param | Values | Default |
| --- | --- | --- |
| `season` | BRef `YYYY-YY` that exists for Luka | Latest regular-season year on the page |
| `seasonType` | `regular` \| `playoffs` | `regular` |
| `team` | `TOT` or a stint abbr that exists that season | `TOT` if a combined row exists, else the only stint |
| `rate` | `perGame` \| `totals` \| `per36` \| `per100` | `perGame` |
| `tab` | `overview` \| `trends` \| `shooting` \| `all-stats` | `overview` |

Invalid combos snap to the nearest valid default (e.g. playoffs in a year with no postseason row → empty state, not regular-season numbers silently).

Sticky context bar reads and writes these params. **One** season control on the page.

---

## 5. Layout (ships now)

Chrome: existing `SportsShell`. Page atmosphere uses the **viewing** team’s brand, not current team, when they differ.

```
┌ Header ─────────────────────────────────────────────────────┐
│ [Headshot] Luka Dončić          pronunciation               │
│ Current: LAL · #77 · Active (if BRef says current team)     │
│ Viewing: 2024–25 regular season · TOT (DAL + LAL)           │
│ PG/SG · Role (editorial): Primary creator                   │
│ 6'8" · 230 lb · Age (season) · Slovenia · Exp               │
│ Draft: 2018 · Rd 1 · Pk 3 · ATL  ·  annotation: rights→DAL  │
│ Source: Basketball-Reference · Data through {parse or page scrape time} │
├ Context bar (sticky) ───────────────────────────────────────┤
│ Season | Regular/Playoffs | Team/TOT | Per game/36/100/TOT  │
│ Overview | Trends | Shooting | All Stats                    │
├ Overview (tab) ─────────────────────────────────────────────┤
│ Five hero cards (see §6)                                    │
│ Percentile profile (see §7)                                 │
│ Career trend (one metric selector)                          │
├ Trends (tab) ───────────────────────────────────────────────┤
│ Small multiples: PTS, TS%, USG%, BPM by season (TOT rows)   │
├ Shooting (tab) ─────────────────────────────────────────────┤
│ NBA Stats shot map (dots / frequency / efficiency)          │
│ Sortable zone table · season/type/team from context bar     │
├ All Stats (tab) ────────────────────────────────────────────┤
│ One sortable season ledger (see §8)                         │
└─────────────────────────────────────────────────────────────┘
```

### Explicitly not on this page

Ask DRBL, similar players, play types, on/off, lineups, game log, CPI/peak/prime, season-chip rows, repeated Compare/Rank/Ask links, DRBL-unavailable banners, radar charts, dual-axis charts.

Tabs named in the long brief except **Shooting** (now shipped with NBA Stats coordinates) are **not stubbed**. Do not ship empty marketing shells.

---

## 6. Overview — hero cards

Exactly five, always the same keys:

| Card | Counting mode | Advanced |
| --- | --- | --- |
| PTS | follows `rate` | — |
| REB | follows `rate` | — |
| AST | follows `rate` | — |
| TS% | — | BRef Advanced |
| USG% | — | BRef Advanced |

Each card shows:

- Value with unit  
- Percentile (numeric, never color-only)  
- Rank and denominator: `{rank} of {n} qualified`  
- Δ vs previous **same grain** season (combined vs combined, or same franchise stint). If no prior row: omit Δ, do not show `0`.  
- Compact definition (existing glossary keys where they exist)  
- Qualification badge: Qualified / Not qualified (raw value still shown)

If the viewing row is a **stint**, percentiles are **not** shown against full-season peers. Copy: “Percentiles use combined-season rows. Switch Team to TOT to compare.” Stint heroes still show raw values.

---

## 7. Percentile profile (Savant pattern)

Visual: Poor / Average / Great markers, gray track, **solid** blue→gray→red fill, white pip with the integer percentile, raw value on the right, dashed row rules, category icon + title.

Groups (BRef-backed only):

| Group | Metric | Direction | Source |
| --- | --- | --- | --- |
| Scoring | PTS/G (always per game for this strip, labeled) | higher | per_game combined |
| Shooting | TS% | higher | advanced |
| Creation | AST% | higher | advanced |
| Ball security | TOV% | **lower-is-better** (bar maps `100 - percentile` for fill; label still “Nth percentile of low TOV%”) | advanced |
| Rebounding | TRB% | higher | advanced |
| Impact | BPM | higher | advanced |

### Cohort (default)

- Same `season`  
- Regular season **or** playoffs matching `seasonType`  
- Combined-season grain only (league TOT/2TM if present, else the player’s only team row)  
- Qualified: `GP ≥ 20` **or** `MP ≥ 500` (totals minutes). Print the rule under the scale.  
- Rank: 1 = best given direction. Ties: min rank.  
- Show `{percentile} · {rank} of {n}`.  
- Colorblind: number is required; color is extra.

League advanced fetch for percentiles **must include** TOT/2TM rows (unlike the production `fetchBrefAdvancedSeason`, which skips them). Do not change that production skip without a separate change.

---

## 8. All Stats ledger

One table.

- Frozen first columns: Season, Team (`TOT` or abbr).  
- `seasonType` toggle is the context bar, not a second table.  
- Rate mode from context bar.  
- Combined + stints: show combined as the parent row; stints nested or immediately following with a `stint` flag (e.g. indent / “DAL”, “LAL”).  
- Career totals row only if BRef footer exists, labeled **Career (BRef)**, never “qualified-prime average.”  
- Columns (MVP preset “Traditional + Advanced”): GP, GS, MP, PTS, TRB, AST, FG%, 3P%, FT%, TS%, eFG%, USG%, TOV%, PER, BPM, VORP, WS.  
- Sortable headers. Tabular numerals.  
- Caption: source, scrape/cache time, rate unit, “stint rows are not full seasons.”  
- No per-row Ask/Compare/View season spam. Season cell is the only extra affordance: clicking a season row sets `season` + `team` and returns to Overview.

Export: not in this example (call it out in the caption as not shipped).

---

## 9. Trends

Four small multiples, combined regular-season rows only (one point per season; 2024–25 is one TOT point, not DAL+LAL+TOT). Metrics: PTS/G, TS%, USG%, BPM. X-axis: `YY-YY` season labels with readable ticks (not concatenated). Direct-label last point. No dual axis.

---

## 10. Copy and trust

- “Current” vs “Viewing” always both visible in the header.  
- “2018–19 vs prior season”, never “current season vs career” when viewing 2018–19.  
- Ordinals via `formatOrdinal` (`41st`, not `41th`).  
- No leaked Markdown.  
- No color-only meaning.  
- Missing: visible reason enum `unavailable | not-in-table | not-qualified | not-applicable` — for this scrape, use `not-in-table` when the cell is blank.  
- Data freshness: `Scraped {ISO timestamp}` from fetch time; if BRef HTML includes an update hint, show that too.

---

## 11. File map

| Path | Responsibility |
| --- | --- |
| `src/data/providers/nba/bref-player-page.ts` | Fetch + parse player HTML; optional-number parsing |
| `src/data/providers/nba/bref-scraper.ts` | Add **opt-in** TOT-inclusive league parse for percentiles only |
| `src/data/queries/luka-bref-profile.ts` | Join tables, URL defaults, ranks |
| `src/components/internal/luka-bref-profile.tsx` | Client: context bar, tabs, heroes, Savant bars, table |
| `src/app/internal/luka/page.tsx` | Server load, metadata |
| `scripts/test-bref-player-page.ts` | Assert 2024–25 DAL/LAL/TOT **totals** and GP sum; per-game stints differ (TOT PPG may equal a stint) |

---

## 12. Acceptance (this example only)

- [ ] `/internal/luka` shows **Luka Dončić**, not a truncated first letter.  
- [ ] Header Current (LAL) can disagree with Viewing (e.g. 2018–19 DAL) without mixing accent as “current.”  
- [ ] `season=2024-25&team=DAL` PTS ≠ LAL PTS ≠ TOT PTS.  
- [ ] Playoff toggle never shows regular-season numbers unlabeled.  
- [ ] Five heroes + percentile strip + one trend fit the Overview thesis.  
- [ ] No Ask block, no similar-TS% list, no second season chip row.  
- [ ] Percentile line includes rank and cohort size.  
- [ ] TOV% bar treats lower as better.  
- [ ] Blank BRef cells are not zeros.  
- [ ] Production `/players/3945274` is unchanged.

---

## 13. Later (not this PR)

Canonical ID merge (ESPN vs NBA), site-wide player card, remaining Savant tabs, tracking/on/off, export, sticky compare tray, role model, DARKO/LEBRON on this example, generalizing off `doncilu01`.
