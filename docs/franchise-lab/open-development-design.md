# Franchise Lab: open-ended player development

## Product goal

**A second-rounder should be able to earn an All-Star career, but no development
button should guarantee it.** Drafting discovers a set of tools, strengths and
uncertainties; coaching, opportunities and training turn them into an actual
basketball player over multiple seasons.

This is an alternative to a hidden *fixed final-overall ceiling*. The new
learning profile is deliberately a probability-shaper, never a promise of
finishing at an exact OVR.

## Product principles

1. **Simple in the interface, deep in the simulation.** The first decision is
   *which skill to emphasize*. An optional playing-time plan and the existing
   two mentorship slots supply further levers. No attribute spreadsheets or
   talent-point allocation are required.
2. **No minutes exploit.** Quality of exposure and sustained production matter;
   40 MPG does not confer a linear bonus over 30 MPG. Rotation plans require
   a real role, while practice remains useful for a bench prospect.
3. **Skills shape archetype.** Training improves position-appropriate
   attributes (e.g. perimeter defense for guards, interior defense for bigs).
   It does not transform a small guard into a rim-protecting center.
4. **Talent is not destiny.** Hidden learning and skill aptitudes are
   deterministic per prospect and persist through trades, seasons and saves.
   A late pick may roll unexpectedly well; a top pick may plateau.
5. **Breakouts revise the outlook, not a number.** Mentorship and excellent
   season-long play can strengthen a player's future learning rate with
   diminishing returns. There is no +4 career cap for generated rookies.
6. **Keep league history credible.** Soft OVR and skill saturation make
   movement beyond 85–90 harder; aging and injuries remain important. Current
   NBA players retain their original calibration until a separate measured
   migration is validated.
7. **Same engine for humans and CPU.** CPU teams don't need to click through
   the UI, but their players use the same underlying skills, rewards, aging
   and constraints.

## Current implementation (initial slice)

- New model-2 generated prospects learn through a hidden development profile
  with general learning rate, adaptability and four skill aptitudes.
- Hidden original potential traits are *tendencies*, not a final rating lock.
- Positive growth runs through position-aware skill improvement, season
  performance, coaching, staff, mentoring and work ethic. Elite ratings
  encounter soft diminishing returns, not a fixed cap.
- Breakouts/mentoring increase persistent development discovery rather than
  the historical overall ceiling. Exceptionally productive generated players
  aged 26–29 can still unlock a late breakthrough, but require at least
  55 games, 1,400 minutes, efficient scoring and substantially better production
  than their opening rating. Older player types preserve the legacy
  implementation to avoid rewriting real-world ratings overnight.
- Development UI leads with a player and a skill-direction selector, then a
  concise observed-status summary; the playing-time plan is optional.
- Finishing is now a distinct focus: guards and wings develop drives and layups,
  while bigs develop inside touch, standing finishes and post control. Older
  persisted four-skill learning profiles remain valid with deterministic
  fallback affinity; no preexisting save needs a reset.
- The season tracker and generated-player page do not advertise a hidden
  ceiling; historic upgrades remain visible as development milestones.

## Important follow-up iterations after measuring the first release

- Calibrate 10–30 seasons and more seeds: mean OVR by career year, rookie
  survival rates, proportion reaching 80/85/90, and roster rating distributions.
- Calibrate how often *true late bloomers* trigger at ages 26–29;
  the initial strict full-season breakout path is implemented, but the frequency
  must be checked across multiple career cohorts.
- Allow one or two independent skill groups to plateau while others progress
  and preserve realistic physical limits. Test whether a chosen role actually
  changes shot mix and rotation usefulness, not only cosmetic attributes.
- Improve CPU training priorities based on roster fit and realistic team
  strategy; test human-to-CPU growth parity.
- Add a brief annual scouting/development narrative showing evidence and
  outcomes, **not hidden DNA** or exact success probabilities.
- Preserve legacy save compatibility and include migration checks before
  extending this model to the whole NBA population.

## Primary design risks and evaluation

| Risk | Guardrail |
| --- | --- |
| Every rookie becomes a star after enough minutes | Saturating experience and high-rating growth friction; population-calibration tests |
| Youth develops too slowly | Practice-first path, staff, work ethic, mentoring and partial seasonal progress |
| Preordained talent hides behind a new label | Broad overlap in learning profiles and rare unexpected high-growth outcomes |
| Every position becomes interchangeable | Skill focus maps to role-appropriate attributes |
| Progression breaks historic leagues | Existing NBA players remain on calibrated legacy progression in this slice |
| Save/reload rerolls talent | Seeded player identity and persisted profiles; immutable season checkpoint guards |
| UI overwhelms casual players | One main skill choice, optional plan and existing two mentorship cards |

### Research and inspiration

NBA aging trajectories vary by player, position and exposure. A longitudinal
Bayesian analysis of decades of NBA data found a mean inflection around ages
28–29 but considerable player-level variation; minutes also contribute to
the modeled trajectory. The simulation treats those findings as broad
constraints rather than deterministic career predictions.

- [Large data and Bayesian modeling—aging curves of NBA players](https://pmc.ncbi.nlm.nih.gov/articles/PMC6690864/)
- [NBA 2K27 MyNBA overview](https://newsroom.2k.com/news/nbar-2k27-mynba-answers-the-community-with-a-back-to-basics-franchise-overhaul-and-modern-cba-rules)

## Rollout

Gate on new profile regression, browser/mobile test, existing growth/mentor
tests and leaguewide 5-year simulations. Do not broaden to historic NBA
players or deploy a model with pathological superstar inflation.
