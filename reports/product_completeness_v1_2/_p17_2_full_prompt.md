<timestamp>Monday, Aug 17, 2026, 3:58 PM (UTC-4)</timestamp>
<user_query>
You are working on the current P17.1 product branch.

P17.1 previously reported:

```text
PRODUCT_COMPLETENESS = PASS
```

Human visual review has now found real rendered product defects that invalidate a final product-complete seal until repaired.

This milestone is:

```text
P17.2
PROVIDER IDENTITY BOUNDARY
+
PLAYER TEAM PRESENTATION
+
GAME DESTINATION ROUTING
+
REAL RENDERED PRODUCT REGRESSION
```

Do NOT start M17c.

Do NOT commit/final-freeze the previous P17.1 state yet if it remains uncommitted.

Do NOT change DRBL model semantics.

---

# 0. NEW HUMAN-OBSERVED FAILURES

These are not theoretical.

They were observed in the rendered application after P17.1.

## Failure A — Explore Players team column

The rendered player table shows values such as:

```text
1610612760
1610612746
1610612765
...
```

in the team column.

These are provider-native NBA Stats team IDs, not valid public team labels.

A small badge also displays:

```text
161
```

rather than the intended team identity.

Required interpretation:

```text
RAW_PROVIDER_TEAM_ID_LEAKED_TO_UI = YES
```

until repaired.

---

## Failure B — Player page team identity

Team identity still does not reliably appear on player destination pages.

Likely symptoms:

```text
missing team name
missing team logo
missing team link
or unresolved raw NBA Stats team id
```

Do NOT treat this merely as a logo bug.

Audit the team ID namespace reaching the player destination.

---

## Failure C — Game destination

Navigating to a game destination produces:

```text
404
```

even though:

```text
/games/[gameId]
```

exists in the route manifest.

Treat as:

```text
GAME_ROUTE_LOOKUP_CONTRACT_BROKEN
```

until root cause is established.

Do not assume the cause.

---

# 1. PREVIOUS P17.1 PASS IS NOW PROVISIONAL

Set:

```text
P17_1_PRODUCT_PASS_HUMAN_REVIEW
=
REOPENED_FOR_PRODUCT_DEFECT
```

This does NOT reopen:

```text
DRBL model validation
M17b
M18a
R1 semantics
historical analytics
```

Only product completeness is reopened.

---

# 2. MODEL FIREWALL

Absolutely preserve:

```text
rawAbilityRate
validatedDRBL100
k = 1600
priorMean = 0
calibration = identity
Approach-B
EPV
R1
P1 = 37.490662671779255
R1 Points
R1 WinEq
historical support tiers
UIR-C
canonical rank
```

Require:

```text
DRBL_V1_REOPENED=NO
MODEL_PARAMETER_CHANGED=NO
K_REFIT=NO
P1_REFIT=NO
R1_CHANGED=NO
EPV_CHANGED=NO
UIR_CHANGED=NO
```

---

# 3. DO NOT PATCH THE DISPLAY FIRST

Do NOT begin with logic like:

```ts
if (teamId.startsWith("161061")) ...
```

inside table/player components.

Do NOT create component-specific ID translation.

The bug must be repaired at the correct provider→canonical identity boundary.

First trace the data lineage.

---

# 4. DEFINE TEAM ID NAMESPACES EXPLICITLY

Inventory every team identifier currently used:

```text
ESPN canonical product team id

NBA Stats TEAM_ID
example:
1610612760

BallDontLie team id

team abbreviation

brand slug

route id

franchise id

historical team-season identity
```

Create:

```text
reports/product_completeness_v1_2/01_team_namespace_contract.md
```

For each namespace document:

```text
example
source
type
where introduced
where stored
where normalized
where allowed in UI
where forbidden in UI
```

---

# 5. NBA STATS TEAM MAPPING MUST BECOME FIRST-CLASS

The prior workbook states that:

