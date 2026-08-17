# Historical PBP data directory

This directory is the **default** attach point for an externally imported
play-by-play corpus (`manifest.json` + event files).

- Large event files are **gitignored**.
- Point large shared volumes at the app with `PBP_DATA_PATH` instead of
  copying into Git when possible.
- Attaching a corpus does **not** enable ASK DRBL / Game Lab PBP execution
  (`getPbpCapability()` stays false until deliberately wired).

See `docs/historical-pbp-audit.md`.
