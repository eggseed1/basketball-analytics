# Historical PBP import notes

## Coverage discovered
- **Earliest electronic NBA PBP on stats.nba.com:** `1996-97` (playbyplayv3)
- **CDN liveData** (`cdn.nba.com/.../playbyplay_*.json`): reliably available from ~`2019-20`
- Pre-1996: not available via these endpoints (no fabricated data)

## Import path
```bash
npm run drbl:import-historical -- --from 1996-97 --to 2023-24 --raw-only --delay 150
npm run drbl:import-historical -- --from 1996-97 --to 1996-97   # normalize+reconcile
```

## Fallbacks (no model retune)
- PBP: CDN → stats `playbyplayv3`
- Box: CDN → stats `boxscoretraditionalv3` adapted to CDN shape
- Historical action labels mapped in `drbl/ingest/normalize.ts` (Made Shot / Free Throw / SUB: X FOR Y)

## Known quality
- Scoreboard reconstruction works on sampled 1996-97 games after schema mapping
- Lineup minute reconciliation often fails on older seasons (starter/sub name resolution) → expect Tier B/C until lineup repair milestone
- DRBL v1 parameters unchanged
