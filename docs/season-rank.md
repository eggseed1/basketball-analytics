# Rank My Seasons (methodology v1.0)

Canonical module: `src/analytics/rank-player-seasons.ts`  
Query: `src/data/queries/player-season-rank.ts`  
Route: `/players/[playerId]/season-rank?seasons=2008-09,2012-13,…`

Builds on **Best Season Lab** pairwise comparisons (`comparePlayerSeasons`).  
Does **not** invent an opaque universal season score.

## What “best” means here

For a selected set of regular-season years:

1. Run `comparePlayerSeasons` for every unordered pair  
2. Take each pair’s **overall** result (category plurality)  
3. Aggregate with **Copeland points**  
4. Sort eligible seasons by those points  

CPI remains a **production** metric inside pairwise comparisons. It is never the ranking model. A production-only CPI appendix is shown for transparency only.

## Set limits

| | |
| --- | --- |
| Minimum | 2 |
| Default | 4 (peak preferred + highest-CPI qualifying seasons) |
| Maximum | 8 |

## Copeland ranking

| Pairwise overall | Points for each season |
| --- | --- |
| Win | 1 |
| Essentially even | 0.5 |
| Loss / unavailable | 0 |

Tie-breakers (deterministic):

1. Copeland points  
2. Pairwise wins  
3. Fewer pairwise losses  
4. Season id (`localeCompare`)

## Eligibility

Uses the same qualification concepts as Career Resume / season compare:

- Qualifying sample required for a ranked place  
- Incomplete current seasons → **not eligible** (shown with a note)  
- Ineligible seasons appear below eligible ones without a competitive rank number  

## Impact

Identical gate as two-season compare:

- Same season-true metric on **both** sides of a pair  
- Otherwise impact is unavailable for that pair  
- Missing impact is never treated as zero  

## Non-transitive / close results

- If the win graph among eligible seasons contains a **cycle**, `contested = true`  
- If the top two Copeland scores differ by ≤ 0.5, `closeTop = true`  
- Ranking is still shown, but the UI states that the order is contested / close  

## Matrix → rabbit hole

Matrix cells link to `/players/[id]/season-compare?a=&b=` so users can open the full dimensional comparison.

## Explicit non-goals

- No weighted “Season Score = 87.4”  
- No mixing playoffs into v1  
- Does not overwrite Career Resume CPI Peak  

## Tests

```bash
npm run test:player-season-rank
npm run test:player-season-compare
```
