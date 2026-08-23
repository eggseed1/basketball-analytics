# Player stats catalog (inventory + target schema)

**Status:** implemented — shared registry + Statistics / Career / BRef / game-log alignment.  
**Registry:** `src/lib/player-stat-sheet-registry.ts`  
**Goal:** one consistent category set, column order, and labels across every player “excel sheet,” then align secondary surfaces to the same vocabulary.

---

## 1. Every place we show player stats

### A. Spreadsheet / board tables (primary “excel sheets”)

| # | Surface | Route / location | Component | Rate modes | Category chips (today) | Source file |
|---|---------|------------------|-----------|------------|------------------------|-------------|
| 1 | **Statistics** | `/players/[id]` · `#statistics` (overview) | `PlayerStatsBoard` via `PlayerStatsIsland` | Per game · Totals · Per 100 | All · Counting · Shooting · Rates · Advanced · Impact | `player-stats-board.tsx` |
| 2 | **Career board** | `/players/[id]` · `#career` (overview + career views) | `PlayerCareerBoard` via `PlayerCareerIsland` | Chart metric pick (not full rate modes) | All · Scoring · Shooting · Playmaking · Defense · Advanced · Impact | `player-career-board.tsx` |
| 3 | **Career season table (history depth)** | Player history / depth “full reference” | `PlayerCareerSeasonTable` via `PlayerStatDepthIsland` | Per game · Totals · Per 36 | *(none — one wide sheet)* | `player-career-season-table.tsx` |
| 4 | **BRef-style column packs** | Used by depth / internal BRef-style views | `columnsForMode()` | Per game · Totals · Per 36 · Advanced | Mode tabs, not category chips | `player-stat-views.ts` |
| 5 | **Game log** | `/players/[id]` games depth | `PlayerGameLogBoard` | Game totals only | Overview · Scoring · Shooting · Defense · Advanced | `player-game-log-board.tsx` |
| 6 | **Explore players board** | `/explore/players` | `PlayerSeasonTable` + `PLAYER_BOARD_VIEW_COLUMNS` | Season rates | View presets: all / overview / profile / shooting / impact / advanced / defense / ts | `explore-players-display.ts`, `player-season-table.tsx` |

### B. Ranking / compare (not full sheets, but same stat vocabulary)

| # | Surface | Location | Component | Categories (today) | Source |
|---|---------|----------|-----------|--------------------|--------|
| 7 | **Percentile ranking** | Player overview left rail | `PlayerPercentilePanel` | Overview · Offense · Shooting · Defense · Role · Advanced | `player-percentile-metrics.ts` |
| 8 | **Season side compare** | Career / season explorer | `PlayerSeasonSideCompare` | Flat metric list (no chips) | `player-season-side-compare.tsx` |
| 9 | **Identity recent seasons** | Player hero card | `PlayerDestinationIdentity` | Mini box: GP / MPG / PPG / RPG / APG | `player-destination-identity.tsx` |
| 10 | **Career resume / analysis** | Career view | `PlayerCareerResume` (+ analysis island) | Narrative + selected metrics | `player-career-resume.tsx` |
| 11 | **Internal Luka BRef profile** | `/internal/...` | `luka-bref-profile.tsx` | BRef-like modes | internal only |

### C. Related but out of scope for this spreadsheet pass

- Team season tables (`team-season-table.tsx`)
- Game roster / game lab boards (game-level, not career sheets)
- Offseason / trade tree (acquisition lineage, not box stats)

---

## 2. What each sheet shows today (inventory)

### 2.1 Statistics (`PlayerStatsBoard`) — richest sheet

**Identity (sticky-ish left):** Season · Age · Tm · Pos *(implied by DOM; board builds row chrome separately)*  

**Counting:** G · GS · MP · PTS · TRB · ORB · DRB · AST · STL · BLK · TOV · PF · +/-  

**Shooting:** FG · FGA · FG% · 3P · 3PA · 3P% · FT · FTA · FT% · 2P%  

**Rates:** eFG% · TS% · 3PAr · FTr · USG% · TOV% · AST% · ORB% · DRB% · TRB% · STL% · BLK%  

**Advanced:** ORtg · DRtg · NET · PIE · PER · OWS · DWS · WS · WS/48 · OBPM · DBPM · BPM · VORP  

