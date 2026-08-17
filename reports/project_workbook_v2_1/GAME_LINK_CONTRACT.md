# GAME_LINK_CONTRACT

See also: `reports/product_completeness_v1_2/06_game_link_inventory.csv`.

## Rule

```text
link generator id namespace
  =
destination lookup contract
```

or an explicit deterministic normalizer bridges them.

## Surfaces

- Home scoreboard cards → `/games/{espnEventId}`
- Scores → same ESPN contract
- Explore Games → id shape selects espn/nba/bdl path
- ASK / player / team game links → same helpers

Valid games must not 404; network/provider failures must not be classified as semantic not-found.
