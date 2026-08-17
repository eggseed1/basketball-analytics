# Local tracking inventory (M18b.0)

## Summary

TRACKING_LOCAL_TIER = **T3_SHOT_LOCATION_ONLY** (with T2 public aggregate *API helpers*, no local T0/T1 archives)

| Path check | Present |
|---|---|
| `data/tracking` | false |
| `data/sportvu` | false |
| `data/second-spectrum` | false |
| `data/hawk-eye` | false |

## What exists in-repo

1. **Shot location x/y** in CDN/normalized PBP/events (not optical tracking).
2. **Public aggregate clients** in `drbl/models/public-tracking.ts` (`leaguedashptstats`, `leaguehustlestatsplayer`) — season totals, not frames.
3. **No** full-frame SportVU / Second Spectrum / Hawk-Eye raw files in this workspace.

## Classification

| Asset | Tier |
|---|---|
| Frame-level player+ball coordinates | T4 (absent locally) |
| Event-aligned spatial trajectories | T4 (absent) |
| Season tracking aggregates (API) | T2 (code only; not acquired as research corpus here) |
| Shot x/y | T3 |

Shot-location x/y is **not** classified as optical tracking.
