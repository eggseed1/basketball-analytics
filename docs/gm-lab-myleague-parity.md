# GM Lab and MyLeague: what is missing

Written 18 October 2026.

2K renamed MyLeague to MyNBA on the PlayStation 5 and Xbox Series generation, starting with NBA 2K21. The mode that shipped in NBA 2K27 (September 2026) is that same franchise: the old MyLeague sandbox, the old MyGM role-playing layer, and the old online league, in one save. This file uses MyLeague for that whole mode. It is the inventory of content GM Lab does not have yet if the goal is the same set of decisions, calendars, and league tools.

It is not a port plan for the console game. Arena crowds, commentary, tattoos, and stick gameplay are listed so the inventory is complete, then marked as presentation. The rest is front-office content a browser sim can actually run.

Sources for the 2K side are the 2K21 MyNBA Courtside write-up (Operation Sports), the 2K23 settings catalog (Hoops Gamers), the 2K26 MyNBA announcement (2K Newsroom, 21 August 2025), and the 2K27 MyNBA feature page plus the 2K27 Courtside announcement (September 2026). Feature names move a little each year. Where 2K27 changed a rule, the newer version is the one in the list.

## What GM Lab is today

The playable product is `/gm`. The nav is Home, Offseason, Roster, Lineup, Trade, Cap, Standings, Schedule, Draft, FA, Medical, Staff.

What that slice actually does:

- Seed a real NBA season: ESPN season stats, DARKO and RAPTOR impact, historical salaries, the official cap, tax, and apron table, and a real schedule.
- Run one user franchise inside a 30-team league.
- Standings, a playoff, a lottery, and a draft.
- A cap sheet that computes payroll, cap room, tax, and both aprons, plus roster min and max. Bird rights exist as a field on the contract (`none`, `early`, `bird`). A player option or team option can sit on the contract. Two-way deals are inferred from a salary under $1.2 million, not modeled as their own contract type.
- A depth chart and a possession simulator that writes a traditional and advanced box score. The coach has small offense, defense, and development bonuses.
- A two-team trade. Salary matching uses simplified bands. The other team accepts if the value gap clears a threshold that loosens when their owner goal is `tank`. Draft picks are worth a flat 18 (first round) or 5 (second).
- Sign a free agent. Waive a player.
- Scouting fog on ratings, letter grades and archetypes for prospects, a hired scout, and a trainer level that reduces injury severity.
- Injuries with games remaining and a reinjury risk. Morale is a 0 to 100 number. Personality is a single number. The owner has a patience value and a goal of contend, retool, or tank, plus fan confidence.
- Aging and development between seasons.
- A short news list on the home screen.
- Two IndexedDB saves: `franchise-lab-gm` for the playable league, `franchise-lab-myleague` for the Layer B scaffolding.

Layer B (`src/gm/myleague/`) is a design, not a second game. It names the phases a full year should have, from season review through the Finals. It defines a Reality universe and a Simulation universe, a knowledge date so the UI does not leak the future, and advisory analytics that are not allowed to rewrite ratings. The real-data provider still stubs draft, awards, and transaction feeds. The historical snapshot used at branch time is still a placeholder. The README in `src/gm/` says the playable annual loop is a later milestone, and a second, parallel possession simulator is intentionally out of scope.

So the honest baseline is a single-season vertical slice with a simplified cap, a two-team trade, a fogged draft, and a box-score sim. Almost every MyLeague system below is missing or only sketched.

Status words used in the tables:

- **Have.** A player can do this in `/gm` today.
- **Partial.** A field, a screen, or a simplified rule exists. The MyLeague behavior does not.
- **Missing.** Not in the product.

## 1. Starting a league

MyLeague begins as a setup wizard, not a team picker. Each switch adds a step. Turning a group off is how a commissioner builds a faster league or a ranked one.