```text
Canonical product key
=
ESPN team id
```

and NBA Stats IDs currently exist through parallel metadata rather than the same canonical provider-id contract.

Audit:

```text
src/data/identity/team-map*
NBA_TEAM_META
src/lib/team-identity.ts
src/lib/nba-brand.ts
```

Find the exact source of truth for:

```text
NBA Stats TEAM_ID
→
canonical ESPN team identity
```

If deterministic 30-team mapping already exists:

USE IT.

If it exists only in `NBA_TEAM_META`, integrate it into the canonical identity boundary cleanly.

Preferred contract conceptually:

```ts
providerIds: {
  espn: "...",
  nba: "16106127xx",
  bdl: "..."
}
```

ONLY if this can be introduced without breaking the established architecture.

Do not duplicate another lookup table if one already exists.

---

# 6. EXPLICIT NBA PROVIDER NAMESPACE

Add/confirm provider type:

```text
nba
```

alongside:

```text
espn
bdl
```

where appropriate.

A bare numeric string:

```text
1610612760
```

must never be interpreted through ESPN or BDL rules.

Require:

```text
PROVIDER_TEAM_NAMESPACE_EXPLICIT=YES
```

---

# 7. ALL 30 NBA TEAM IDs

Audit current NBA Stats IDs for all 30 teams using existing repository metadata.

Do not web-scrape or guess.

Generate:

```text
02_nba_to_canonical_team_crosswalk.csv
```

Fields:

```text
nbaTeamId
canonicalTeamId
abbr
fullName
brandKey
route
resolved
sourceFile
```

Require:

```text
30 / 30
```

if repository data support it.

Any missing mapping is a blocking identity defect for NBA-derived player rows.

---

# 8. TRACE EXPLORE PLAYERS TEAM FIELD

Follow one player-season row end-to-end:

```text
NBA/player source
→ transformer
→ PlayerSeason
→ DRBL overlay
→ getFilteredPlayerSeasonsDetailed
→ Explore board
→ TM cell
```

Document exact values at each stage for at least:

```text
3 deterministic player rows
```

Do NOT select only working examples.

At least one should reproduce a currently leaked:

```text
16106127xx
```

ID before repair.

Generate:

```text
03_explore_player_team_lineage.md
```

---

# 9. PLAYERSEASON TEAM CONTRACT

Inspect the type definition for:

```text
PlayerSeason.teamId
```

Determine whether it currently means:

```text
canonical product team id
```

or:

```text
provider-native team id
```

If usage is inconsistent, this is the root architectural defect.

Freeze a contract.

Preferred end-state for product-facing rows:

```text
teamId
=
canonical product team id
```

and preserve provider-native identity separately when needed:

```text
providerTeamId
teamIdProvider
nbaTeamId
```

Do not silently overload one field with multiple namespaces.

---

# 10. NORMALIZE AT THE ADAPTER / TRANSFORM BOUNDARY

NBA-derived player rows should be normalized before ordinary UI rendering.

Conceptually:

```text
NBA Stats row
TEAM_ID = 1610612760
        ↓
normalizeTeamFromProvider("nba", TEAM_ID)
        ↓
canonical team id
        ↓
PlayerSeason.teamId
```

Then UI consumes canonical identity.

Do not make every component understand NBA IDs.

---

# 11. PRESERVE RAW PROVIDER ID

Where debugging/provenance benefits:

retain:

```text
providerTeamId
=
1610612760

teamIdProvider
=
nba
```

rather than discarding provenance.

But public UI must not show it unless explicitly in a technical/debug context.

---

# 12. EXPLORE PLAYERS TM CELL

After normalization, desktop TM column should show a coherent compact team identity.

Recommended:

```text
team logo
+
abbreviation
```

or:

```text
team logo
+
short/full name
```

according to current table width/design.

It must NOT show:

```text
1610612760
161
```

as public identity.

The screenshot supplied by human review becomes a regression fixture.

