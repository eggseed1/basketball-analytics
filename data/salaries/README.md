# Player salaries

`player-salaries-2000-2025.csv` — historical NBA player salaries. The Season
column is the year the season ends (2000 = 1999-00).

`player-salaries-supplement.csv` — same columns. Fills the newest finished
season and players missing from the main file's last season. Regenerate with
`npx tsx scripts/fetch-salary-supplement.ts`. The contract value model reads
both; the main file wins when a player appears in both.

`player-salaries-bref-archive.csv` — same columns, 2026-27 onward. The nightly
refresh copies the current season's column from the Basketball-Reference
contracts snapshot (`scripts/archive-bref-salaries.mjs`), so a season's
salaries stay after BRef drops it each July. It is read after the main file
and before the supplement.

Columns: `Player,Salary,Season` (Salary in USD).

Used by Franchise Lab / MyLeague contract seeding and the contract value
model. Unmatched names fall back to an era-scaled impact estimate against that
year’s max/min.