| Content | Status | What MyLeague does |
| --- | --- | --- |
| Pick one team and a real season | Have | Also the GM Lab start. |
| Start in the offseason or on opening night | Missing | "Start from" is previous offseason or regular season. "Start Today" uses the live NBA date so the standings and roster match the morning you press start. 2K27 treats tiebreakers as load-bearing here: if the sim's tiebreakers disagree with the real NBA, Start Today breaks. |
| Fantasy draft | Missing | Every player goes back into a pool. Snake or auction-style settings from older years, with the usual draft-order controls. |
| Official roster, injury-free roster, or a community roster | Partial | GM Lab loads one real-season seed. There is no injury-free variant and no imported roster file. |
| Era | Missing | Modern, and a set of historical eras (Jordan, Kobe, LeBron-to-Miami, Magic and Bird, and others). The era picks the rosters, the CBA, the courts, and which historic events are allowed to fire. A custom roster only loads if it was built for that era. |
| Historic draft playlists | Missing | 2K27. Line up real draft classes across decades. Loop, shuffle, or reverse them. Shuffle draws from the pool without duplicate players. |
| Disable historic changes | Missing | 2K27. Expansion, rule changes, and rebrands stay frozen. Turn it back on later and the changes that would have happened resume from that date. |
| League size from 12 to 36 | Missing | Remove teams, add classic teams, all-time teams, or a custom team. Realign conferences and divisions. Replace a franchise. |
| Customize the salary cap at setup | Partial | The cap table is real for the seeded season. The user cannot turn the cap, the hard cap, or the tax off, or type their own numbers. |
| Simple settings | Missing | Autosave, quarter length for played games, quarter length for simulated games, and whether played minutes and stats are normalized to the sim length. |
| Advanced settings | Missing | The slider pages in section 12. |
| Ranked versus unranked | Missing | Ranked locks customization so runs can be compared. 2K26 Unranked MyGM keeps the role-playing layer and allows edited players, imported rosters, imported draft classes, and sliders. |
| Share a setup | Missing | 2K Share Setups. One person publishes the rules, teams, and rosters. Someone else starts from that file. |
| Share a scenario | Missing | A save frozen at a moment: down 3–0 in a series, a deadline day, a broken roster. Another person loads it and plays from there. |
| Several save slots | Partial | One browser save per store. No slot list, no cloud, no export. |
| Autosave after an action | Missing | A setting, on by default in 2K. |

GM Lab also has no "control N teams." MyLeague lets one person run anywhere from one franchise up to every team in a 36-team league, and the role-playing switches can be on for only some of those teams.

## 2. The year, as a calendar

MyLeague is a calendar with gates. You can automate a gate so the CPU plays it and the screen never appears. The 2K23 list of automatable periods is the practical map of the year:

All-Star city, catch-up scouting, contract options, the draft, the combine, draft signings, the expansion draft, free-agent signing, Hall of Fame, Hoop Summit, jersey retirement, league meetings, realignment, the lottery, the lottery tournament, player progression, retirement, pre-draft workouts, expansion protection lists, qualifying offers, staff retirement, staff signings, Summer League, relocation.

GM Lab's Layer B names a shorter list (`SEASON_REVIEW` through `SEASON_END`) and does not run it. The playable loop is "simulate the next game" plus an offseason hub shell.

Also on that calendar, and not in the automate list as separate rows:

- Training camp and preseason games.
- A trade deadline, after which some deal types close.
- The play-in tournament.
- The NBA Cup (in-season tournament), including a neutral-site final and a host city that changes by year. 2K27 records the Cup on player and staff histories.
- The Finals as their own presentation, not just another series.
- A moratorium before free agency opens (2K27).
- Daily recap screens during free agency: signings, power rankings, who is left, then an offseason winners-and-losers summary.
- Summer League as a playable or simulatable event, not a checkbox.
- Hoop Summit and the combine as scouting events with measurable results.
- Jersey retirement and Hall of Fame nights.
- Staff retirement, separate from player retirement.

Simulation control sits on top of the calendar:

- Simulate one game, a day, a week, to the next user game, to the deadline, to the playoffs, or the rest of the season.
- Three sim qualities in 2K26: Normal, Smarter, Faster. Smarter walks a large trade search, including protections and swaps. Faster skips some of that work.
- SimCast and SimCast Live: watch a game as a feed and jump in or out. GM Lab has a box score after the fact, not a live feed.
- CPU automation switches, per job: trades, in-season signings, in-season extensions, mid-season waivers, G League call-ups and send-downs, hardship exceptions, the draft, team options, qualifying offers, offseason free agency, filling the roster to the minimum, cutting down to the maximum, the target list, the trade block, and the untouchables list. Lineups can auto-fix before a game, after an injury, and after a roster move. Scouting and staff hiring can be handed to the CPU.

## 3. League rules and the CBA

2K21 shipped "Customize League Rules" so a commissioner could set the law before the first season, instead of waiting for the offseason meeting and a cap of five changes. 2K27 removed the five-change cap. A meeting can hold any number of proposals, each with a description, a historical note, and sliders. Owners vote. A separate switch freezes future rule changes entirely.

Categories named in the 2K21 setup, which later years kept and extended:

Lottery, standings, All-Star, shot clock, foul-out, lane violation, eight-second violation, backcourt violation, playoffs, possession arrow, bonus, goaltending, back-to-the-basket, sudden-death overtime, free throws, salary cap, trades, draft, contracts, Elam Ending.

Later additions that are now part of the same engine:

- The 3-2-1 lottery, as a live rule and as a historic change if you start before the modern era (2K27).
- Playoff seeding by conference or by overall record, ignoring conference. Online leagues use the second one so a stacked conference does not matter.
- Series length per round: one game, best of 3, best of 5, best of 7.
- Home-court patterns (2K27): straight alternation, 2-2-1 for a best of 5, and alternation, 2-2-1-1-1, or 2-3-2 for a best of 7.
- Play-in on or off.
- Clutch Player of the Year as a votable award (2K27).
- A timeout called with none left: keep the ball or lose it, plus the technical (2K27).
- Heaves: a miss at the end of a quarter counts for the team, not as a player shot attempt (2K27).
- Contract length that follows the CBA of the era you are in, not one modern template pasted onto 1987.

Advanced CBA switches, each individually toggleable, default on:

| Rule | What it changes | GM Lab |
| --- | --- | --- |
| Trade finances | Incoming and outgoing salary must match, with the real bands. | Partial. Simplified bands only. |
| Stepien rule | You cannot trade first-round picks in consecutive future years unprotected. | Missing. |
| 30/60/90 | A newly signed player cannot be moved for a set number of days. | Missing. |
| Restricted free agency | The old team can match. | Missing. |
| Waiver rules | A cut player sits on waivers before he is free. | Missing. Waive is immediate. |
| Dead cap | A waived contract can keep charging the cap if nobody claims it. | Missing. |
| First apron | Trade and signing limits once payroll crosses it. 2K27 says the first-apron effects were still wrong and got a pass. | Partial. The number is computed. The limits are not applied. |
| Second apron | Harder trade limits and tax penalties. 2K27 treats this as a roster-building constraint, not a label. | Partial. The number is computed. No restrictions. |

Also in the contract and cap layer, mostly missing here:

- Cap holds for free agents with Bird rights, so the room you think you have is not the room you have.
- Max, supermax, and the smaller max for younger players. Years of service decide the band.
- Bird, early Bird, and non-Bird exceptions that change the raise you can offer your own free agent.
- Mid-level, room, bi-annual, and taxpayer exceptions, each with a season of use.
- Rookie scale, with team options on years three and four.
- Qualifying offers, so a restricted free agent exists at all.
- Veteran minimum, and the league reimbursement that makes a minimum signing cheaper than the cap hit.
- Sign-and-trade.
- Extend a player in season, including the designated veteran and designated rookie windows.
- Options: player, team, and early termination. Picking them up is its own offseason step.
- Non-guaranteed years and guarantee dates.
- Incentives graded guaranteed, likely, or unlikely, and only the likely ones hit the cap the way the CBA counts them (2K27).
- 10-day contracts, limited in number, for the NBA and the WNBA (2K27).
- Two-way contracts as a real roster slot, with a call-up limit, not a salary threshold.
- Hardship exceptions when too many players are hurt.
- Exhibit 10 and training-camp deals, if camp is in the calendar.
- Buyouts and a buyout market for veterans on expiring deals (2K27).
- Eurostash: an international prospect under contract who is not on the active roster and can be brought over later (returned in 2K27 after being gone since 2K24).
- Era budgets and a luxury-tax bill the owner actually pays, which feeds the "be profitable" directive (2K26).
- Cash considerations in a trade, valued by the receiving team rather than treated as funny money (2K27).

GM Lab's cap screen is a calculator. MyLeague's cap is the thing that makes a move illegal.

## 4. Trades

| Content | Status | Notes |
| --- | --- | --- |
| Two-team trade | Have | Player and pick assets. |
| Three-team trade | Missing | Standard in MyLeague for years. |
| Four-team trade | Missing | 2K27. |
| Asset cap | Partial | No stated cap in GM Lab. 2K27 raised the cap from six to nine assets per team. |
| Salary matching | Partial | See section 3. |
| Cash | Missing | 2K27. |
| Pick protections | Missing | Top-N, lottery, 1–4, and the conversion to second-rounders. Smarter sim in 2K26 is largely about evaluating these. |
| Pick swaps | Missing | The right to exchange, which is not the same as owning the pick. |
| Stepien and the aggregation rules | Missing | Including the second-apron ban on aggregating salaries. |
| Trade finder | Missing | "Find a deal that gets me this player" or "find a home for this salary." |
| Trade block | Missing | Players the CPU knows you will listen on. |
| Untouchables | Missing | Players the CPU will not include. |
| Target list | Missing | Names you are chasing, which changes CPU offers. |
| No-trade clauses and trade kickers | Missing | A kicker changes the matching math. |
| Recently signed players locked | Missing | The 30/60/90 switches. |
| CPU trade logic with a goal | Partial | One value score and a tank discount. MyLeague's CPU cares about position, timeline, picks, protections, and the owner's directive. 2K26 advertised thousands of variables in the smarter sim. |
| Trade override as commissioner | Missing | Force a deal, veto a deal, edit a pick after the fact. |
| Rumor feed | Partial | A news list exists. It is not a rumor mill tied to talks. |

