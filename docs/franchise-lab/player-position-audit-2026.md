# NBA 2026–27 Franchise Lab player position audit

**2026-11-03.** All **521 real NBA players** loaded into the 2026–27 Franchise Lab roster were audited by NBA player ID. Source and confidence for each are stored in
[`src/gm/seed/nba-player-position-book-2026.json`](../../src/gm/seed/nba-player-position-book-2026.json).

The independent [Basketball-Reference 2025–26 play-by-play and five-position listings](https://www.basketball-reference.com/leagues/NBA_2026_play-by-play.html)
provide 733 player-team records (582 distinct players, all 30 teams).
The current [ESPN team depth charts](https://www.espn.com/nba/depth) provide the complementary five-slot evidence.
Of the 521 Franchise Lab players, 440 matched Basketball-Reference,
519 matched ESPN, and 439 matched both. The remaining players use the
available source or a flagged low-confidence fallback.

A season's **on-court position estimate is not always a player's natural primary position**.
We prioritize the independent five-position primary listing when supported by
meaningful positional minutes or current depth placement, while assigning
a secondary from substantial supporting usage. This prevents role utility
(e.g., a PF filling in at C) from changing the player's permanent identity.

## Boston examples

| Player | Primary | Secondary |
| --- | --- | --- |
| Jayson Tatum | PF | SF |
| Payton Pritchard | PG | SG |
| Derrick White | SG | PG |
| Paul George | SF | PF |
| Sam Hauser | PF | SF |
| Jordan Walsh | PF | SF |

Boston's full audited primary-position distribution is **3 PG, 2 SG, 4 SF,
3 PF and 5 C**. It arises from individual verified players, not a
quota that artificially promotes guards/forwards.

## Save migration and scope

The versioned position book is applied at new 2026–27 league creation,
and once on older existing Franchise Lab saves whose position book needs
updating. Manually relisted players retain their user-edited positions.
Actual lineup seats and minute-cover assignments **do not rewrite**
player-primary labels. Older historical seasons and generated fictional
prospects remain outside the 2026–27 book.

Run the [all-player position audit workflow](https://github.com/eggseed1/basketball-analytics/actions/workflows/franchise-player-positions.yml)
to export the full 521-player evidence JSON, including prior position,
proposed primary and secondary, Basketball-Reference minute percentages,
ESPN depth positions and confidence flags. The audit fails rather than using
mislabelled team workbooks or incomplete historical evidence.
