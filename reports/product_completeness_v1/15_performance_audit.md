# 15 — Performance audit

**Scope:** product-completeness surfaces touched in P17 (player destination, alias join, team logos, explore). Not a full Lighthouse run.

## N+1 / request amplification

| Area | Finding | Mitigation / status |
|---|---|---|
| Player season compare | Career loaded once; joins season-true impact without per-season career refetch | Documented in `player-season-compare.ts` (“without N+1 career fetches”) |
| Game lab / game vs season | Shared shell; avoid per-player game-log SSR fanout | `game-lab.ts` / box-score context notes prefer omitting per-player logs on SSR |
| Home analytics | Concurrent Suspense islands share one in-flight load | `homeInflight` dedupe + TTL cache |
| Player destination | Identity resolve + peers + season + career | Alias index memoized (below); still multiple provider calls per page — acceptable, watch ESPN board latency |
| Explore players board | Single board fetch + DRBL overlay map join | Overlay is O(n) map lookup after one alias index load |

**Residual risk:** live ESPN `byathlete` board remains the slow path; home already soft-times ESPN seasons (`ESPN_SEASONS_BUDGET_MS = 3500`).

## Logo CDN

| Asset | Source | Notes |
|---|---|---|
| Modern team logos | NBA CDN via `teamLogoUrl` / `nba-media` (`cdn.nba.com/logos/nba/...`) | `TeamLogo` uses `next/image` with `unoptimized` |
| Player headshots | `cdn.nba.com/headshots/...` | Prefer NBA person id when known |
| Historical logos | **Empty local map** | No CDN scrape; text marks / monograms instead |

Failure mode: `TeamLogo` / historical mark falls back to abbr monogram on error (`onError` → failed state). Decorative logos use `alt=""` (see a11y audit).

## Alias memoization

```ts
let aliasIndexPromise: Promise<PlayerIdAliasIndex> | null = null;
export async function getPlayerIdAliasIndex() {
  aliasIndexPromise ??= loadPlayerIdAliases();
  return aliasIndexPromise;
}
```

- Prevents re-parsing `player-id-aliases.json` (676 rows) on every overlay/resolve call within a process.
- `clearPlayerIdAliasCache()` exists for tests/scripts.
- Loader in `player-id-aliases.ts` builds `byEspn` / `byNba` maps once per load.

## Not claimed

- No production RUM / Core Web Vitals captured this seal.
- No assertion that player pages are within a latency SLO after alias load.
