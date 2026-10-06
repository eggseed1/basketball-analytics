# Player salaries

`player-salaries-2000-2025.csv` — historical NBA player salaries. The Season
column is the year the season ends (2000 = 1999-00).

`player-salaries-supplement.csv` — same columns. Fills the newest finished
season and players missing from the main file's last season. Regenerate with
`npx tsx scripts/fetch-salary-supplement.ts`. The contract value model reads
both; the main file wins when a player appears in both.

Columns: `Player,Salary,Season` (Salary in USD).

Used by Franchise Lab / MyLeague contract seeding and the contract value
model. Unmatched names fall back to an era-scaled impact estimate against that
year’s max/min.