---

# 13. MULTI-TEAM / TOT ROWS

Audit traded player rows.

Do not force a single team logo if the row represents:

```text
TOT
multiple teams
```

Use explicit existing semantics.

Possible display:

```text
TOT
```

or:

```text
Multiple
```

with no invented team brand.

Document policy.

---

# 14. PLAYER DESTINATION TEAM LINEAGE

Trace team identity for:

```text
/players/[playerId]
```

from:

```text
route player identity
→ player season query
→ PlayerSeason.teamId
→ historical/modern brand resolver
→ PlayerDestinationIdentity / PlayerCoreIsland
```

Generate:

```text
04_player_destination_team_lineage.md
```

Prove the team value reaching:

```text
resolveTeamBrand
resolveHistoricalTeamBrand
TeamLogo
```

is in the expected namespace.

---

# 15. PLAYER PAGE REQUIRED TEAM PRESENTATION

For a current supported season, player page identity/header must display where available:

```text
team logo
team full name or abbreviation
team link
season
```

For historical Tier-B seasons:

```text
historical team name
historical abbreviation/mark
historical palette
```

Do not reuse inappropriate modern branding.

---

# 16. PLAYER PAGE EMPTY TEAM STATE

If team identity genuinely cannot resolve:

show a deliberate:

```text
Team unavailable
```

state.

Never:

```text
1610612760
```

or a broken/missing logo with no explanation.

---

# 17. TEST PLAYER TEAM IDENTITY ACROSS PROVIDERS

Create tests for:

```text
NBA Stats team id → canonical team

ESPN team id → canonical team

BDL team id → canonical team

abbreviation → canonical team

historical team era

unknown provider id

multi-team/TOT
```

A numeric ID must not cross namespaces implicitly.

---

# 18. GAME PAGE 404 — FORENSICS BEFORE FIX

The workbook route manifest confirms:

```text
/games/[gameId]
```

exists.

But the critical source snapshot did not capture enough game destination/query code to verify its lookup contract.

Audit exact files for:

```text
src/app/games/[gameId]/page.tsx
game query/load function
game provider
game links
scores links
Explore Games links
home game cards
standings/game links if any
```

Generate:

```text
05_game_route_forensics.md
```

---

# 19. GAME ID NAMESPACES

Inventory all game ID families:

```text
ESPN event id

NBA game id
example:
002250....

BDL game id

local/cache game id

historical normalized game id

GM route id if distinct
```

For each document:

```text
format
provider
source
where links are created
where lookup accepts it
```

---

# 20. REPRODUCE THE 404

Use the actual UI path that produced the human-reported failure.

Trace:

```text
source page/card
href generated
gameId in URL
provider namespace of ID
/games/[gameId] lookup
lookup result
notFound()/404 decision
```

Record exact failure class.

Do not fix until reproduced.

---

# 21. GAME ROUTE CONTRACT

Choose an explicit public route contract.

Preferred architecture:

```text
public game route
may accept provider-specific known game ids

→ normalize/resolve game identity
→ canonical game retrieval
```

OR retain one canonical game ID if current architecture already establishes it.

The key rule is:

```text
link generator and destination lookup
MUST use compatible identity semantics.
```

---

# 22. NO AMBIGUOUS NUMERIC GAME GUESSING

Do not assume every numeric game ID belongs to the same provider.

If format is unambiguous, deterministic inference may be documented.

Otherwise preserve provider metadata/context.

Do not make a BDL numeric ID silently query ESPN.

---

# 23. GAME LINK AUDIT

Inventory every link to:

```text
/games/*
```

from:

```text
Home

Scores

Explore Games

team destination

player recent games if applicable

History

search

ASK if applicable
```

Generate:

```text
06_game_link_inventory.csv
```

Fields:

```text
sourceSurface
sourceFile
href
idNamespace
destinationLookupSupports
status
```

Require no known public link producing deterministic 404 for a valid game.

