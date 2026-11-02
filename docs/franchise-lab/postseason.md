# Postseason games and brackets

The play-in action was calling the regular-season-only calendar guard. Every play-in click returned before simulating a game. The postseason action now checks its own phase, repairs a missing board when standings permit, and advances a completed board stranded on the play-in phase. The regression test runs the actual guard instead of replacing it with an unconditional success.

Play-in games can be simulated a night at a time or watched individually. First-night games finish before the final qualifying games open. Completed results remain accessible when the playoffs begin. A targeted watch action commits exactly one official game and opens its play-by-play viewer. Playback, pause, seeking and replay operate on the saved result; they do not simulate a second game or award duplicate progress.

Conference brackets use connected first-round, semifinal and conference-final paths. East and West controls keep the bracket readable, with local horizontal scrolling on smaller screens. The championship path joins the conference winners. Selecting a matchup opens its game list, individual box scores, replays and the next available game. Original seeds follow teams into later rounds.

New postseason records include optional game and box-score ids. Existing saves retain their ratings, roster and progress. Older records without ids find retained boxes by season, postseason type, teams and score, consuming repeated matches in calendar order. A missing historical box is labeled unavailable. An older box without an official feed uses the existing reconstructed replay and identifies that limitation. New postseason games retain their official event feeds for both user and CPU matchups. The existing 400-box retention limit still applies.

The box-score destination keeps final statistics visible while its chart previews. Watch mode begins with an empty scoreboard and updates player statistics with playback. Opening another game or switching between stats and watch resets the viewer.

`test:franchise-postseason` exercises the actual store actions through all six play-in games and all 15 playoff series, including reloads, individual-game targeting, seed retention, official feeds, legacy links and completed-board recovery. `smoke-gm-postseason.mjs` checks the actual buttons, bracket, box scores, watch/pause, saved links and a champion at phone and desktop widths. It also accepts `DRBL_VERIFY_BASE_URL` for checking the deployed client with isolated test saves.
