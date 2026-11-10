# Franchise Lab: player development and mentorship

## One simple player-development loop

The GM picks a **skill focus** (shooting, creation, finishing, defense or
rebounding) and optionally a **playing-time plan**. Players earn growth over
four in-season checkpoints and a larger offseason progression window.
Current attributes, minutes, efficiency, awards, age, coach/development
staff, work ethic, injury and the selected focus influence those results.
For generated players, the hidden learning profile affects *how fast* a
skill responds; it does not set a final overall destination. Once drafted,
they show a **development trait** (Bust, Normal, Star, Superstar, X-Factor)
derived from their actual learning pace, adaptability, skill aptitudes and
earned learning discoveries. Scouting never reveals the exact trait before
the pick, and the tier is not a predicted final OVR. Short-term outlooks
(Developing, Rising, Veteran, etc.) remain distinct from the learning trait.

A player's demonstrated strength also sets a minimum: 90+ OVR cannot be
below Star, **95–97 OVR cannot be below Superstar**, and 98+ OVR displays
X-Factor. This applies even to existing imported saves with obsolete
development labels. The effective tier guides growth calculations on the
open development path and syncs to saved sheet data on the next review.

- **Practice-first:** keeps a young bench player developing at limited
  minutes, though game evidence still helps.
- **Rotation reps:** rewards sustainable NBA participation, not forced
  40-minute nights.
- **Training camp:** two preseason focus assignments per team grant one-time
  skill changes with a small fatigue or soreness cost. They do not guarantee
  an overall jump or change a ceiling.
- **Breakout season:** sustained, efficient production can permanently improve
  how a generated young player learns, with diminishing returns. Late
  (age 26–29) breakthroughs require especially strong evidence.

### Two different underlying growth paths

| Player | Real outcome of a development milestone |
| --- | --- |
| Generated draft-model-2 player | Persistent, bounded improvement in skill-learning response through `developmentProfile.discovery`; **no fixed final OVR ceiling** or guaranteed star tier. |
| Existing NBA / old-generation player | Retains historical sheet potential calibration; rare milestone can increase the legacy ceiling by 1–3, with a combined **+4 career limit**. This is only for legacy compatibility and is not a direct OVR gain. |

For save compatibility, both paths still persist their milestone history in the
old `ceilingGrowth` key. On model-2 players its `gain` and `total` count
*discovery opportunities*, **not additional OVR points**. Do not present
these as "potential +N" in the new game UI.

Migrating every real NBA player's growth to the open model is a separate,
league-wide calibration effort. We should not silently remove calibrated
ceiling behavior from existing NBA saves without extensive multiseason tests.

## Mentorship

A learner must be **25 or younger**; their contracted veteran must be
**28 or older**, at least **five years older**, on the **same team** and at
the **same primary position**. Each veteran mentors at most one player;
each team can maintain **two active pairings**. A trade, contract change or
position change deactivates an invalid pairing.

While active, mentoring adds **4–18% to growth pace** during both
regular-season and offseason checkpoints. This represents help with practice,
so it can work even without heavy NBA minutes. Mentor quality depends on
their current OVR and modeled work ethic, not on a hidden future-potential
number.

A mentor can teach **eligible badge XP** while **both players actually
appear in the same game**. The pupil must independently meet the badge's
attribute requirement; mentoring cannot bypass skill gates or grant ratings
from nowhere. Mentoring does not give instant OVR points.

After **20 real co-appearances in the same season**, a rare season-end
mentoring milestone can occur. Its chance is **3–12%**, depending on
mentor quality, and an internal 1–3 discovery-unit roll follows. For
generated players this slightly strengthens future learning, subject to
diminishing returns: **it does not increase a final OVR cap**. For
historic/legacy players it retains the older limited ceiling rule.

All season-end rolls are deterministic for the learner and year and are
reviewed at most once. Changing a veteran or reloading a save does not
reroll a failed attempt; a completed review does not double-award progress.

## Other guardrails

- Development traits adjust growth pace but do not assign a guaranteed career
  outcome for generated players. The offseason assessment can change traits
  based on sustained performance and accolades.
- Elite skills and OVR face steep soft growth friction. An unusual player
  can still reach 98–99 while the ordinary population remains balanced.
- Badges gain XP from actual official-game evidence and are capped by learned
  attributes. Their possession effects do not increase OVR or development
  potential.
- CPU teams use the same growth checkpoints, badge eligibility, staff and
  mentorship constraints.
- Real NBA player ratings and historical saves retain their original
  calibration during this rollout.

## Verification

`npx tsx scripts/test-gm-dev-traits.ts` checks generated learning tiers, elite
OVR floors, deterministic identities and alignment with actual growth.

`npm run test:franchise-development` validates team limits, eligibility,
mentorship continuity, real co-appearances, rare annual reviews, legacy
ceiling caps, and training-camp replay guards.

`npm run test:franchise-mentorship-open-path` validates generated-player
learning discoveries, the 20 co-appearance threshold, saved profiles,
replay safety, and the lack of any predetermined OVR ceiling changes.

`npm run test:franchise-badges` validates joint-appearance badge teaching,
attribute gates, XP idempotence, and simulation effects.

Full draft-cohort, 10-year talent, browser, simulation and roster-balance
regression suites gate any change to how quickly players gain ratings.
