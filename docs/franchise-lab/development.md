# Development desk

Home is the first working-desk link. Development has its own destination; the gear opens league settings. The creation gear configures a new save before roster selection. Existing `/gm/franchise` links retain the team plan, roles and history.

## Mentorship

A learner must be 25 or younger. A mentor must be a contracted teammate at the same primary position, at least 28 and five years older. Each veteran has one learner. The assignment follows the player, but becomes inactive when eligibility or team membership changes. CPU clubs use the same eligibility and public overall/work-habit inputs.

A valid mentor adds 4% to 18% to development work, scaled by overall and simulated work ethic. Work ethic is stored when supplied; otherwise it has a deterministic identity-based default. It is a game attribute, not an assessment of a real person's character.

Season-end ceiling reviews require 20 actual appearances by the learner while paired with the veteran. Their ceiling chance ranges from 3% to 12%, with a gain of 1 to 3. Better mentors also unlock the larger gain tiers. Rolls use the learner and season, so changing mentors or reloading cannot reroll them. The regular-season stat recorder maintains shared-game counts and the opening overall.

## Breakouts and limits

Reviews happen after the regular season, before the final development pass. A player must be 25 or younger with 40 games, 1,000 minutes and at least 54% true shooting. A game-model performance score uses per-36 points, assists, rebounds, steals, blocks, turnovers and efficiency. It must exceed opening overall by six; a gap of twelve earns two points, otherwise one. This is a game balance rule, not an NBA projection or empirical probability.

Mentorship and breakouts draw from one permanent +4 career allowance. Absolute ceilings cannot exceed 99. The ledger, annual review mark and opening baseline survive saves, trades and summer rollover. Original ceiling calibration and trait rarity remain intact. A ceiling award opens growth room; it does not immediately add overall or assign a star trait.

## Training camp

Each club has two individual slots. Staff still affects the skill gain. A focus grants its saved one-time attribute changes at the preseason camp step. It never raises the ceiling. Players receive two team games of fatigue (a 2% shooting penalty), or one game of soreness. Baseline soreness risk is 6%, scaled by the injury-frequency setting. It cannot leave a club with fewer than five healthy players. CPU clubs use the same slots and tradeoffs.

The skill preview, risk disclosure and result use the same saved assignments. Camp results prevent a second application after reload. Unrun legacy camps retain their first two assignments; already saved camp results remain intact. Fatigue follows the player and decreases only when his team plays a counted game.

## Validation

`test:franchise-development` covers pairing constraints, teammate changes, fractional growth, actual shared games, save/reload, breakout sample requirements, deterministic rare reviews, combined career limits, replay guards, camp limits and fatigue recovery. The browser audit checks Home placement, Development at phone/desktop widths, focus and mentorship persistence, settings navigation and creation settings applied to a new slot.
