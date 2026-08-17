# Basketball Analytics — ChatGPT Workbook

> Paste this into ChatGPT (or attach it) when asking for help with this repo.
> It describes **what the site does**, **how it is built**, and **where to change things**.
>
> Repo: `basketball-analytics` · Stack: Next.js 16 App Router · React 19 · TypeScript · Tailwind 4  
> Primary path alias: `@/` → `src/`

---

## 0. Product thesis (read this first)

This is an **NBA analytics site for analytics nerds that stays understandable for casual fans**.

Design goals:

- Lead with **interesting recent information** (home desk), not a blank “today” calendar.
- Prefer **advanced stats** (TS%, USG%, DARKO, LEBRON, differentials, percentiles) explained in plain language.
- Keep UI **sleek and calm** — not a dense Fantasy-style dashboard of cards everywhere.
- Separate **live ESPN-backed browsing** from **historical** (BallDontLie) and from **Franchise Lab** (GM sim).

Copy preference: avoid em dashes in user-facing text.

---

## 1. Mental model (how the app is layered)

```
External APIs / HTML / CSV
        │
        ▼
 Transformers   (src/data/transformers/*)
        │
        ▼
 Canonical types (src/data/types/*)
        │
        ▼
 Providers       (src/data/providers/*)
        │
        ▼
 Queries         (src/data/queries/*)   ← pages call THESE
        │
        ▼
 UI pages/components (src/app/*, src/components/*)
```

**Rules that keep the codebase coherent:**

1. **UI never speaks ESPN/BDL field names.** Only canonical types.
2. **Pages call queries**, not providers (and usually not `fetch` to `/api` from server pages).
3. **Filter once** in the query / `filter-utils` layer. Charts and tables consume the same array.
4. **Percentages are fractions** in `[0, 1]` (e.g. `0.582`). Format for display in `src/lib/format.ts` / explainers.
5. **Season strings are canonical `YYYY-YY`** (e.g. `2025-26`). ESPN uses the *ending* year; BallDontLie uses the *start* year.

Related deep docs:

- `docs/data-architecture.md` — data contracts
- `docs/PRODUCT_ROADMAP.md` — vision audit + phased expansion plan
- `docs/myleague-architecture.md` / `docs/myleague-season-flow.md` — GM sim

---

## 2. Stack & runbook

| Piece | Choice |
| --- | --- |
| Framework | Next.js **16.3** (App Router) — APIs differ from older Next; see `AGENTS.md` / `node_modules/next/dist/docs/` |
| UI | React 19, Tailwind 4, shadcn-style components on **Base UI** (`@base-ui/react`) |
| Charts | Recharts |
| GM state | Zustand + `idb-keyval` (browser persistence) |
| Brand assets | `src/lib/nba-brand.ts`, `src/components/brand/*` |

```bash
npm run dev          # http://localhost:3000
npm run build
npm run lint

# optional smoke / prefetch (need env for historical)
npm run smoke:nba
npm run prefetch:historical
```

### Env (`.env.example` / `.env.local`)

```bash
DATA_PROVIDER=nba              # nba | local
BALLDONTLIE_API_KEY=           # required for deep historical games/stats
```

---

## 3. Site map (routes users see)

Nav lives in `src/components/sports/sports-shell.tsx` (Home, Gamefeed, Standings, Games, Leaderboard, Teams, Stats, Franchises, + GM mode).

| Route | Nav label | What it does |
| --- | --- | --- |
| `/` | Home | Week/upcoming strip, watchlist, analytics news, standings peek, top performers |
| `/scores` | Gamefeed | Upcoming / week / month schedule from ESPN |
| `/standings` | Standings | East/West tables |
| `/explore/players` | Leaderboard | Filterable / sortable player-season board |
| `/explore/teams` | Teams | Team efficiency board + “Jump to roster” logo grid |
| `/explore/games` | Games | Historical/season game explorer (defaults toward classic eras) |
| `/players/[playerId]` | (from links) | Bio, career, game log, percentile panel + similar players |
| `/games/[gameId]` | (from links) | Box score |
| `/learn`, `/learn/[slug]` | Stats | Plain-language advanced-stat guides |
| `/franchises`, `/franchises/[id]` | Franchises | Curated all-time franchise history (not live ESPN) |
| `/gm/*` | GM mode | Franchise Lab simulation (separate subsystem under `src/gm/`) |