---

# 24. VALID GAME VS MISSING GAME

Game destination must distinguish:

```text
VALID_GAME_PROVIDER_MISMATCH

VALID_GAME_DATA_UNAVAILABLE

INVALID_GAME_ID

NETWORK_FAILURE
```

Do not turn a provider fetch timeout into a semantic 404.

If a game exists but its supplemental islands fail:

render game shell rather than `notFound()` where appropriate.

---

# 25. GAME TEAM IDENTITY

Once game lookup works, ensure game sides use:

```text
ensureGameTeamIdentity
gameSideCanonicalTeamId
gameSideDisplayName
gameSideBrandKey
```

or the current canonical equivalents.

NBA-native team IDs from a game source must also cross the correct provider boundary.

---

# 26. CURRENT VS HISTORICAL GAME IDENTITY

For current game:

```text
current franchise identity
```

For historical game:

```text
team-era identity
```

when known.

Do not let the game routing repair regress historical branding.

---

# 27. GAME DESTINATION SMOKE MATRIX

Test deterministically:

```text
current completed game

current scheduled/upcoming game

historical game

game reached from Scores

game reached from Explore Games

game reached from Home

invalid game id
```

Expected:

```text
valid games
→ no 404

invalid id
→ deliberate 404

provider/network error
→ error/partial state, not false not-found
```

---

# 28. HUMAN SCREENSHOT IS A REQUIRED REGRESSION

Create a post-fix screenshot of the same Explore Players table shape.

Required:

```text
TM raw NBA ids visible = 0
```

Count across all visible rows.

Generate:

```text
screenshots/explore-players-team-identity-fixed.png
```

---

# 29. PLAYER PAGE SCREENSHOTS

Capture at least:

```text
current player with team identity

historical Tier-B player with team identity

multi-team player

identity-unresolved player if fixture available
```

Verify manually:

```text
logo
name/abbr
link
season
```

---

# 30. GAME PAGE SCREENSHOTS

Capture:

```text
game page reached from Home

game page reached from Scores

game page reached from Explore Games
```

At least one must be the route class that previously returned 404.

---

# 31. FULL RENDERED ROUTE QA

Do not trust unit tests alone.

Use browser/dev-server QA to click through actual links.

At minimum:

```text
Home → game

Scores → game

Explore Games → game

Explore Players → player

player → team

Explore Teams → team
```

Record HTTP/render outcome.

---

# 32. PLAYER → TEAM LINK

Since teams were reported missing on player pages, verify the team identity is actually clickable to the correct:

```text
/teams/[canonicalTeamId]
```

Do not create route using NBA team ID unless `/teams` explicitly accepts/normalizes it.

---

# 33. TEAM ROUTE NORMALIZATION

Audit:

```text
/teams/[teamId]
```

with:

```text
ESPN canonical id

NBA team id

BDL id

abbr
```

Decide supported public input forms.

If route is designed to accept multiple forms:

normalize explicitly by namespace.

If not:

all internal links must emit canonical ESPN IDs.

---

# 34. SOURCE-LEVEL ASSERTION

By the end of P17.2 there should be one clear rule:

```text
Provider-native IDs do not survive beyond
the provider normalization boundary
unless explicitly carried in provider-specific fields.
```

This applies to:

```text
players
teams
games
```

---

# 35. FIND OTHER RAW PROVIDER ID LEAKS

Search rendered/string output and code for provider IDs appearing as user-facing labels.

Patterns may include:

```text
16106127
```

and raw game IDs where names/labels are expected.

Audit:

```text
Explore Players
player pages
team pages
games
standings
transactions
compare
search
```

Generate:

```text
07_raw_provider_id_leak_audit.csv
```

---

# 36. DO NOT ASSUME THE SCREENSHOT IS THE ONLY FAILURE

The screenshot proves at least one normalization boundary is broken.

Actively search for adjacent cases caused by the same source.