## 5. Free agency, camp, and the roster

The 2K27 free-agency revamp is the current bar.

- A moratorium. You pitch max-level free agents before the window opens. Pitches can lock a commitment.
- Promises that bind: sign or keep a friend, trade or refuse a rival, a general roster demand, a loyalty promise. Break one and GM Trust drops.
- GM Trust, starting at 50. High trust makes a promise believable. Low trust means the same pitch is ignored and you have to overpay.
- A moratorium board that is a depth chart of the best available player at each position, so you can see a scarce spot emptying in real time.
- Daily recaps and a final offseason report.
- Offer sheets to restricted free agents, and a match-or-fold decision for the old team.
- Negotiation as a conversation with a salary, years, an option, a no-trade clause, and incentives, not a single "sign" button. Difficulty is a 0–100 slider. CPU re-signing aggressiveness is its own slider.
- Bird rights changing what you can offer your own player versus what another team can offer.
- Camp battles, cuts to the regular-season limit, and the "fill to the minimum" automation.
- In-season signings of whoever is left, 10-days, and the buyout market after the deadline.
- Waivers with a claim order, usually worst record first, and a 48-hour window.
- A training-camp roster that is larger than the opening-night roster.

GM Lab can sign and waive. It cannot negotiate, match, promise, or run a market.

## 6. The draft

GM Lab has a lottery, a board, fogged identities, archetypes, and comps. That is the start of a draft, not MyLeague's draft.

Missing around it:

- A real lottery show: combinations or the 3-2-1 weights, the revealed order, and the tanks-who-fall-out story.
- A lottery tournament as its own automatable period (in the 2K23 list).
- Combine measurements and drills that update the scout's grades.
- Team workouts before the draft, with the prospect visiting or refusing.
- Hoop Summit and other pre-draft events.
- Big board versus scout board versus mock draft, and a ticker that shows all three.
- Interview questions that move a grade.
- Medical reports that can knock a prospect down, separate from the one-line medical note GM Lab already stores.
- Boom and bust. A prospect has a floor, a ceiling, and a probability of landing between them. The same class diverges across saves. Growth stays noisy through age 23, so scouting does not end on draft night.
- Draft-class quality as a 0–100 slider.
- Import a class, or edit one.
- Historic playlists with loop, shuffle, and reverse (2K27).
- Team needs and the CPU's willingness to trade up, trade down, or trade out.
- Undrafted free agents the morning after, with camp invites.
- Rookie-scale signings as their own step, including the second-round exception and two-ways.
- Stash and bring-over for international picks.
- Draft-day trades, which use the same trade machine as the season.
- Awards that read the class later: Rookie of the Year, All-Rookie, and the rising-star weekend if you keep one.

The fog GM Lab has (codename until the pick, letter grades, a noisy board rank) is the right idea. MyLeague then lets you spend scouting actions to shrink the fog, position by position, and it lets a bad medical or a bust undo the grade.

## 7. Players as people, not ratings

A MyLeague player is a body, a contract, a personality, a history, and a set of tendencies. GM Lab's player is an impact number plus offense, defense, shooting, finishing, playmaking, rebounding, durability, potential, one personality number, morale, and a minutes preference.

To match the mode, a player needs:

- Identity: name, age, birth date, birthplace, high school, college, nationality, height, weight, wingspan, handedness. 2K27 uses birthplace, high school, and college to seed friendships.
- Positions: primary, secondary, and the positions he will actually play.
- Attributes, not one impact score. The usual families are finishing, shooting, playmaking, defense, rebounding, and physical. Overall is a summary.
- Badges or traits that change how the sim uses those attributes.
- Tendencies: how often he shoots a three, posts up, passes out of a drive, gambles for steals. This is what makes two 80-overall wings different.
- Potential as a range (boom and bust), not a single offset.
- Personality tags that clash or fit: the 2K27 examples are Alpha Dog, Keep It Real, and Pat My Back. Two alphas in one locker room gain chemistry slowly and lose it fast.
- Morale with causes: minutes, role, winning, a broken promise, a rival on the roster, a friend traded.
- Friendships and rivalries. Shared hometown, high school, college, or national team starts a friendship. Repeated playoff exits against the same player start a rivalry, and the sim plays those games harder.
- Dynamic Duo when two stars sit at friendship 50 or higher, with an on-court bump. A Big 3 when three stars are all in that range, with a team-wide bump (2K27).
- Minutes and role complaints. A starter buried on the bench asks for a trade.
- Contract happiness, separate from playing-time happiness.
- Injury history, durability, and a fatigue value that carries across games if progressive fatigue is on.
- Awards, teams, seasons, and the NBA Cup, stored on the player card.
- Edit everything. Unranked MyLeague is an editor: ratings, tendencies, badges, contract, appearance. GM Lab has no editor.
- Create a player and drop him on a roster or into a draft class.
- Retire, un-retire, and force a career-ending injury. Career-ending injury frequency is a slider.
- Progression that respects age, minutes, coaching, facilities, and the boom/bust roll. GM Lab has a between-season age step. It does not have in-season growth, a training camp, or a staff member whose specialty is player development beyond one coach bonus.
- Generated players after the real classes run out: names, bodies, and (in 2K) tattoos. The tattoo system is presentation. The generator is not. A 30-year save dies without it.
- Relationships that pre-exist because two real players went to the same high school. That requires the biographical fields, which GM Lab's real seed does not store.

