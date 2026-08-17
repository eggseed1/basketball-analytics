# Explore sort semantics (M16k0.1)

## Classification

```text
EXPLORE_PAGE_CLASSIFICATION = GENERAL_PLAYER_EXPLORER
```

Evidence:
- Route title/metadata: "Explore Players" / filterable player exploration
- Copy: full historical player pool for filtering/sorting/search
- Not labeled as a dedicated DRBL leaderboard
- Sort options include traditional box-score metrics plus DRBL fields

## Current default sort

```text
TABLE_DEFAULT_SORT = pointsPerGame (desc)
```

Source: `src/lib/player-explore-sort.ts` `getPlayerSortOption` fallback.

Note: M16k0 inventory text said "default WAR"; code default is **pointsPerGame**.
DRBL-WAR remains an available column/sort key, not the default.

## Canonical DRBL rank vs table sort

```text
CANONICAL_DRBL_RANK = descending validatedDRBL100 (shadowRank)
TABLE_DEFAULT_SORT = independent product choice (currently PPG)
```

Because the page is a general explorer, default PPG (or WAR) sort may remain,
provided any UI label "DRBL Rank" uses validated shadow rank at cutover.

## Blocker?

```text
EXPLORE_SORT_SEMANTICS_BLOCKER = NO
```

Default table sort is **not** required to equal DRBL rank for a general explorer.
