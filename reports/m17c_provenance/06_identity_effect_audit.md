# Identity effect audit (P17.3 vs M17c)

## DISPLAY_IDENTITY_CHANGED

**YES**

P17.3 (`5614ce3`) changed product presentation of player–team identity:

- season-context branding on player pages
- career enrich without overwriting stint team
- multi-team / TOT display policy
- board row pick for season pages (`pickPlayerSeasonBoardRow`)
- `nba-data-provider` career/game-log presentation helpers

These affect UI brand, team link, and season presentation only.

## RESEARCH_IDENTITY_CHANGED

**NO**

M17c research joins do **not** use `nba-data-provider` or `player-team-context`.

From `scripts/drbl-m17c.ts`:

| Need | Source |
|------|--------|
| `playerId` (canonical) | `src/data/drbl/precomputed/*.json` + lineup player IDs from normalized games |
| `DRBL_pred` (`validatedDRBL100`) | `pl.drbl100` in precomputed |
| `teamIdPred` / `teamIdTarget` / `teamChanged` | `pl.teamId` in precomputed (predictor vs future season) |
| External BPM join | normalized name + season → precomputed `playerId` |
| Target L | `m18-lineup-impact-v1` on `data/drbl/normalized` games |

Git blob equality a229 ↔ 6bc55d7:

- all five M17c precomputed seasons: **identical**
- `drbl/research/m18/lineup-impact.ts`: **identical**
- `drbl/evaluation/m16c-dataset.ts`: **identical**

Inter-commit player field scan (2738 overlapping player-seasons):

- `drbl100` mismatches: **0**
- `teamId` mismatches: **0**
- `r1Points` mismatches: **0**

Therefore:

```text
research player identity changed: NO
research team-change classification changed: NO
external join changed: NO
```