**Impact:** DARKO · DARKO-O · DARKO-D · LEBRON · O-LEBRON · D-LEBRON · Wins added · DRBL · DRBL-O · DRBL-D · WAR1  

**Gaps vs BRef classic:** no 2P/2PA made columns (only 2P%); no ORB/DRB in shooting pack; eFG/TS live under “Rates” not “Shooting.”

### 2.2 Career board (`PlayerCareerBoard`)

**Row chrome:** Season · Tm · GP · *(selected metric columns)*  

**Metric catalog (chart + table):**  
Scoring: PTS/G · REB/G · MIN/G · ORB/G  
Playmaking: AST/G · TOV/G · AST/TOV  
Defense: DRB/G · STL/G · BLK/G  
Shooting: TS% · FG% · 2P% · 3P% · FT% · eFG% · 3PAr · FTr  
Advanced: USG% · ORtg · DRtg · NET · PER · BPM · VORP · WS  
Impact: CPI · WAR1 · DRBL/100 · DRBL-O · DRBL-D  

**Missing vs Statistics:** DARKO/LEBRON family, OWS/DWS/WS/48, OBPM/DBPM, PIE, +/- , PF, most counting made/attempted, possession rates (AST%/TOV%/…), full ORB/DRB splits in table mode.

### 2.3 Career season table (`PlayerCareerSeasonTable`)

Season · Age · Team · GP · GS · MIN · FG · FGA · FG% · 3P · 3PA · 3P% · 2P · 2PA · 2P% · FT · FTA · FT% · REB · AST · STL · BLK · TOV · PTS · eFG% · TS%  

**Missing:** PF · +/- · ORB/DRB · rates · advanced · impact. Label **MIN** vs **MP**, **GP** vs **G**, **REB** vs **TRB**.

### 2.4 BRef packs (`player-stat-views.ts`)

- **Per game / Totals / Per 36:** classic BRef counting + shooting order (FG…PTS), identity Season · Team · Pos · G · GS  
- **Advanced:** MP · PER · TS% · 3PAr · FTr · ORB%/DRB%/TRB% · AST%/STL%/BLK%/TOV% · USG% · OWS · DWS · WS · WS/48 · OBPM · DBPM · BPM · VORP · **DARKO** family · Box/OnOff DPM · **LEBRON** family · Wins added · R1 · DRBL stack  

Order differs from Statistics (BRef puts shooting before rebounds; Statistics puts counting box first).

### 2.5 Game log

Overview: MIN · PTS · AST · REB · STL · BLK · FG · 3P · +/- · TS%  
Scoring: MIN · PTS · AST · REB · TOV · +/-  
Shooting: FG · 3P · FT · eFG% · TS%  
Defense: REB · STL · BLK · +/-  
Advanced: USG% · AST% · TOV% · ORtg · DRtg · NET · GmSc · PIE  

### 2.6 Explore board views

Presets mix overview/profile/shooting/impact/advanced/defense/ts — labels and keys differ (`ppg` vs `PTS`, `darkoDpm` vs `DARKO`).

### 2.7 Percentile Overview (related)

Value: DRBL/100 · WAR1 · DRBL O/D · DARKO · LEBRON · Wins added  
Offense / Shooting / Defense / Role / Advanced: long-form labels (not sheet abbreviations).

---

## 3. Inconsistencies to fix (why sheets feel different)

| Issue | Examples |
|-------|----------|
| **Category names** | Statistics: Counting/Rates · Career: Scoring/Playmaking · Game log: Overview · Percentile: Overview/Offense/Role |
| **Labels** | G vs GP · MP vs MIN · TRB vs REB · DRBL vs DRBL/100 · DPM vs DARKO |
| **Column order** | BRef = shooting then box · Statistics = box then shooting · Career table = shooting then box |
| **What’s in “Advanced”** | Sometimes rates (USG%) · sometimes box+ · sometimes impact |
| **Impact coverage** | Full on Statistics · partial on Career · none on career season table |
| **2P** | Made/attempted on career season table · % only on Statistics |
| **Rate modes** | Statistics: per100 · Career season: per36 · BRef: both patterns |

---

## 4. Target schema — one category model for all player excel sheets

Use these **category chips** everywhere a sheet filters columns:

1. **All**  
2. **Counting** — volume / box score (scales with rate mode)  
3. **Shooting** — makes, attempts, percentages  
4. **Rates** — possession / share / efficiency rates (do not scale with per-game/totals the same way)  
5. **Advanced** — ratings, win shares, BPM family, PIE  
6. **Impact** — DRBL, DARKO, LEBRON, WAR1 / Wins added  