API routes under `src/app/api/` exist for players, teams, games, search, historical, impact (DARKO/LEBRON), stats, and GM league — primarily for scripts/clients; server pages prefer queries.

---

## 4. Feature workbook (what exists & how it was built)

### 4.1 Home desk (`/`)

**Files:** `src/app/page.tsx`, `src/components/home/*`, `src/data/queries/home.ts`

| Block | Behavior | Built with |
| --- | --- | --- |
| Week / Upcoming strip | If this Sun–Sat week has games, show them; else show next tip-offs. Cards can show **starter fives** (headshots + hover names). | `getHomeWeekStripSummaries` → `fetchHomeWeekStrip` + `attachStartersToGames` (`starters-client.ts`: depth charts for scheduled, boxscore for live/final) |
| Watchlist | Client-only favorites (players/teams) in `localStorage` key `ba-watchlist-v1`; modal search hits `/api/search`. | `watchlist-panel.tsx` |
| Analytics desk | Scraped/aggregated analytics-leaning news. | `insights/analytics-news.ts` |
| Standings peek | Compact East/West. | `home-standings-panel.tsx` |
| Top performers | Toggle DARKO / TS% / USG leaders. | `top-performers-panel.tsx` + `getHomeAnalytics` |

**Season note:** home uses **stats season** via `currentNbaStartYear()` (flips in October). The strip’s “upcoming” path may load the **schedule season** via scoreboard helpers when the current week is empty.

---

### 4.2 Gamefeed (`/scores`)

**Files:** `src/app/scores/page.tsx`, `src/components/sports/gamefeed.tsx`, `game-score-card.tsx`, `src/data/providers/nba/scoreboard-client.ts`, `src/data/queries/games.ts`

| View | URL | Data |
| --- | --- | --- |
| List (default) | `?view=list` | Upcoming tip-offs from **monthly ESPN scoreboards** (fast). Paginated (~60 per page) with `?after=` / `?afterId=` “Show more”. Lightweight `GameMatchupRow` (server `<img>` logos) to keep SSR fast. |
| Week | `?view=week&week=YYYY-MM-DD` | Sun–Sat slate |
| Month | `?view=month&month=YYYY-MM` | Calendar grid |

**Performance lesson (important):** A full 30-team schedule scrape (preseason + regular) made list SSR ~4s and rendered 1,200+ cards. It was replaced with **monthly scoreboards + pagination + lighter rows**. Do not reintroduce unbounded scrapes on the hot path.

**Season helper:** `upcomingScheduleSeason()` — in Jul–Sep, targets the *next* fall campaign (e.g. Aug 2026 → `2026-27`) so the feed is not stuck on a finished season label.

Also shows a short “Latest results” strip of recent finals.

---

### 4.3 Standings (`/standings`)

**Files:** `src/app/standings/page.tsx`, standings components, `queries/standings.ts`, `nba/standings-client.ts`

ESPN standings → East/West conference tables (W/L, GB, margin, etc.).

---

### 4.4 Leaderboard (`/explore/players`)

**Files:** `src/app/explore/players/page.tsx`, `player-filter-toolbar.tsx`, `player-season-table.tsx`, `queries/players.ts`, `lib/player-season-sort.ts`, `lib/search-params.ts`

- Filters (URL-driven): season, team, position, minimum minutes, player name.
- Team dropdown: **logo + full name**, grouped into **Eastern / Western Conference** when both conferences are well represented.
- Table: sortable player-season metrics; optional `?sort=` from URL.
- The big “Teams” logo-circle box was **removed** from this page (redundant with the team filter). Team circles remain on **Teams** explore as “Jump to roster”.

