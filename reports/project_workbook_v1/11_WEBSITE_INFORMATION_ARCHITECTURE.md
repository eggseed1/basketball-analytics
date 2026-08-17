# 11 — Website Information Architecture

**Authority:** `src/components/sports/site-nav.ts` (`PRIMARY_NAV`)  
**Design preservation:** `supporting_reports/integration/07_ui_design_preservation.md` → `WEB_DESIGN_INTENT_PRESERVED = YES`

## Primary domains

| Nav id | Label | Entry href | Notes |
|---|---|---|---|
| home | Home | `/` | |
| ask | ASK DRBL | `/ask` | Prominent |
| games | Games | `/scores` | Sub: Scores, Schedule query, Explore games |
| players | Players | `/explore/players` | Leaderboard; destinations `/players/[playerId]` |
| teams | Teams | `/explore/teams` | Standings + team destinations |
| compare | Compare | `/compare` | |
| transactions | Transactions | `/offseason` | |
| learn | Learn | `/learn` | Includes `/learn/drbl` |
| history | History | `/history` | Time Machine + `/franchises` |

## Progressive destinations

- Player pages: progressive islands / sports-card language (web IA) with DRBL overlay when identity join succeeds  
- Team pages: ESPN athlete board roster path; soft budgets / health banners  
- Explore players: board resilience (`getFilteredPlayerSeasonsDetailed`), `DrblSeasonSupportNotice`, DRBL/100 + R1 sort keys  

## Secondary / sandbox

GM routes under `/gm/**` (roster, lineup, draft, cap, etc.) — product sandbox; not canonical research surface.

## Analytics vs web ownership (post-merge)

- **Analytics owns:** metric meaning, seals, historical support, precomputed DRBL  
- **Web owns:** visual IA, ASK, progressive destinations, resilience UX  
- **Hybrids:** explore board + DRBL columns, Detailed overlay, provider Vercel fallback, compute-advanced data-truth  

## Metric education

Canonical plain-language copy: `/learn/drbl` + glossary entries in `src/lib/stat-glossary.ts`.