**Rate modes (season sheets only):**

| Mode | Applies to | Notes |
|------|------------|--------|
| Per game | Counting (+ shooting makes/attempts) | Default |
| Totals | Counting (+ shooting makes/attempts) | |
| Per 36 | Counting (+ shooting makes/attempts) | Prefer over inventing a second “per 100” for history when possessions weak |
| Per 100 | Counting when possessions reliable | Statistics board; hide or disable when estimate poor |

Percentages, rates, advanced, impact: **never** rescale with the rate toggle.

**Identity columns (always leftmost, all season sheets):**

`Season · Age · Tm · Pos · G · GS`

(Game log uses `Date · Opp` instead of Season/Age/Tm/Pos/G/GS.)

---

## 5. Comprehensive target column list (canonical order)

IDs are proposed stable keys for a shared registry. Labels are the **sheet abbreviations** (percentile UI can keep long names).

### 5.1 Identity

| ID | Label | Notes |
|----|-------|--------|
| season | Season | |
| age | Age | |
| tm | Tm | Multi-team → TOT / 2TM |
| pos | Pos | |
| g | G | Prefer **G** over GP |
| gs | GS | |

### 5.2 Counting

| ID | Label | Notes |
|----|-------|--------|
| mp | MP | Prefer **MP** over MIN |
| pts | PTS | |
| trb | TRB | Prefer **TRB** over REB |
| orb | ORB | |
| drb | DRB | |
| ast | AST | |
| stl | STL | |
| blk | BLK | |
| tov | TOV | |
| pf | PF | |
| plusMinus | +/- | |

### 5.3 Shooting

| ID | Label | Notes |
|----|-------|--------|
| fg | FG | |
| fga | FGA | |
| fgPct | FG% | |
| fg3 | 3P | |
| fg3a | 3PA | |
| fg3Pct | 3P% | |
| fg2 | 2P | |
| fg2a | 2PA | |
| fg2Pct | 2P% | |
| ft | FT | |
| fta | FTA | |
| ftPct | FT% | |
| efg | eFG% | Keep with shooting (move out of “Rates”) |
| ts | TS% | Keep with shooting |

### 5.4 Rates

| ID | Label | Notes |
|----|-------|--------|
| threePar | 3PAr | |
| ftr | FTr | |
| usg | USG% | |
| tovPct | TOV% | |
| astPct | AST% | |
| orbPct | ORB% | |
| drbPct | DRB% | |
| trbPct | TRB% | |
| stlPct | STL% | |
| blkPct | BLK% | |
| atr | AST/TO | Optional; useful on Career/Explore |

### 5.5 Advanced

| ID | Label | Notes |
|----|-------|--------|
| ortg | ORtg | |
| drtg | DRtg | Lower better |
| net | NET | |
| pie | PIE | |
| per | PER | |
| ows | OWS | |
| dws | DWS | |
| ws | WS | |
| ws48 | WS/48 | |
| obpm | OBPM | |
| dbpm | DBPM | |
| bpm | BPM | |
| vorp | VORP | |
| gmSc | GmSc | Game log only (game-level) |

### 5.6 Impact

| ID | Label | Notes |
|----|-------|--------|
| darko | DARKO | Prefer live `darkoDpm`, else non-zero `dpm` |
| darkoOff | DARKO-O | |
| darkoDef | DARKO-D | |
| lebron | LEBRON | |
| oLebron | O-LEBRON | |
| dLebron | D-LEBRON | |
| winsAdded | Wins added | LEBRON wins |
| war1 | WAR1 | DRBL R1 win equivalents |
| drbl100 | DRBL | Sheet label **DRBL**; long form DRBL/100 in percentile |
| drblO | DRBL-O | |
| drblD | DRBL-D | |
| drblP | DRBL-P | Optional depth / advanced impact |
| drblLn | DRBL-LN | Optional |
| drblB | DRBL-B | Optional |
| cpi | CPI | Internal career index — Career board only unless promoted |

**Optional / secondary (Advanced or Impact depth, not default All):**

| ID | Label | Notes |
|----|-------|--------|
| boxDpm | Box DPM | DARKO component |
| onOffDpm | On/Off DPM | DARKO component |
| r1Points | R1 Points | DRBL |
| sdv100 | SDV | Shot-decision (when present) |
| shotMaking100 | Shot-making | When present |

