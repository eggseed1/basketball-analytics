# Rotations and positions

## Research

- [NBA Rule 3](https://official.nba.com/rule-no-3-players-substitutes-and-coaches/) requires five players on court and defines how substitutes enter.
- [NBA analysis of Philadelphia's rotation](https://www.nba.com/news/second-unit-puts-sixers-in-deficit-they-cant-overcome) contrasts staggered starters with reserve-only units.
- [Boston's roster roles](https://www.nba.com/celtics/news/news-sidebar-preseason-2022-23-roster-breakdown-the-wings) groups players as handlers, wings and bigs.
- [NBA Finals depth analysis](https://www.nba.com/news/starting-5-june-3-2025) shows that deep playoff rotations can work too.

DRBL uses those principles, rather than assuming every coach uses one substitution template. The exact stint preferences, default playoff depth and fatigue coefficients below are simulation design choices. Five positional seats describe each unit's assignments; they do not require five different natural position labels.

## Confirmed problems

The old painter frequently alternated players every two minutes. Coaching previews, box snapshots and simulation used separate minute/depth calculations. Starter and depth edits could leave old saved blocks active. A player with a cleared injury object could be removed from a valid unit and replaced by an arbitrary reserve. Position penalties used one cover label for the entire game, even while the box assigned a different position. Overtime could use one group of players and another group's positional book.

The importer also ignored detailed positions in bundled bios when season data only gave a broad role. Team coverage rules could overwrite an explicit listing just to fill a depth-chart hole. Generated rosters could lack entire position groups and give small guards or big centers inconsistent physical profiles.

## Shared rotation plan

`rotationForTeam` compiles one regulation plan for the coaching chart, position totals, rotation snapshot and actual simulation. Every block has five unique healthy players. Budgets total 240 minutes, rounded to two-minute blocks. The chart and "Planned" minutes show that fitted result; sliders remain the requested targets.

The automatic planner anchors the opening group, second-half restart and final four minutes when budgets permit. It favors continuous stints, staggered creators and suitable positional coverage. Pair exchanges improve continuity without changing player minute totals or locked units. Common plans are cached by their actual inputs. Impossible combinations are reported rather than silently promising an unavailable closing five.

The two-minute windows are a planning approximation, not a claim that real NBA substitutions happen on a fixed clock. This engine does not model individual foul trouble. It does not invent foul-driven substitutions or dynamic garbage-time minutes.

New automatic books can tighten from more than eight players to eight in the postseason, with larger star-minute ceilings. Explicit user minute/depth plans and legacy saved books retain their chosen depth. Ten-player playoff plans remain available. The regular-season book is not overwritten by a playoff preview.

Closing selectors retain five distinct players. The same healthy closing unit and its position assignments play overtime. Stint fatigue builds after eight continuous minutes, with a bounded penalty, and resets on bench rests and quarter breaks; cumulative workload, camp fatigue and back-to-back effects still apply.

## Position handling

An explicit season listing takes priority, followed by a detailed bundled bio listing. Broad guard/forward families use size and playstyle to estimate a five-slot listing. Such estimates are not presented as authoritative NBA depth-chart positions. Unit construction uses primary and secondary positions plus creation, spacing and interior roles. A distinct five-seat cover map is honored when the unit can fill it; otherwise role fit resolves the assignments. Each player's actual time at each seat drives box-score position totals and out-of-position penalties.

Existing saves keep their ratings, potential, minute targets and valid manual blocks. Injury changes repair the nightly lineup without overwriting explicit minute targets or restoring a stale book over newer manual edits. Legacy inferred NBA positions have an opt-in review showing each proposed change. Detailed listings and saved manual primary choices stay protected. Applying corrections fits the existing starting five to their new roles and rebuilds timing, while retaining minute targets. Newly generated rosters have at least two players at each primary position and bodies appropriate to that position; existing generated saves are not rebuilt.

## Verification

`test:franchise-rotations` checks five unique players, 240 minutes, 48 per positional seat, continuous stints, preview/game identity, zero-minute reserves, cleared injuries, injured-starter repair, manual shifts, exports/reloads, playoff depth, closing units, overtime accounting, position listings and the actual starter-edit store action. Existing rotation, lineup, two-season calendar, two-summer journey, development, badge and calibration suites also run. Browser checks cover the shared chart, positional totals and saved closing choices at 390px and 1440px.