Especially inspect:

```text
teamName

teamAbbr

teamId

providerTeamId

teamIdProvider
```

on every `PlayerSeason` construction/transform path.

---

# 37. PLAYER BOARD SPECIFIC QUALITY TEST

For each current board row where team is expected:

require one of:

```text
VALID_CANONICAL_TEAM

VALID_MULTI_TEAM

EXPLICIT_NO_TEAM
```

Never:

```text
RAW_PROVIDER_ID
```

Generate counts for 2024-25 and 2025-26.

---

# 38. ALL 30 TEAM COVERAGE FROM PLAYER BOARD

For current supported data, verify NBA player-board team IDs cover/resolvably map to all represented NBA teams.

Report:

```text
unique NBA team ids seen

resolved

unresolved

unexpected
```

---

# 39. WORKBOOK V2 FINDING

The human review also discovered that Workbook v2's critical source snapshot does not include enough implementation detail for these failures.

At minimum it lacks complete reviewability for:

```text
Explore Players team cell implementation

/games/[gameId] page

game query/provider lookup

game link generation

canonical team-map data implementation
```

Treat:

```text
WORKBOOK_V2_REVIEW_COVERAGE
=
INCOMPLETE_FOR_IDENTITY_ROUTING
```

---

# 40. WORKBOOK v2.1 AFTER REPAIR

Do not overwrite v2.

After P17.2 passes, create:

```text
reports/project_workbook_v2_1/
```

Add/update:

```text
TEAM_PROVIDER_NAMESPACE_CONTRACT.md

PLAYER_TEAM_IDENTITY_PIPELINE.md

GAME_IDENTITY_AND_ROUTING.md

GAME_LINK_CONTRACT.md

RAW_PROVIDER_ID_LEAK_AUDIT.md
```

---

# 41. CRITICAL SOURCE SNAPSHOT v2.1

Include actual current source for:

```text
team-map

NBA team metadata

PlayerSeason type

NBA player-season transformer/provider

Explore Players table/team cell

player destination identity/header

TeamLogo / team brand components

/games/[gameId]/page.tsx

game query layer

game provider/transformer

game link helpers

scores/explore-games components creating hrefs
```

This is mandatory.

---

# 42. REAL SOURCE MAP

Workbook v2.1 must include a complete:

```text
SOURCE_CODE_MAP.csv
```

covering all high-risk product identity/routing code.

Do not call the workbook complete while those paths are absent.

---

# 43. DO NOT REBUILD WHOLE PRODUCT

Keep scope surgical.

Do not redesign:

```text
Learn
Home
ASK
Compare
overall player page
team page visual system
```

unless an identity fix requires a small shared adjustment.

The core objective is correctness.

---

# 44. ANALYTICS REGRESSION

Require exact unchanged:

```text
2024-25
DRBL
R1 Points
R1 WinEq
rank

2025-26
same
```

Mismatches:

```text
0
```

---

# 45. HISTORICAL REGRESSION

For:

```text
2020-21
2021-22
2022-23
2023-24
```

require all canonical analytical mismatches:

```text
0
```

and support-tier mismatches:

```text
0
```

---

# 46. RESEARCH FIREWALL

Require unchanged:

```text
M17a.2
M17b
M18a
M18b.0
```

M17c:

```text
NOT_STARTED
```

---

# 47. TESTS — TEAM NORMALIZATION

Add deterministic tests for all 30 mappings:

```text
NBA Stats ID
→
canonical team
→
brand
→
route
```

Require:

```text
30/30
```

---

# 48. TESTS — PLAYER TEAM RENDER CONTRACT

Test rows containing NBA Stats IDs such as the family:

```text
16106127xx
```

After normalization:

```text
raw id not rendered as label
correct canonical identity rendered
```

Use repository-known IDs, not guessed fixtures.

---

# 49. TESTS — GAME ROUTING

Add tests proving:

```text
link emitted by Scores
can be loaded by /games/[gameId]

link emitted by Explore Games
can be loaded by /games/[gameId]

link emitted by Home
can be loaded by /games/[gameId]
```

Test provider variants actually used in production.

---

# 50. TEST FALSE 404

Add regression test:

```text
valid game
+
supplemental provider failure
≠
notFound()
```

if current architecture permits graceful partial rendering.

---

# 51. RUN ENGINEERING

Run:

```text
npm run drbl:test
```

Run product identity tests.

Run game routing tests.

Run:

```text
test:data-truth
test:site-nav
```

Run:

```text
npx tsc --noEmit
```

Run:

```text
npm run build
```

All deterministic tests must pass.

---

# 52. DEV-SERVER VISUAL QA IS MANDATORY

Actually render/click.

Do not declare PASS from source/test inspection only.

Desktop and mobile where player/team identity changed.

---

# 53. NO M17C UNTIL HUMAN REVIEW

Even after P17.2 completes:

```text
M17C_STARTED=NO
```

Stop for human audit.

---

# 54. REQUIRED REPORTS

Create:

```text
reports/product_completeness_v1_2/

00_freeze.json
01_team_namespace_contract.md
02_nba_to_canonical_team_crosswalk.csv
03_explore_player_team_lineage.md
04_player_destination_team_lineage.md
05_game_route_forensics.md
06_game_link_inventory.csv
07_raw_provider_id_leak_audit.csv
08_player_board_team_quality.csv
09_game_route_test_matrix.csv
10_player_team_route_qa.csv
11_visual_qa_index.md
12_current_production_regression.json
13_historical_regression.json
14_research_seal_integrity.json
15_engineering_results.json
16_workbook_review_coverage.md
17_remaining_debt.md
18_product_health.json
19_full_audit.md
20_p17_2_seal.json
```

---

# 55. REQUIRED HEALTH OUTPUT

Report:

```text
RAW_NBA_TEAM_ID_UI_LEAK_FIXED
YES / NO

NBA_TEAM_NAMESPACE_SUPPORTED
YES / NO

NBA_TEAM_IDS_RESOLVED
<count>/30

PLAYERSEASON_TEAM_CONTRACT
<exact>

EXPLORE_PLAYER_ROWS_RAW_TEAM_IDS_RENDERED
0

PLAYER_PAGE_TEAM_IDENTITY_COMPLETE
YES / NO

PLAYER_PAGE_TEAM_LINK_CANONICAL
YES / NO

MULTI_TEAM_ROW_POLICY
<value>

GAME_ROUTE_ROOT_CAUSE
<value>

PUBLIC_GAME_ID_CONTRACT
<value>

GAME_LINKS_AUDITED
<count>

VALID_GAME_404_FAILURES
0

HOME_TO_GAME
PASS / FAIL

SCORES_TO_GAME
PASS / FAIL

EXPLORE_GAMES_TO_GAME
PASS / FAIL

CURRENT_ANALYTICS_MISMATCHES
0

HISTORICAL_ANALYTICS_MISMATCHES
0

RESEARCH_SEALS_CHANGED
NO

DRBL_TESTS
PASS

TEAM_IDENTITY_TESTS
PASS

GAME_ROUTE_TESTS
PASS

TYPECHECK
PASS

BUILD
PASS

VISUAL_QA
PASS

WORKBOOK_V2_1_COMPLETE
YES / NO

PRODUCT_COMPLETENESS
PASS / PARTIAL / FAIL

M17C_STARTED
NO
```

---

# 56. HARD STOP CONDITIONS

Immediately stop if:

```text
component-level hardcoded NBA→ESPN mapping is introduced

bare numeric provider ids are guessed across namespaces

raw NBA team id remains user-visible as team label

player page still receives unresolved NBA team id where canonical is expected

valid game still routes to 404

game route fix redirects every unknown id to a random provider

network failure is misclassified as game-not-found

historical identity regresses

DRBL values change

R1 values change

k changes

P1 changes

M17c starts
```

