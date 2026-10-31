# Franchise Lab season journey

Research and implementation notes, October 31, 2026.

## What carries over from 2K

MyLEAGUE is the customization sandbox; MyGM adds front-office relationships and obligations. MyNBA combined those features on the newer console generation. The useful structure for Franchise Lab is an annual sequence of decision windows with selectable automation. Calendar simulation should stop when a club needs an answer.

The sources describe different editions and online/offline modes. They do not establish one identical menu order across all versions. This implementation adapts their structure to Franchise Lab's existing possession engine and browser saves.

| Evidence | Product implication | Source |
| --- | --- | --- |
| The 2K21 producer describes merging MyGM, MyLEAGUE and online features, with customizable management and offseason automation. | Keep the calendar playable and let users delegate individual responsibilities. | [2K21 developer report, retained crosspost](https://devtrackers.gg/nba2k/p/8ff62bb9-nba-2k21-next-gen-mynba-courtside-report) |
| The 2K27 announcement gives moratorium negotiations a dedicated pitching screen and connects promises to GM reputation. | Show negotiations as a distinct window; retain the existing role-promise system. | [2K27 official announcement](https://newsroom.2k.com/news/nbar-2k27-mynba-answers-the-community-with-a-back-to-basics-franchise-overhaul-and-modern-cba-rules) |
| A firsthand MyLeague Online review praises the offseason walkthrough but reports confusion over verbal agreements, signing status and cap holds. It also distinguishes offline summer games from the online experience. | Explain the current period and required decisions. Reserve commitments and recheck legality at signing. | [Operation Sports, August 2020](https://www.operationsports.com/nba-2k21-myleague-online-wishlist-crush-the-bugs-and-boost-the-presentation/) |
| A 2015 discussion quoting developer Leftos distinguishes normal training from optional camps and notes that camps in that edition favored users. | Keep natural progression separate. Give CPU teams the same camp capacities and gains as the user. | [Developer discussion and player responses](https://forums.operationsports.com/forums/forum/basketball/nba-2k-basketball/771235-any-ideas-for-training-in-myleague-non-mygm/page2) |
| NBA CBA 101 separates current contracts, future extensions, options, exceptions and roster limits. | Carry future salary rows, tick contracts once per summer, and check the smaller opening-night roster after camp. | [NBA CBA 101, November 2024](https://cms.nba.com/wp-content/uploads/sites/4/2024/11/2024-25-CBA-101.pdf) |

Training camps in an older MyLEAGUE edition should not be treated as proof of the exact modern MyNBA menu. The new MyNBA Legacy player RPG is also a separate mode. Franchise Lab's focused camps are an explicit game design choice.

## Annual structure

| Period | Player activity | Handoff |
| --- | --- | --- |
| Opening night | Set starters, rotation minutes and development roles; review extension eligibility. | Calendar remains the primary play surface. |
| Early regular season | Simulate games, read injuries and offers, assess role promises. | Monthly scouting and team-building checkpoints. |
| Midseason | Review results and expiring contracts; choose a direction before the deadline. | Trading closes through the existing deadline checks. |
| Playoff push | Manage health and rotation; plan summer priorities. | Regular-season awards, then play-in and playoffs. |
| Postseason | Simulate the bracket while tracking the whole league, including after elimination. | Champion ceremony, then explicit summer review. |
| Season review | Archive results and review team strategy. | Staff review. |
| Staff review | Hire replacements or retain current staff. | Lottery reveal. |
| Lottery | Review selection order. | Combine and workouts. |
| Combine and workouts | Add measurements, spend scouting looks and rank the board. | Start draft explicitly. |
| Draft | Select or delegate remaining picks. | Draft recap and rookie contracts. |
| Rookie contracts | Sign selected rookies at scale or release their rights. | Contract-year rollover and free agency. |
| Player progression | Review one annual development pass. | Optional summer games. |
| Summer league | Evaluate young players and unsigned invitees. | Focused camp assignments. |
| Training camp | Assign limited individual focuses and review gains. | Opening-night roster check. |
| Opening-night roster | Make cuts, fill missing spots, review the rotation. | New schedule and fresh season state. |

The hub uses the playable league state. Parallel historical/MyLeague scaffolding does not decide the displayed step. A shared stage strip links every desk back to the same journey. Future roadmap items show what is coming; they do not bypass transitions.

## Contract windows

1. **Options:** the club decides team options; players decide their own options when the window advances.
2. **Qualifying offers:** tender or decline eligible QOs. Tendering preserves matching rights and can result in the player accepting that contract.
3. **Rights review:** inspect cap holds and renounce deliberately.
4. **Own-player negotiations:** discuss new deals with expiring players before other clubs' free agents enter.
5. **Moratorium:** league-wide negotiation. Verbal agreements reserve salary and roster capacity; they do not add a signed player to the roster.
6. **Open signing:** recheck current cap and exception capacity before converting agreements into contracts. Restricted outside offer sheets begin here.
7. **Roster fill:** remaining signings and QO acceptances, followed by progression. Invalid commitments expire with a recap entry.

Manual bulk advancement stops at required decisions and at the next market window. Explicit free-agency delegation permits CPU decisions for the user's club. It never bypasses progression, summer evaluation, camp or final roster review.

Extensions have a separate contracts desk. Added years follow the current contract's salary rows. An accepted extension changes future control and guarantees without changing the current cap charge. Waiving an extended player retains the future salary schedule as dead money.

## Simulation and save guarantees

- Existing regular-season training, January/finale development and role promises continue to work.
- Summer age, service, contract and dead-money rollover happen once before the market. Annual attribute progression happens later, once, with no second age or contract tick.
- Newly drafted rookies do not lose a contract year during the summer in which they sign.
- Three summer scrimmages use temporary rosters and the existing possession simulator. Their results do not alter NBA wins, season lines, injuries or contracts.
- Focused camps add small attribute gains. Staff capacity limits slots to two through four per club. CPU selection uses age and current role, without reading hidden potential ceilings.
- Late roster fill returns directly to the final roster check. Completed development and camps remain intact.
- Saved flow state survives reload and export/import. Legacy free-agency saves already applied development, so migration does not repeat it.

## Deliberate limits

This is a compressed simulation calendar. Summer windows are game turns, not a claim that every edition of 2K or every historical NBA season uses the same dates. The extension desk models a subset of final-year contracts. Published salary books omit original signing dates, and designated veteran, renegotiation and extend-and-trade exceptions remain outside this implementation. Age bands still approximate maximum-salary service tiers. Rookie scale, cap holds, option timing and two-way classification retain simplified rules from the current engine.

Separate preseason games, league meetings/rule votes, full Hall of Fame ceremonies, Eurostash negotiation and a complete G League pipeline are not implemented by this change. They should become actual gameplay systems before receiving required steps in the journey.
