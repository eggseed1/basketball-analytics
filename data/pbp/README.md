# Historical PBP data directory

This directory is the **default** attach point for an externally imported
play-by-play corpus (`manifest.json` + event files).

- Large event files are **gitignored**.
- Point large shared volumes at the app with `PBP_DATA_PATH` instead of
  copying into Git when possible.
- Attaching a corpus is for **batch / season-scale** workloads — it does
  **not** gate per-game PBP. Game Lab and `getGamePossessions` fetch
  on-demand from NBA CDN / stats.nba.com.

See `docs/historical-pbp-audit.md`.
