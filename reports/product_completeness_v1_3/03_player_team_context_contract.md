# Player-team context contract

## CURRENT CONTEXT
Used for: profile current badge, search results, ASK ambiguity subtitles.
Source precedence: current-season player-season row → provider profile → latest career franchise row.

## SELECTED-SEASON CONTEXT
Used when `?season=` (or default latest) on player destination.
Source: that season's membership via `primaryTeamForSeason` (TOT preferred).

## STINT CONTEXT
Used for stint disclosure / game log rows (matchup-derived team when available).

## MULTI_TEAM_AGGREGATE_BRAND
`NEUTRAL` — no franchise logo/link/wash for TOT/2TM–4TM aggregates.
