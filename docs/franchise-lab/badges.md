# Skill badges

## Research and adaptation

2K's [NBA 2K25 announcement](https://newsroom.2k.com/news/lead-the-next-great-dynasty-in-nbar-2k25-with-new-mycareer-and-myplayer-builder-updates-for-playstationr5-xbox-series-xs-and-pc) describes 40 broader skill badges, progress from relevant on-court actions, and Legend above Hall of Fame. The [NBA 2K26 builder report](https://newsroom.2k.com/news/nbar-2k26-myplayer-builder-delivers-all-new-animation-glossary-scouting-reports-and-build-by-badges-for-increased-customization) confirms Bronze, Silver, Gold, Hall of Fame and Legend, with attribute requirements for each level.

The current [NBA 2K27 announcement](https://newsroom.2k.com/news/nbar-2k27-myplayer-builder-introduces-female-myplayers-badge-tokens-and-the-all-new-synergy-system) changes MyPLAYER to 53 badges, performance meters across six disciplines, tokens, loadouts and Synergy boosts. These are MyPLAYER mechanics; the reports do not establish MyNBA's internal simulation formulas.

DRBL adapts the 2K25/26 skill progression pattern to a franchise roster: permanent player skills, attribute gates, relevant game evidence, and one selectable emphasis. It uses ten original badges with effects supported by DRBL's possession model. The thresholds, names, rates and XP are DRBL rules, not a reproduction of 2K's proprietary tables. There are no purchased tokens, online-season resets, equip costs, animation unlocks or potential-cap bypasses.

## Rules

| Level | Skill requirement | Career XP |
| --- | ---: | ---: |
| Bronze | 65 | 120 |
| Silver | 75 | 360 |
| Gold | 84 | 900 |
| Hall of Fame | 92 | 1,800 |
| Legend | 97 | 3,200 |

Inside touch uses average close shot and driving layup. Secure handle uses average ball handle and speed with ball. Rim guardian uses average block and interior defense. Glass cleaner, Defensive anchor and Clutch scorer use the stronger of their listed skills. Other badges use one attribute. The UI lists these inputs, XP sources and effects.

Progress stops at the current skill cap; improved attributes need new game evidence. XP never regresses through non-use. Aging can lower the active level, while earned progress stays saved. Each badge earns at most 24 base XP per game, with +25% for the chosen emphasis and +10% if an eligible active mentor has a higher level of that badge. Auto emphasis follows current skills and development focus. CPU players use the same automatic selection, gates, XP and effects.

Official regular-season, Cup, play-in and playoff games count. DNPs, All-Star exhibitions and summer games do not grant XP. Secure handle rewards ball uses after a turnover penalty; defensive progress requires actual minutes against opponents shooting 48% or below. Clutch scoring requires a made field goal in the last four minutes or overtime with the pre-shot score within ten points.

Shooting bonuses reach at most 1.5 percentage points, free throws 2 points, rebound/steal/block weights 12.5%, and handler turnover reduction 6%. Floor general and Defensive anchor each average across the relevant on-court players, capped at 0.5 percentage points for the lineup. The clutch bonus is at most 1.5 points in its limited window. All effects feed the canonical possession events, box score and replay.

## Saves and UI

Migration initializes up to three signature badges from visible current attributes at Gold or below. Players aged 22 or younger and unsigned players get at most one Bronze signature. The migration runs once per player and does not change attributes, overall, potential, results or rotations. Later-created players initialize before their first simulation. Draft prospects' badges stay hidden on their player cards.

XP and emphasis travel with the player through trades, seasons, slots and JSON exports. A saved current-season game-ID ledger rejects consecutive and nonconsecutive replays; older-season boxes cannot award progress after the ledger advances. Only the current season's IDs are retained. Skill bonuses do not alter the shared +4 career ceiling-growth limit.

Development has a roster selector, emphasis control, ten badge cards, explicit gates and XP progress. Player cards show active badges and an owner's link to Development. No badge loadout is needed before advancing a season.

## Validation

`test:franchise-badges` covers all five gates, migration, hidden-potential independence, focus and mentorship, skill declines, replay protection, three seasons, trades, exports, daily CPU parity, All-Star exclusions, postseason progression and actual possession effects. The regular calendar, franchise journey and real-NBA calibration suites run alongside it. The browser UX audit verifies emphasis export/reload and player-card rendering at 390px and 1440px.
