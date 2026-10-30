# Franchise Lab simulation and franchise update

The possession engine consumes the saved rotation, including custom two-minute shifts. Scores, shooting lines, assists, rebounds, turnovers, plus/minus, shared stints and the play-by-play feed come from the same events. Overtime adds actual minutes and possessions. CPU boxes keep compact statistics; the user's games retain their detailed feed.

Player profiles retain an entry statistical prior and an attribute baseline. Development and commissioner edits change the associated probabilities. Measured shooting rates receive sample shrinkage. Physical attributes use physical and age priors rather than overall impact. Optional impact overlays preserve zero; blank legacy metric families fall through to an estimate. Offense and defense come from one source family and reconcile with the total. The entry DRBL table applies only to its own season.

Lineups compare complete units with creation, shooting and interior coverage. Real starting roles inform the initial choice. The shared shift planner retains minute targets, staggers creators and reserves closing minutes. Position splits guide assignments within stints. Injury substitutions keep a backup of the original rotation, restored when the roster is healthy. Other teams' signings do not reset the user's coaching.

The franchise desk adds team direction and goals, development focuses, minutes promises, closing lineups, position splits, saved trade conversations and legal counters. Trade value uses a continuous talent curve with age, team control, salary relative to the cap and availability. Asset ownership and duplicate assets are checked before a trade.

Completed seasons retain standings, awards, champions, trades and player statistics. Player pages and the archive use those simulated years. Save imports create a separate slot. Commissioner tools edit attributes and import/export custom draft classes before the first selection. Settings control injuries, development, trading difficulty, pace and simulation pauses.

Existing player sheets and saved rotations are preserved during migration. Their initial overall calibration stays with them through development. Past games are retained; they are not resimulated.

Validation:

- `npm run test:franchise-lab` checks deterministic events, score and minute accounting, plus/minus, development, continuous trade value, ownership, migrations, exports, promises, archives and custom draft classes.
- `npm run test:franchise-calibration` compares 180 simulated games with bundled 2025-26 league rates. It checks scoring, shooting percentages, shot mix, assists, rebounds, turnovers, steals and blocks.
- Existing GM rotation, lineup, scouting, contract, trade and offseason checks remain available under `scripts/test-gm-*.ts`.

The profile still estimates skills that the entry data does not measure, including detailed shot difficulty and some defensive assignments. The calibration is a distribution check on a retrospective season, not a claim of out-of-sample forecasting accuracy.
