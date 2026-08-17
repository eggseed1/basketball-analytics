# Remaining debt (P17.2)

- Human visual review still required before M17c authorization is acted on.
- Live BDL game sample `15908541` may be unavailable in some environments (tests skip).
- Optional NBA GameID live sample `0022400001` may miss; helpers still covered.
- `data/drbl` junction is required for full `drbl:test` in this worktree; leave it off during `next build` (Turbopack rejects out-of-root symlinks under `data/drbl/raw`).
- Workbook v2.1 ZIP may lag latest micro-edits to player destination link / TeamLogo digit guard — source of truth is the live tree + `critical_source_snapshot`.
- Historical player page screenshot not re-captured this pass (no intended identity regress).
