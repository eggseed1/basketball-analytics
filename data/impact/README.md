# Optional LEBRON override
#
# Place a CSV named `lebron.csv` in this folder to replace the in-repo seed.
# Required columns: player_name, season, lebron
# Optional: o_lebron, d_lebron, wins_added, team, team_abbr, player_id
#
# Export historical seasons from BBall Index and drop them here.
#
# Season-true impact index (see docs/historical-impact.md) reads this CSV and
# optional ESPN↔NBA aliases from `player-id-aliases.json`.
# Do not put live/current overlays here unless each row is explicitly season-keyed.