## 8. Rosters, lineups, and how a game is played

GM Lab's lineup screen sets starters and a bench order. The sim uses the top of that list, skips injured players, and produces a box score from team offense, defense, and pace. Coach bonuses nudge those three numbers.

MyLeague treats the lineup as a coaching plan:

- Starters, a rotation of about ten, and minutes targets.
- Depth chart by position, including who closes.
- Matchup assignments and a defensive scheme.
- Offensive playbook and defensive playbook, with a coach who is good or bad at each.
- Tempo, crash offensive glass, push in transition, three-point rate, post usage. 2K exposes these as team tendencies and as sim sliders (pace, fast break, shot mix, shot percentages, and how concentrated the stats are on the best players).
- In-game substitutions, timeouts, and intentional fouls if you play the game. If you only simulate, the same decisions need a policy: when the CPU sits a tired star, when it plays small, when it fouls late.
- Progressive fatigue across a back-to-back, disabled by a switch.
- Load management as a choice that angers the owner or saves a body.
- On and off ratings that the sim actually uses, so a lineup change matters beyond "the five highest impact ratings."

Played games, as opposed to simulated ones, are the largest presentation gap: difficulty from Rookie to Hall of Fame, quarter length, a normalize-stats switch so a 5-minute quarter does not produce a 5-minute stat line, and jump-in from a sim. A browser GM does not have to ship stick controls to be a full front office. It does have to make "I changed the rotation" show up in the box score, which is the part GM Lab has started.

Sim sliders MyLeague exposes, all missing here as user controls: possessions per game, share of possessions that become a shot, assist rate, steals, blocks, turnovers, fouls, injury rate, dunk and layup and close and mid and three frequency, and the make rate of each, plus free throws. Distribution sliders push shots, rebounds, assists, steals, blocks, fouls, and turnovers toward the best players at that skill. Team rebounds are their own knob. These are how commissioners stop a sim from producing a league that does not look like basketball.

## 9. Coaching and the rest of the staff

GM Lab staff is a head coach (offense, defense, development), a scout level or a hired scout, and a trainer level.

MyLeague's staff is an org chart you hire, fire, and lose:

- Head coach, with offensive and defensive schemes, rotations, and a record.
- Multiple assistant coaches. 2K21 added an assistant whose presence changes on-court performance and who sits on the bench if you play games.
- Associate coach, player-development coach, shooting coach, and so on, each with a specialty.
- Scouting director and regional scouts. Assigning a scout to a college region or a draft position shrinks fog there and leaves you blind elsewhere.
- Trainers and medical staff. They change injury length and reinjury, which GM Lab approximates with one integer.
- General manager, if you are the owner, or the owner and governor, if you are the GM.
- Staff abilities as a toggle. Some staff have a special trait, not just a rating.
- Salaries for staff, against the basketball-operations budget.
- Staff morale, trust, and the ability for a coach to quit (a team-feature switch).
- Staff retirement as an offseason period.
- Staff signing period, separate from free agency.
- Firing a coach mid-season, the payout, and the interim.
- CPU staff management, so a team you are not watching still hires and fires.
- A coach who will or will not play the rookies, which feeds development and morale.

## 10. The building, the owner, and the job

This is the old MyGM layer. 2K21 made every piece optional. 2K26 and 2K27 pushed it further into the default experience.

Owner and governor:

- A preseason meeting. The governor sets the year's directive: win a title, make the playoffs, develop youth, or turn a profit.
- Goals that are specific to the roster. 2K26 shipped 30 offseason scenarios, three goals each, on the real lottery order. Dallas with Cooper Flagg is a different job from Golden State choosing one more Curry year or a teardown.
- Tasks from the governor, from staff, and from players. Completing them pays facility points, trust, or both.
- You can be fired. That switch exists on its own, so a sandbox league can turn firing off.
- Owner patience and fan confidence exist in GM Lab as numbers. They do not fire you, change the budget, or generate a task.

Facilities, bought with points earned from directives (2K26 list):

- Team training facilities.
- Recovery facilities.
- Arena renovations.
- Luxury boxes and other premium amenities.
- A facility level that free agents can see. A bad building costs you a star who had equal money elsewhere.