---

# 57. REQUIRED FINAL RESPONSE

Respond exactly:

```text
P17.2 PROVIDER IDENTITY + GAME ROUTING REPAIR — STOP FOR AUDIT

1. Freeze
- branch:
- source HEAD:
- current HEAD:
- dirty:
- result:

2. Human regression reproduction
- Explore raw NBA team id leak reproduced:
- player page team failure reproduced:
- game 404 reproduced:
- result:

3. Team provider namespaces
- ESPN:
- NBA:
- BDL:
- canonical product key:
- cross-provider guessing:
  NO
- result:

4. NBA team crosswalk
- NBA ids:
- resolved:
- unresolved:
- duplicates:
- source:
- result:

5. PlayerSeason team contract
- before:
- after:
- raw provider field:
- canonical field:
- result:

6. Explore Players
- raw team ids before:
- raw team ids after:
  0
- logo:
- abbreviation/name:
- multi-team behavior:
- result:

7. Player destination
- current team identity:
- logo:
- label:
- canonical link:
- historical identity:
- unresolved state:
- result:

8. Game route forensics
- broken href source:
- href id:
- id provider:
- destination expected provider:
- root cause:
- result:

9. Game ID contract
- ESPN ids:
- NBA ids:
- BDL ids:
- canonical/public route behavior:
- ambiguous handling:
- result:

10. Game link repair
- Home:
- Scores:
- Explore Games:
- other:
- result:

11. Game destination
- current completed game:
- scheduled game:
- historical game:
- invalid id:
- provider failure:
- false 404s:
- result:

12. Raw provider leak audit
- player surfaces:
- team surfaces:
- game surfaces:
- remaining leaks:
- result:

13. Visual QA
- Explore Players screenshot:
- player current:
- player historical:
- game from Home:
- game from Scores:
- game from Explore:
- mobile:
- result:

14. Analytics regression
- current mismatches:
  0
- historical mismatches:
  0
- result:

15. Research firewall
- seals changed:
  NO
- M17c:
  NOT_STARTED
- result:

16. Engineering
- drbl:test:
- team identity tests:
- game routing tests:
- data-truth:
- site-nav:
- typecheck:
- build:
- result:

17. Workbook v2.1
- generated:
- identity namespace docs:
- player team pipeline:
- game routing docs:
- critical game source included:
- Explore player source included:
- source map complete:
- ZIP:
- result:

18. Remaining debt
- ...

19. Final status
- RAW_NBA_TEAM_ID_UI_LEAK_FIXED:
- PLAYER_PAGE_TEAM_IDENTITY_COMPLETE:
- GAME_DESTINATION_ROUTING_COMPLETE:
- PROVIDER_NAMESPACE_CONTRACT_COMPLETE:
- PRODUCT_COMPLETENESS:
  PASS / PARTIAL / FAIL

20. Recommendation
- M17C_AUTHORIZED_AFTER_REVIEW:
  YES / NO
- NEXT_MILESTONE:
  M17c_EXTERNAL_COMMON_TARGET_BENCHMARK /
  PRODUCT_IDENTITY_REPAIR /
  GAME_ROUTING_REPAIR
- reason:

21. Files generated
- ...

STOP
```

# FINAL STANDARD

The screenshot is now a test.

A team cell is not correct because it contains a technically valid database ID.

It is correct only when:

```text
provider-native team identity
        ↓
explicit provider normalization
        ↓
canonical product team
        ↓
correct logo/name/link
```

Likewise, a game link is not correct because the route exists.

It is correct only when:

```text
link's game-id namespace
        =
destination lookup contract
```

or a deterministic normalization layer bridges them.

Repair the identity boundaries.

Do not decorate raw IDs.

Do not guess provider namespaces.

Do not hide a valid game behind a false 404.

Do not start M17c.

STOP.
</user_query>