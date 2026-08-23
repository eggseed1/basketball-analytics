# Possession calibration artifacts

Outputs from `npm run audit:possession-reconstruction`.

| File | Purpose |
| --- | --- |
| `latest.json` | Full structured summary + per-game rows |
| `latest.md` | Human-readable methodology and feature readiness |
| `games.csv` | One row per attempted game (includes failures) |
| `checkpoint.json` | Resume state for live audits (gitignored) |
| `cache/` | Optional raw response cache (gitignored) |
| `fixture-run/` | Network-free CI / local fixture calibration |

Live audits are **not** part of ordinary CI. Fixture-only:

```bash
npm run test:possession-calibration
# or
npm run audit:possession-reconstruction -- --fixture-only --out artifacts/pbp-calibration/fixture-run
```