Team filter values use ESPN **team id** (`Team.id`), matching `PlayerSeason.teamId`.

---

### 4.5 Teams explore (`/explore/teams`)

**Files:** `explore/teams/page.tsx`, `team-season-table.tsx`, `team-season-toolbar.tsx`, `queries/team-seasons.ts`, `browse-circles.tsx`

- Season toolbar + efficiency board (point differential, TS%, eFG%, …); conference chips.
- **Jump to roster:** logo grid of **all 30** teams (`ALL_TEAM_ABBRS` in `nba-brand.ts`) → `/explore/players?team={ABBR}`  
  Note: leaderboard filter matching is primarily by **team id**; abbr query params may need resolution if used from this jump link.

---

### 4.6 Games explore (`/explore/games`)

**Files:** `explore/games/page.tsx`, game filter/table/scatter, `decade-chips.tsx`

Historical-friendly explorer: decade chips, filters, score cards, scoring scatter. Prefers classic seasons when no season is selected. Deep history needs `BALLDONTLIE_API_KEY` (+ optional prefetch caches under `data/cache/games/`).

---

### 4.7 Player profile (`/players/[playerId]`)

**Files:** `players/[playerId]/page.tsx`, `player-percentile-panel.tsx`, `lib/player-stat-comps.ts`, bio helpers in `nba/athlete-bio.ts`

- Bio from ESPN athlete profile (height, weight, draft, college, …).
- Career seasons + game log.
- **Percentile panel:** categories (Value / Offense / Shooting / Defense / Advanced) with grade labels; season timeline.
- **Similar players:** comps for a selected metric (league peers / historical / career-oriented modes via `findSimilarForMetric`).
- Usage / board merges: career stats merged with season leaderboard rows where needed (`mergeCareerWithBoard` in `nba-data-provider.ts`).

---

### 4.8 Learn / Stats guides

**Files:** `src/content/stats/guides.ts`, `src/app/learn/**`, guide view components

Content-driven explanations of advanced metrics (impact, efficiency, possession, team context). Keep language accessible.

---

### 4.9 Franchises

**Files:** `src/data/franchises/history.ts`, `queries/franchises.ts`, `app/franchises/**`

Curated all-time scrapbooks (titles, lore, records) — **not** live season stats. Continuous franchises keep relocated history (e.g. OKC includes Seattle).

---

### 4.10 Franchise Lab / GM (`/gm/*`)

**Files:** entire `src/gm/` tree + `src/app/gm/**`

Original dynasty/analytics GM (not a ZenGM fork). Client Zustand store, optional IndexedDB persistence, can seed from real NBA rosters/schedules. Phases: season simulation, draft, free agency, cap, trades, medical, staff, etc.

Treat this as a **separate product module** sharing brand + some data seeds with the analytics site.

---

## 5. Data sources cheat sheet

| Source | Role | Entry points |
| --- | --- | --- |
| ESPN Site API | Live scoreboard, schedules, teams, careers, gamelogs, standings, depth charts, box summaries | `nba-data-provider.ts`, `espn-client.ts`, `scoreboard-client.ts`, `starters-client.ts`, `standings-client.ts` |
| BallDontLie | Historical games/stats (~1960+) | `balldontlie/client.ts`, `historical-nba-service.ts` |
| darko.app scrape | DPM leaderboard | `impact/darko-client.ts` |
| LEBRON CSV / seed | Impact ratings | `data/impact/lebron.csv`, `impact/lebron-store.ts` |
| Analytics news | Home desk articles | `insights/analytics-news.ts` |
| Local sample | Offline `DATA_PROVIDER=local` | `local-data-provider.ts` |

Provider switch: `getDataProvider()` in `src/data/providers/index.ts`.

---

## 6. Season math (easy to get wrong)