Budget:

- Ticket prices, concession prices, and parking, if price controls are on.
- A split of the budget across scouting, coaching, medical, and marketing.
- Attendance that moves with winning, prices, and star power.
- A profit-and-loss statement the "be profitable" directive reads.
- Sponsors that can cancel (its own switch).
- Era-correct team budgets, so a 1975 franchise does not have a 2026 local-TV deal.

GM career layer:

- A GM score and a skill tree. Skills unlock better negotiation, more scouting accuracy, or a calmer owner. Each can be switched off.
- Trust with players and with staff, separate from morale. 2K27's GM Trust is the public version: it starts at 50 and free agency reads it.
- Conversations: face-to-face scenes with the governor, a coach, or a player. 2K21 split these from tasks, so you can keep the tasks and skip the reading. Menus can lock if a relationship is bad.
- Action points. Some MyGM setups make every roster move cost an action, and the day auto-sims when every controlled team is out of actions. Playing a game can cost an action too. This is optional and easy to hate. It is still part of the mode.
- Ranked leaderboards for the GM score.

GM Lab's owner goal is three words. MyLeague's owner is a person who gives you a job description and can end the save.

## 11. Chemistry, morale, and promises

Already partly covered under players and free agency. The system as a whole:

- Team chemistry as a percentage that raises or lowers attributes. Effect size and difficulty are sliders. A switch removes it.
- Individual morale with the same pair of sliders.
- Causes you can point at: minutes, role, winning, a teammate, a promise, a coach.
- Friendships, rivalries, Dynamic Duos, Big 3s (2K27).
- Personality clashes that change how fast chemistry moves.
- Promises stored as objects with a due date, not flavor text. "I will start you." "I will sign your friend." "I will not trade you." The sim checks them.
- Trading a player who is on a multi-year deal costs GM Trust (2K27).
- A rivalry game gets a sim bump, especially in a closeout.

GM Lab stores morale and a personality integer. Nothing reads them except whatever future UI might display them.

## 12. Injuries, fatigue, and the medical report

GM Lab has an injury type, games remaining, reinjury risk, and a medical page. The trainer level shortens the damage.

Still missing:

- Injuries on and off as a master switch.
- Separate frequencies for user and CPU, and separate effect sizes, so a commissioner can protect his team without freezing the league.
- In-game injuries versus simulated injuries.
- Severity tiers: day-to-day, out two weeks, out for the season, career-threatening, career-ending.
- A medical staff that diagnoses. The report can be vague until the trainer is good enough, which is the scouting-fog idea applied to bodies.
- Minutes restrictions and a return-to-play ramp.
- Progressive fatigue and back-to-backs.
- Resting a player as an explicit decision.
- Hardship signings when the injury list crosses a line.
- Reinjury if you bring him back early. The field exists. The decision does not.

## 13. Games that are not the regular season

| Event | Status | What has to exist |
| --- | --- | --- |
| Preseason | Missing | A short schedule, no standings, experimentation with the rotation. |
| NBA Cup | Missing | Group stage, knockout, neutral final, host city by year, history on the player card. |
| All-Star voting | Missing | Fan and media ballots, or a simplified vote, over several weeks. |
| All-Star city | Missing | An automatable selection. |
| All-Star weekend | Missing | 2K27 updated it to the modern format: the game, the three-point contest, the dunk contest, and the skills event in whatever shape the NBA is using. Rising Stars if the era has it. |
| Play-in | Missing | 7 through 10, two brackets. |
| Playoffs | Partial | A bracket exists. Series length, home patterns, and presentation do not. |
| Finals | Partial | Named as a phase. Not a distinct event. |
| Summer League | Missing | A roster of rookies and camp bodies, a short schedule, and a place where development and injuries can happen. |
| G League season | Missing | Affiliate teams, a schedule, call-ups, send-downs, and two-way rules. 2K21 made the games playable and put them on the daily calendar. A switch hides them. |
| Playoffs Online | Missing | 2K26. A commissioner seeds the 16 real playoff teams and invites up to 15 people, or opens the bracket. This is a format, not only a netcode feature. |

## 14. Standings, awards, records, history

GM Lab has wins and losses.

MyLeague keeps a league memory:

- Conference and division standings, with the real tiebreakers. 2K27 called out a tiebreaker bug because Start Today depends on them.
- Play-in and playoff clinch numbers.
- Power rankings.
- Season awards: MVP, Defensive Player of the Year, Rookie of the Year, Sixth Man, Most Improved, Clutch Player of the Year, Coach of the Year, All-NBA, All-Defense, All-Rookie, Finals MVP, and the All-Star team. Finals MVP and the tiered teams need a vote, not a stat sort, or the same player wins everything.
- Monthly and weekly awards, which feed morale and the ticker.
- League leaders.
- Franchise records and league records, broken in real time.
- Retired jerseys and a Hall of Fame ballot.
- A transaction log that survives the season: trades, signings, waivers, firings, injuries.
- Championship banners. 2K26 hangs banners earned inside the save in the arena. For a web app that is a history page and a team header, not a rafter mesh. The data is the same: year, opponent, MVP.
- Era history that is already true when you start in 1984, so the Lakers do not have an empty past.
- A disable switch so a custom league does not inherit that past.

The Layer B provider was supposed to supply awards and transactions. Both feeds are still stubbed, so even the real past is not wired into the franchise.

## 15. Expansion, relocation, rebranding

A long MyLeague save does not stay at 30 teams unless you freeze history.

- Expansion: a new team, a fee, a draft, and a protection list. The number of players a team may protect is a setting from 0 to 14. The expansion draft is its own step.
- Relocation: a city bid, an owner vote or a commissioner decision, a new name, and new colors.
- Rebrand without moving.
- Realignment when the league size changes. Conferences and divisions are editable at setup and again in a league meeting.
- Historic expansion that fires on the real date unless historic changes are disabled (2K27). Start in 2000 and you eventually get the Bobcats, the Hornets move, and the rest, on purpose.
- Contraction, which is the same machinery as "remove a team" at setup, available later.
- Custom teams, classic teams, and all-time teams dropped into a division.

GM Lab's franchises are a fixed list from the seed.

## 16. Commissioners, online leagues, and the WNBA

Online is a large part of why MyLeague's settings exist. A public site does not have to ship console netcode to copy the job.

Commissioner tools:

- Force a trade, a signing, an injury, a suspension, or a lineup.
- Edit any player or team.
- Change the rules mid-save.
- Advance the calendar for everyone.
- Set a pace: online communities invent these (three in-game weeks due every three real days) because the mode itself has no deadline. A GM Lab league that is multiplayer needs a deadline or it stalls in free agency the way 2K leagues do.
- Invite list, ready-check, and a CPU taking over a team whose user left.
- Per-user feature flags: one manager wants tasks and firing, another wants a sandbox. 2K21 made this per team.
- Leaderboards inside the league: titles, profit, GM score.
- Playoffs Online as a shorter format: import the 16 teams that actually made it and play the bracket.

Local multi-team control is the offline version of the same idea. One browser can run several franchises. The CPU runs the rest. Without this, "MyLeague" is "one team and a simulator," which is what GM Lab is now.

WNBA, because 2K27 started putting the same contract tools on both leagues:

- A separate league with its own cap, roster size, and season calendar, or an explicit decision that GM Lab is NBA-only.
- 10-day contracts and the rest of the 2K27 CBA notes were specified for both.
- If it is out of scope, say so in the product. Do not leave a half-button.

## 17. News, scouting information, and the knowledge date

MyLeague's ticker is a setting page of its own: speed, and a toggle for each category. The categories in the 2K23 list are G League, headlines, All-Star voting, power rankings, big board, draft order, mock draft, draft results, combine, game results, upcoming games, stat leaders, free agents, transactions, injuries, rumors, social posts, standings, award races, awards, and records.

GM Lab has five news lines.

The more important design, which Layer B already names and does not enforce, is the knowledge date. In a historical save you must not see the 2026 trade until the calendar reaches it. Scouting fog is the same idea pointed at ratings. MyLeague's catch-up scouting period exists because a user who skipped a month of the draft calendar would otherwise walk into the lottery blind. Both belong in the product: information has a date, and skipping time has a cost unless you automate the scouting.

## 18. Editors and created content

Unranked MyLeague is an editor that happens to simulate.

- Edit a player's ratings, tendencies, badges, bio, and contract.
- Create a player.
- Edit a team name, city, colors, court, and uniforms.
- Build a roster and save it.
- Build a draft class and save it.
- Import a community roster that matches the era.
- Import a MyPLAYER, in 2K, as "Player DNA": appearance, attributes, badges, tendencies, pasted into any era. The appearance half is presentation. The attribute paste is a create-a-player preset.
- Export the league.
- Share setups and scenarios.

GM Lab's seed is read-only. That is the right default for a stats site and the wrong ceiling for a franchise mode. The editor can write a Simulation universe and leave the Reality snapshot alone. Layer B already drew that line. The screens do not exist.

## 19. Presentation that 2K ships and a website does not have to

Listed so nobody later thinks they were forgotten.

