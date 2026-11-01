# Draft room research and design

Research date: November 1, 2026. These sources describe specific editions, not one shared system across all five series. The gameplay below is an NBA adaptation; football positions, baseball signing bonuses and hockey development leagues do not transfer directly.

## What is useful from each series

| Series and evidence | Useful mechanism | Franchise Lab adaptation |
| --- | --- | --- |
| [Madden 22 scouting deep dive](https://www.ea.com/able/news/gridiron-notes-madden-22-scouting-update-deep-dive) and [Madden 26 franchise report](https://www.ea.com/games/madden-nfl/madden-nfl-26/news/madden-26-gridiron-notes-franchise-deep-dive) | Specialist staff, separate information sources, early preparation and limited focused visits. Mock position is distinct from talent evaluation. | A finite research budget, focused film and workouts, separate consensus and personal boards, and saved reports. The user chooses which uncertainty to investigate. |
| [2K21 official release](https://newsroom.2k.com/news/everything-is-game-the-next-generation-of-nbar-2k21-now-available-worldwide) and [2K27 official MyNBA announcement](https://newsroom.2k.com/news/nbar-2k27-mynba-answers-the-community-with-a-back-to-basics-franchise-overhaul-and-modern-cba-rules) | Variable growth outcomes and long franchise continuity; broader asset trading and modern roster constraints. | Current readiness and future projection stay separate. A draft pick is the beginning of development. Trade proposals must survive a fresh ownership, salary and pick-legality check. The release announcement verifies boom/bust support; it does not specify the exact probability formula used here. |
| [MLB The Show 26 official manual](https://mlb26.manual.theshow.com/en/franchise-3.html) | Scouts differ at discovery and accurate evaluation. Mature contributors and raw prospects are different roster-building choices. Plans are set before draft day. | Role-specific rankings, public amateur production, costly private workouts and interviews. An older shooter can be the better selection for a contender; a rebuilding team can accept a longer development runway. NBA rookie contracts replace baseball bonus negotiations. |
| [NHL 19 official manual](https://eaassets-a.akamaihd.net/eahelp/manuals/nhl-19-xbox1-en-gb.pdf) and [NHL 25 franchise deep dive](https://www.ea.com/games/nhl/nhl-25/news/franchise-blog) | Scouting takes resources, specialists have different strengths, and development can be directed toward a role. | More evidence reduces uncertainty without eliminating it. Skill focus and the development plan matter; minutes alone do not guarantee growth. No NHL-specific accuracy bars or guaranteed gem label are presented as NBA rules. |

## Real front offices

- [Denver's scouting staff](https://www.nba.com/nuggets/news/the-nuggets-2026-nba-draft-philosophy) describes multi-year evaluation, film, workouts, interviews and conversations about which picks are available.
- [Dallas on Brunson](https://www.nba.com/mavs/jalen-brunson-is-proving-this-mavs-rookie-class-consists-of-two-first-round-talents-not-just-one) emphasizes preparation, leadership and interview evidence.
- [FIBA's retrospective Jokic scouting report](https://www.fiba.basketball/en/news/heritage-when-nikola-jokic-was-an-unknown) illustrates why passing, timing and feel can matter when athletic measurements are ordinary. It is retrospective evidence, not a reliable formula for identifying the next MVP.
- The [NBA's CBA 101](https://cms.nba.com/wp-content/uploads/sites/4/2024/11/2024-25-CBA-101.pdf) separates draft rights from signed contracts, salary-matching rules and apron restrictions. The [NBA Constitution](https://ak-static-int.nba.com/wp-content/uploads/sites/3/2015/12/NBA-Constitution-and-By-Laws.pdf) provides the consecutive-future-first-round rule. Historical caps and the existing game engine remain simplified.

The inference for this game is that finding a gem should require identifying an overlooked, translatable skill and providing a viable development environment. A special codename, a hidden ceiling read by the CPU, or a guaranteed superstar badge on draft night should not solve the class.

## Baseline audit

Fifty generated 60-player classes had a mean incoming overall of 71.3, a mean best rookie of 85.7, and 3.48 players at 80 or above per class. On the existing league scale, that makes too many rookies immediate high-level starters. The old progression then adds only small increments to most players.

Other observed issues: CPU draft scoring reads hidden potential and ceiling; the public mock is sorted using the user's scout grades; the manual Scout look has no resource limit; automatic pick advancement can skip trade-up opportunities; old trade application accepts mutable slot positions without validating the full live package; and a selection removes all of a team's current first-round assets instead of consuming the exact pick.

## Intended player strategies

| Strategy | Evidence to investigate | Tradeoff |
| --- | --- | --- |
| Add a rotation shooter | Three-point volume, free throws, shooting film and a private workout | A useful specialist can have less creation or star upside. |
| Find a lead guard | Assists relative to turnovers, passing decisions, creation film | Production can depend on competition and offensive role. |
| Build around an existing star | Complementary passing, shooting and defensive tools | The best fit is not automatically the biggest name on the consensus board. |
| Invest in a raw prospect | Age, translatable skills, preparation and a realistic practice/rotation plan | Development takes time and can stall. |
| Trade down for a tier | Several acceptable players near the pick, future assets and market ranges | A target can be selected before the new slot. |
| Trade up for a specific job | A target's projected range, the next clubs' needs and the cost of moving | The partner can prefer its own target or reject an illegal or insufficient package. |

## Design constraints

- Consensus, the user's board and the CPU's evaluation are distinct. Scouting the same player cannot move the public market or reveal the hidden development roll.
- Film, analytics, workouts, interviews and medical reviews answer different questions. Repeating a completed assignment cannot reroll a favorable report or farm confidence. Reports and spending survive reload.
- Draft-night time advances explicitly. A user selection does not skip the next opportunities to trade. Full delegation remains available.
- Trade packages are checked again at execution, including duplicate assets, ownership, elapsed picks, future firsts, frozen picks and veteran salary. Current-draft slots represent draft-night selection rights; future-pick constraints apply to future draft years. This is a compressed transaction model, not a complete implementation of conditional conveyances.
- Generated rookies use the existing league's rating scale, with polished specialists, developmental players and rare exceptional entrants. No existing real player is retroactively rerated.
- Development uses finite headroom, age, staff, work habits, training focus and opportunity. Benching a young player does not erase all development; playing 40 minutes is not an unlimited XP exploit. Long-run cohort checks must watch both star supply and replacement-level depth.

The implemented behavior and measured validation belong in the PR description and tests. This document distinguishes the design from the source material and records the baseline rather than treating another game's marketing copy as a simulation specification.

## Calibration after the overhaul

The 100-class check follows 6,000 generated prospects through age 28 with 22 minutes per game, ordinary coaching, two in-season check-ins and summer progression. It measures the model under equal opportunity, not the probability of an actual NBA career. The average first consensus prospect enters at 74.7 OVR and reaches 86.0; second-round prospects enter at 64.6 and reach 69.0. About 16.4% of second-round prospects reach 74, 1.0% reach 85 and 0.07% reach 90 in this check. Maximum entry rating is 81. Scouting cannot read the hidden development path behind those outcomes.

A separate rolling population adds 40 annual classes, retains 450 players, limits major rotation jobs to 240, provides practice opportunities for reserves and removes players at age 37. Its mature decade stays between 74.8 and 75.5 mean OVR, with 38–45 players at 85+ and 5–9 at 90+. This isolates talent supply, opportunity and decline; it does not simulate contracts, injuries, schedules or playoff minutes.

First-round selections receive a cap-scaled four-year rookie structure; second-rounders receive two years. Future pick books cover seven drafts and preserve known debts during migration. The transaction model blocks unresolved swaps and frozen picks. Full conditional-pick rollover, detailed rookie option election dates, multi-team draft trades and a separate G League development schedule remain outside this implementation.
