# NBA 2K27 MyNBA community complaints: Franchise Lab coverage

Updated 2026-11-02. Scope: DRBL Franchise Lab, not the separate MyLeague implementation or 2K's on-court controller gameplay.

## Evidence and interpretation
Prioritize recurring *MyNBA/GM* complaints rather than general MyCareer/online issues. Community reports conflict on some specifics (some reviewers say standard MyNBA simulation improved, others report deflated stars); do not treat a reddit thread as a comprehensive prevalence survey. NBA 2K27's October update already addressed multiple MyNBA simulation/progression and stability issues, so reports from release week are not necessarily current.

Sources:
- https://www.reddit.com/r/NBA2k/comments/1w66aaa/2k27_mynba_has_been_extremely_disappointing_thus/
- https://www.reddit.com/r/MyNBA2k/comments/1x16jcv/can_we_please_get_the_2k_devs_to_actually_listen/
- https://www.reddit.com/r/MyNBA2k/comments/1w9p5w7/question_for_mynba_on_nba_2k27/
- https://www.reddit.com/r/NBA2k/comments/1ud3h7o/after_20_seasons_in_mygm_here_are_the_biggest/
- https://newsletter.operationsports.com/p/truth-or-lies-nba-2k27-mynba-edition
- https://www.nba2klab.com/nba2k-patch-notes/patch-notes-nba-2k27-v-2-0
- https://newsroom.2k.com/news/nbar-2k27-mynba-answers-the-community-with-a-back-to-basics-franchise-overhaul-and-modern-cba-rules

Status definitions:
- Implemented: specific capability exists in Franchise Lab code; not a blanket claim of realistic behavior.
- Tested: dedicated deterministic tests or a successful older GitHub Actions run exercise the core path.
- In verification: code or diagnostics were added; requires completed *current-commit* CI.
- Gap: no complete user-facing feature was found. Do not mark done by pointing at type definitions or docs.

| Priority | Complaint / user expectation | Franchise Lab implementation | Status / remaining acceptance |
| --- | --- | --- | --- |
| P0 | Stars fail to score or assist at real NBA rates, even with realistic team averages | Real player priors, shot selection, possessions; league-level calibration and outcome tests. New `audit-gm-star-stat-realism.ts` compares star PPG/APG/FGA/MPG individually | **In verification.** Inspect diagnostic output, then set realistic non-overfit star-leader guardrails across multiple seeds before tuning. |
| P0 | Nonsensical trades / no salary matching / trades of injured players disallowed | `trades.ts`, `roster-fit.ts`; need-based offers, salary/cash/apron guards. No blanket injury trading ban was found | **Partially tested** by `test-gm-trade-fit.ts`; long-run CPU deal frequency, draft-pick valuation and 3+/4-team execution remain gaps. |
| P0 | Stars stranded in FA / bizarre minimum contracts / broken restricted rights | FA moratorium, legal bid evaluation, Bird/RFA, market utility; new legal-bid fallback and depth-only minimum fill | **In verification.** Add 5- and 10-year unsigned 80+ OVR rate and cap-economy audits; synthetic regression now covers a rejected illegal top bid. |
| P0 | Cap/tax freezes while salaries increase in later years | `cba-registry.ts` projects cap, tax and both aprons from last official year with tapering growth; `settingsForSeason` applies thresholds | **Implemented.** Add 10+ season cap-to-payroll/unsigned-star checks. |
| P0 | Bad progression: declining MVP at 29, too many 90+ players, implausible breakout | `dynamic-progression.ts`, trait reviews, in-season checkpoints, training camps, age curves, multi-season cohort test | **Tested in isolation**, but full persistent-save aging / elite-regression cases need broadened guardrails. |
| P0 | Missing rookies / corrupted or stuck saves / season cannot advance | Save slots and serialization, guided season-flow, continuous 5-year audit, rookie contracts | **Tested**, including successful older 5-year run; latest two-seed run pending. Need backup/restore stress and interrupted-save tests. |
| P1 | Generated draft classes duplicate or favor too many old prospects | Slot-weighted 18–24 ages, unique class names, hidden sleepers and scouting | **Implemented and partly tested.** Sample 100+ classes with lottery-age/duplicate-identity assertions. |
| P1 | Records, awards, banners lose past-season history | `archiveSeason` stores season players and standings; `career-overlay.ts` shows archived simulated lines; awards history | **Implemented.** Add a five-year player-specific career-table regression and trophy display verification. |
| P1 | Replay/restore yields identical seed when user intends a new scenario | Deterministic seeded simulator and persistent saves | **By design.** Provide a clearly labeled resimulation/new-seed choice rather than silently changing results on reload. |
| P1 | Slow or frozen simulation, especially after the Cup | `stepDay`, multi-season calendar tests, Cup scheduling | **Partially tested.** Need browser end-to-end performance budget and pause/resume timing measurements on long saves. |
| P1 | Difficult offseason / cluttered menus | Guided season windows, development mentors, scouting desk, draft war room and streamlined hub | **Implemented.** User playtests for transitions, keyboard navigation and accidental progression still needed. |
| P2 | Contract buyouts are promised but hidden or missing | Waiving and dead money exist, but a negotiated player buyout / acquisition market was not found | **Gap.** Build a separate, clearly discoverable buyout window with cap accounting and postseason eligibility. |
| P2 | Sign-and-trades, 3-/4-team trade routing, 10-day contracts, Eurostash | Era CBA flags and conventional two-team trades exist, but no end-to-end screens/transactions confirmed | **Gap.** Build and test transaction operations; do not claim parity. |
| P2 | Star friendships, GM trust, staff transitions and media continuity | Role promises, morale, coaching/staff, franchise news | **Partial.** No complete friendship/dynamic duo/GM trust/retired-star-to-coach lifecycle verified. |
| Non-goal | Controller shooting indicator, multiplayer matchmaking, MyCareer VC | Different products than browser-based Franchise Lab | Not in Franchise Lab scope. |

## CI and release checks

`franchise-mynba-quality.yml` runs focused tests for legal FA offers, CPU trade fit, development, draft accessibility, save persistence, season flow, statistical calibration and outcome variance, plus a non-gating star-stat diagnostic. Other CI separately covers full calendar generation and persistent five-year leagues.

Do **not** declare simulation realism complete solely because general distribution tests pass. A 115 PPG league may still have every elite scorer at 20 PPG; evaluate individual leader distributions, player availability and team records separately.

Release gate: current-commit CI green, successful 80/82-game calendar tests, no 83-game error, no blocked offseason/rookie contracts, no illegal FA or player-rights signing, and documented historical accuracy limitations. New advanced features remain out of scope until their own acceptance tests and UI are implemented.