- Playable on-court games, camera, commentary, crowd, jumbotron.
- Dynamic banners in a 3D arena (the data belongs in section 14).
- Historic courts. 2K27 added 75. Courts are content for a game renderer.
- Tattoos on generated players.
- MyPLAYER face and body import.
- Slide-out navigation and other console UI.
- MyNBA Legacy (2K27): a 100-year mode where you lock to one player, earn experience from stat goals, awards, and records, spend it on badge tiers and training camps, and pass traits to a child. It is a career mode bolted to the franchise. It reuses the sim, the draft, and the front office. It is not required for "I am the GM." If GM Lab ever grows a player-locked mode, Legacy is the spec: performance points, inherited badges, and a family tree. It should not be step one.

## 20. What to build, in an order that produces a league

The tables above are the content list. This is the order that makes each layer usable. Skipping ahead produces screens with nothing behind them.

1. **Finish the year.** Run the phases Layer B already names, with automate switches. A season that ends, a lottery, a draft, free agency, and a next season, without the user hand-cranking games, is the difference between a demo and a mode.
2. **Make the cap real.** Exceptions, Bird rights that change an offer, aprons that forbid a move, dead money, waivers, qualifying offers, the rookie scale, options, and non-guarantees. The current calculator can stay as the display.
3. **Trades that front offices actually propose.** Three and four teams, protections, swaps, cash, a finder, a block, untouchables, and a CPU that uses them. Two-team value matching cannot represent the 2K27 trade screen.
4. **Free agency as a market.** Moratorium, offer sheets, matching, promises stored as data, GM Trust, incentives, 10-days, buyouts.
5. **The draft cycle.** Combine, workouts, boom/bust, region scouts, undrafted camp, historic classes once the real draft feed exists. The fog system is the piece to keep.
6. **G League, two-ways, and Summer League.** Call-ups need a place to come from.
7. **Staff org chart and facilities.** One coach bonus cannot stand in for development, scheme, and medical.
8. **Morale that the sim reads.** Chemistry, friendships from biographical data, promises, and role complaints. Dynamic Duos after friendships exist.
9. **Owner job.** Directives, tasks, firing, budget, facility points. Scenarios like the 2K26 team goals sit on top of this, because a goal needs a check at the end of the year.
10. **Awards, records, tiebreakers, play-in, NBA Cup, All-Star.** The league has to remember itself. Tiebreakers matter as soon as more than one season is real.
11. **Editors, custom teams, league size, expansion and relocation.** The sandbox half of MyLeague. Do this after the rules exist, or custom leagues inherit a toy CBA.
12. **Eras and historic change.** Needs the real historical rosters, the CBA of that year, and a switch to freeze history. The Reality versus Simulation split in Layer B is the right place to hang it.
13. **Commissioner tools and shared leagues.** Multiplayer after one machine can already run every rule. Otherwise you will debug both at once.
14. **Sim sliders and news.** Commissioners need the league to look like basketball, and they need to see it happen. This can start earlier as a small settings page. It is last here because it tunes a sim that has to exist first.

## 21. Gap, counted

Rough counts from the tables, so the size of the work is visible. Presentation items in section 19 are not in the count.

| Area | Have or partial | Missing |
| --- | --- | --- |
| Setup and saves | Season seed, one save | Era, fantasy draft, league size, shared setups, start-today, ranked |
| Calendar | Next-game sim, offseason shell | The automate list, Cup, All-Star, Summer League, camp, moratorium |
| CBA and contracts | Cap math, Bird field, option field, apron numbers | Exceptions, matching RFA, aprons that bind, incentives, 10-days, Eurostash, buyouts, dead cap |
| Trades | Two teams, flat pick value | 3–4 teams, protections, swaps, cash, finder, block |
| Free agency | Sign, waive | Negotiation, promises, trust, waivers, moratorium |
| Draft | Lottery, fog, archetypes | Combine, boom/bust, workouts, playlists, stash |
| Players | Impact ratings, morale number | Attributes, tendencies, friendships, editor, generator |
| Lineups and sim | Starters, bench, box score | Schemes, tendencies, fatigue, sliders |
| Staff | Coach, scout, trainer | Org chart, quitting, staff free agency |
| Owner and facilities | Goal, patience, fans | Directives, tasks, firing, buildings, budget |
| Chemistry | Stored, unread | Chemistry, duos, promise checks |
| Medical | Injury object, trainer integer | Tiers, fog, hardship, rest |
| Postseason and exhibitions | A playoff | Play-in, patterns, Cup, All-Star, G League, Summer League |
| Memory | Wins and losses | Awards, tiebreakers, records, banners, HOF |
| League structure | 30 fixed teams | Expansion, relocation, realignment, custom teams |
| Multiplayer | None | Commissioner, shared clock, per-user rules |
| Information | Five headlines | Ticker categories, knowledge date enforced |

The playable slice covers the nouns (team, player, cap, trade, draft, injury). MyLeague is the verbs: offer, match, protect, promise, vote, call up, expand, fire, and the calendar that forces each verb to happen on a date.