---

## 6. Per-surface application of the catalog

| Surface | Show identity | Counting | Shooting | Rates | Advanced | Impact | Notes |
|---------|---------------|----------|----------|-------|----------|--------|-------|
| **Statistics** | ✓ | Full | Full (add 2P/2PA) | Full | Full | Full core | Move eFG/TS → Shooting; keep category chips |
| **Career board** | Season · Tm · G | As selected metrics (PTS/TRB/… per game) | Selected % | USG + ATR | Core advanced | DRBL + DARKO + LEBRON + WAR1 | Align labels to catalog; add missing impact |
| **Career season table** | ✓ | Full counting | Full shooting | eFG/TS already; add rate pack optional | Optional later | Optional later | Rename MIN→MP, GP→G, REB→TRB; add ORB/DRB/PF/+/- |
| **BRef packs** | ✓ | Match Counting+Shooting order | Same | Advanced mode includes Rates+Advanced+Impact | Same registry | Same | Single registry drives these arrays |
| **Game log** | Date · Opp | Subset by chip | Subset | — | Subset + GmSc | — | Map chips to same names (Overview ≈ Counting+light shooting) |
| **Explore** | Player · Tm · Season | View presets from same IDs | Same | Same | Same | Same | Stop inventing parallel key names long-term |
| **Percentile** | n/a | Same metrics, long labels | Same | Same | Same | Same | Categories can stay Overview/Offense/… but map to sheet IDs |

---

## 7. Proposed unified category chip labels (copy)

Use everywhere sheets filter:

- **All**
- **Counting**
- **Shooting**
- **Rates**
- **Advanced**
- **Impact**

Deprecate / remap:

| Old | New |
|-----|-----|
| Scoring (career) | Counting (volume) + chart shortcuts |
| Playmaking | Counting (AST/TOV) + Rates (AST%/TOV%/AST/TO) |
| Defense (career chip) | Counting (STL/BLK/DRB) — keep as Explore/Game-log *view*, not a sheet category |
| Overview (percentile) | Impact + headline value metrics |
| Offense (percentile) | Not a sheet category; maps to Counting/Rates/Advanced offense metrics |

---

## 8. Default “All” column order (season excel sheets)

Exact left→right for **All** on Statistics / Career season / BRef per-game:

1. Identity: Season · Age · Tm · Pos · G · GS  
2. Counting: MP · PTS · TRB · ORB · DRB · AST · STL · BLK · TOV · PF · +/-  
3. Shooting: FG · FGA · FG% · 3P · 3PA · 3P% · 2P · 2PA · 2P% · FT · FTA · FT% · eFG% · TS%  
4. Rates: 3PAr · FTr · USG% · TOV% · AST% · ORB% · DRB% · TRB% · STL% · BLK%  
5. Advanced: ORtg · DRtg · NET · PIE · PER · OWS · DWS · WS · WS/48 · OBPM · DBPM · BPM · VORP  
6. Impact: DARKO · DARKO-O · DARKO-D · LEBRON · O-LEBRON · D-LEBRON · Wins added · WAR1 · DRBL · DRBL-O · DRBL-D  

Omit columns when data is missing for the whole career (don’t show a blank DARKO column for pre-coverage eras if every cell is empty).

---

## 9. Implementation plan (after approval)

1. **Shared registry** — e.g. `src/lib/player-stat-sheet-registry.ts` with categories, IDs, labels, formatters, scale rules.  
2. **Wire Statistics** to registry (source of truth for widest sheet).  
3. **Align Career season table** labels/order + add ORB/DRB/PF/+/- / 2P pack.  
4. **Align Career board** metric ids/labels + add DARKO/LEBRON.  
5. **Drive BRef packs** from registry.  
6. **Game log + Explore** — label/order pass only (subset views).  
7. **Percentile** — map ids to registry; no sheet rewrite required.

---

## 10. Decisions taken

1. **Per 36 vs Per 100** — Statistics keeps Per 100; Career history keeps Per 36 (blocked Per 100 until possession denom validated).  
2. **CPI** — Career board Impact only.  
3. **DRBL-P / LN / B** and Box/OnOff DPM — not in default sheet Impact (optional later).  
4. **Game log “Overview”** — kept as curated preset; labels aligned (MP, TRB).