| Helper | Meaning |
| --- | --- |
| Canonical | `"2026-27"` |
| ESPN year | Ending year → `2027` for `2026-27` (`espnYearFromCanonicalSeason`) |
| Start year / BDL | `2026` for `2026-27` |
| `currentNbaStartYear()` | Stats “current” season; flips in **October** |
| `upcomingScheduleSeason()` | Schedule feed season; in **Jul–Sep** points at the upcoming fall campaign |

Date window helper: `seasonDateBounds` / `isDateInSeason` in `nba/season-window.ts` (~Oct 1 – Jun 30).

---

## 7. UI / component conventions

- Layout chrome: `site-shell`, `sports-card`, tokens in `globals.css`.
- Team logos / headshots: `TeamLogo`, `PlayerHeadshot` (client components with fallbacks). Dense lists should prefer **server-safe** static `<img>` marks (see `GameMatchupRow`) to avoid thousands of client islands.
- Filters: client toolbars + `useTransition` + `router.replace` preserving other query params.
- Branding helpers: `TEAM_BRANDS`, `ALL_TEAM_ABBRS`, `resolveTeamBrand`, `teamLogoUrl` in `lib/nba-brand.ts`.
- Prefer calm sports UI; avoid generic purple AI aesthetics / card spam on marketing-like surfaces (home).

---

## 8. Where to edit (quick index)

| Want to change… | Start here |
| --- | --- |
| Global nav / search | `src/components/sports/sports-shell.tsx` |
| Home layout | `src/app/page.tsx`, `src/components/home/*` |
| Starters on cards | `src/data/providers/nba/starters-client.ts`, `game-score-card.tsx` |
| Gamefeed views / speed | `scoreboard-client.ts`, `scores/page.tsx`, `gamefeed.tsx` |
| Leaderboard filters | `player-filter-toolbar.tsx`, `filter-utils.ts` |
| Team logo grids | `browse-circles.tsx`, `ALL_TEAM_ABBRS` in `nba-brand.ts` |
| Player percentiles / comps | `player-percentile-panel.tsx`, `lib/player-stat-comps.ts` |
| Stat explainers | `src/content/stats/guides.ts` |
| Canonical types | `src/data/types/*` |
| New external API | transformer → provider method → query → page |
| GM sim | `src/gm/**` |

---

## 9. Known pitfalls / decisions

1. **Don’t scrape all team schedules on every Gamefeed list render** — use monthly scoreboards + pagination.
2. **Stats season ≠ schedule season in summer** — use the right helper for the surface.
3. **Team filter id vs abbr** — leaderboard filter matches `PlayerSeason.teamId` (ESPN id). Logo jumps that pass `?team=BOS` may not filter until resolved to id.
4. **Next 16** — do not assume Next 13/14 App Router docs; check local Next docs under `node_modules/next/dist/docs/`.
5. **ZenGM is not open source** — Franchise Lab is an original analytics-native GM, genre-inspired only.
6. **`.next/` build artifacts** should stay out of git; don’t treat them as source.

---

## 10. Suggested ChatGPT prompt starter

When you attach this workbook, you can say:

> You are helping me build on the Basketball Analytics Next.js site described in WORKBOOK.md. Follow the layered architecture (transformers → types → providers → queries → UI). Prefer editing queries/components over calling ESPN from pages. Match existing patterns and keep advanced stats accessible. Ask which surface I’m changing if unclear: Home, Gamefeed, Leaderboard, Player page, Teams, Games explore, Learn, Franchises, or GM.

---

## 11. Snapshot of “this branch” capabilities

As of the workbook authoring date, the living tree includes:

- Home desk with upcoming/week games, **starter-five** previews, watchlist, news, standings, impact/efficiency leaders  
- Gamefeed with list/week/month, **fast paginated** upcoming list, schedule-season awareness  
- Leaderboard with conference-aware team select (logo + name), no redundant teams box  
- Teams explore with full 30-team jump grid + efficiency table  
- Player pages with percentiles + similar comps + ESPN bios  
- Historical games explore + BallDontLie/historical pipeline  
- Learn guides, franchise histories, Franchise Lab GM  

Use §4–§8 when implementing or debugging; use §9 when proposing refactors.
