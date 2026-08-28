/**
 * DRBL-family stat guides (ability rate, realized value, O/D halves, diagnostics, R1).
 * Plain copy stays concrete. Formulas live only in deep.formula.
 */

import type { StatGuide } from "./guides";

export const DRBL_STAT_GUIDES: StatGuide[] = [
  {
    id: "drbl",
    slug: "drbl-100",
    name: "DRBL/100",
    shortName: "DRBL/100",
    category: "proprietary",
    blurb:
      "How good was this player's impact, on a per-100-possessions scale? DRBL's headline ranking number for quality of play.",
    plain: {
      teaches: [
        "How strong the player looked when they were on the floor, scaled per 100 possessions.",
        "Think of it like a rate: points per game vs total points. DRBL/100 is the rate. WAR1 is the season total.",
        "Who ranks highest when the question is who played at a higher level, not who played the most minutes.",
      ],
      doesnt: [
        "How much value they piled up over a whole season. That is WAR1.",
        "Classic baseball-style replacement WAR. DRBL uses its own role-matched R1 baseline.",
        "A number you rebuild by adding DRBL-P, DRBL-LN, and DRBL-B. Those diagnostics do not sum into this headline rate.",
      ],
      upsides: [
        "Built from play-by-play, not guesswork from a box score alone.",
        "Role-matched R1 baseline so creators and finishers compare on fair ground.",
        "Validated shrinkage keeps tiny samples from hijacking early-season boards.",
        "The main sort on Explore and player pages when you ask who is better right now.",
      ],
      downsides: [
        "Needs DRBL coverage for that season.",
        "Pair with WAR1 when minutes differ a lot.",
        "Use DRBL-O, DRBL-D, and P/LN/B as extra context, not as a DIY rebuild of this number.",
      ],
      apply: [
        "Sort by DRBL/100 when asking who is better at the rate level.",
        "Open WAR1 when you care about full-season body of work.",
        "Trust this as DRBL's primary ability ranking.",
      ],
    },
    deep: {
      definition:
        "DRBL/100 is DRBL's validated ability rate: estimated player impact per 100 combined possession appearances versus a contextual, role-matched R1 reference. It is the EB1600 posterior of the raw ability rate shrunk toward zero, and the canonical DRBL ranking statistic for how good a player is.",
      formula:
        "rawAbilityRate = attributedValue / combinedPossessionAppearances × 100;  validatedDRBL100 = EB₁₆₀₀(rawAbilityRate) toward 0  ≡  (N/(N+k))×rawAbilityRate + (k/(N+k))×0  with k = 1600, prior mean = 0",
      calculation: [
        "Reconstruct possessions from public play-by-play and attribute Approach-B residuals vs a cutoff-frozen R1 expected-points baseline.",
        "Form rawAbilityRate as attributed value per combined possession appearances, scaled to per-100.",
        "Apply exact empirical-Bayes shrinkage EB1600: pull rawAbilityRate toward prior mean 0 with k = 1600.",
        "Publish the shrunk posterior as validated DRBL/100, the public ranking rate.",
        "Keep P, LN, and B as non-additive diagnostics. They explain the story behind the rate.",
      ],
      teaches: [
        "Stabilized ability rate vs role-matched R1.",
        "How sample size trades off against the k = 1600 prior.",
        "Clean split between rate ranking (DRBL/100) and season totals (WAR1).",
      ],
      doesnt: [
        "Individual predictive intervals for validated DRBL/100 in the public product.",
        "Causal replace-this-player-on-the-roster claims.",
        "A DIY sum of P + LN + B into the headline rate.",
      ],
      upsides: [
        "Transparent EB prior (mean 0, k = 1600) you can audit.",
        "Play-by-play attribution captures real possessions, not proxy guesses.",
        "Rate framing fairly compares stars and role players on minutes.",
        "Purpose-built as DRBL's flagship ability ranking.",
      ],
      downsides: [
        "Heavy shrinkage can briefly mute a true hot start.",
        "Coverage limited to seasons with validated DRBL pipelines.",
        "Team-level residual value sits outside this player rate.",
      ],
      apply: [
        "Use as the headline ability sort on player explorers.",
        "When DRBL/100 and WAR1 diverge, check minutes and volume first.",
        "Treat DRBL/100 as the authoritative how-good number inside DRBL.",
      ],
      sources: [
        "/learn/drbl",
        "DRBL public labels / EB1600 validation (P1 exact shrinkage)",
      ],
    },
  },
  {
    id: "r1_win_eq",
    slug: "war1",
    name: "WAR1",
    shortName: "WAR1",
    category: "proprietary",
    blurb:
      "How much season value did the player accumulate? DRBL's wins-style total above the role-matched R1 baseline.",
    plain: {
      teaches: [
        "DRBL/100 answers how good. WAR1 answers how much they added this season.",
        "Two players can look similar on DRBL/100 but differ a lot on WAR1 if one played far more minutes.",
        "WAR1 is Wins Above R1 inside DRBL. It uses DRBL's own baseline, not generic replacement-level WAR.",
      ],
      doesnt: [
        "A different ranking from R1 Points. Same order, friendlier units.",
        "A per-possession rate. Use DRBL/100 for that.",
        "Ignore minutes. Availability is part of season value.",
      ],
      upsides: [
        "The clearest DRBL answer for who delivered the most this season.",
        "Built from the same play-by-play ledger as DRBL/100.",
        "Fixed conversion to win-style units keeps the story easy to tell.",
        "Preferred headline for season value on boards and leader tables.",
      ],
      downsides: [
        "Rewards heavy minutes when the rate is merely good, not great.",
        "The WAR name can sound like other win metrics. Inside DRBL it means above R1.",
        "Does not price contracts or predict fit on a new team.",
      ],
      apply: [
        "Sort by WAR1 for who accrued the most this season.",
        "Always pair with DRBL/100 when minutes differ.",
        "Use WAR1 as DRBL's headline season-value number.",
      ],
    },
    deep: {
      definition:
        "WAR1 is DRBL's win-equivalent season-value statistic above its contextual R1 reference. Formally it is a fixed linear conversion of R1 Points by the frozen P1 points-per-win constant. The name is intended as Wins Above R1, but WAR1 is the public product label. It is not traditional WAR, R1 is a contextual role-matched reference, not a conventional fringe-player replacement baseline. Because the divisor is a fixed positive constant, rank(R1 Points) = rank(WAR1) exactly.",
      formula:
        "WAR1 = R1 Points / 37.490662671779255  (frozen P1);  rank(R1 Points) = rank(WAR1)",
      calculation: [
        "Accumulate Approach-B attribution above the role-matched R1 baseline into R1 Points (accounting total).",
        "Divide by the frozen P1 constant 37.490662671779255 to express win-equivalent units.",
        "Publish WAR1 as the preferred public cumulative metric; keep R1 Points for research/accounting.",
        "Do not interpret the result as causal replacement wins or as traditional WAR.",
      ],
      teaches: [
        "Linear rescaling of R1 Points into win-equivalent language.",
        "Exact rank equivalence with the underlying accounting total.",
        "Separation from ability-rate ranking (DRBL/100).",
        "Why playing time matters for value even when rates look similar.",
      ],
      doesnt: [
        "Independent information from R1 Points beyond unit choice.",
        "Calibrated uncertainty bands on the win total.",
        "A substitute for DRBL/100 on ability ranking.",
      ],
      upsides: [
        "Readable season-value currency for non-specialists.",
        "Frozen P1 avoids drifting conversions mid-product.",
        "Preserves full accounting fidelity of R1 Points.",
      ],
      downsides: [
        "Still inherits all attribution and baseline limitations of R1 Points.",
        "WAR naming collision requires constant disclaimers.",
        "Cross-era win meaning is not fully validated.",
      ],
      apply: [
        "Use for season-value leaderboards and body-of-work debates.",
        "Bookmark sorts on R1 Points should map to this ordering.",
        "Never stack with traditional WAR as if independent.",
      ],
      sources: [
        "/learn/drbl",
        "P1_POINTS_PER_WIN = 37.490662671779255",
      ],
    },
  },
  {
    id: "drbl_o",
    slug: "drbl-o",
    name: "DRBL Offense (DRBL-O)",
    shortName: "DRBL-O",
    category: "proprietary",
    blurb:
      "How much value did the player add on offense versus DRBL’s role-matched baseline? One side of the ball for context, not a second overall ranking.",
    plain: {
      teaches: [
        "Whether the player’s possession-side story is more offense-driven.",
        "A simple offense half of the DRBL-P diagnostic (alongside DRBL-D).",
        "Useful when two similar DRBL/100 players “feel” different on offense.",
      ],
      doesnt: [
        "Half of DRBL/100, O and D split the possession diagnostic, not the main ranking number.",
        "Something you can add to DRBL-D to rebuild DRBL/100.",
        "Proof of playmaking chemistry or scheme by itself.",
      ],
      upsides: [
        "Quick read on offensive contribution vs expectation for that role.",
        "Higher is better on both O and D.",
        "Helps tell one-way vs two-way stories without inventing a new ranking system.",
      ],
      downsides: [
        "Easy to over-weight versus the main DRBL/100 number.",
        "Splits are noisier than the combined view.",
        "Not camera-tracked “gravity” or creation grades.",
      ],
      apply: [
        "Open when debating offensive fit next to a strong overall rate.",
        "Read with DRBL-D; don’t add them into DRBL/100.",
        "Keep overall sorts on DRBL/100.",
      ],
    },
    deep: {
      definition:
        "DRBL-O is the offensive half of the possession component (DRBL-P): value added on offensive possessions versus the contextual role-matched R1 reference. Higher is better. DRBL-O + DRBL-D describes the P split, it is not DRBL/100 and must not be treated as additive halves of the validated ability rate.",
      formula:
        "DRBL-O = offensive half of DRBL-P (vs role-matched R1);  DRBL-O + DRBL-D ≠ DRBL/100",
      calculation: [
        "Attribute Approach-B residuals on offensive possessions against the R1 expected-points baseline.",
        "Express the offensive share as the DRBL-O diagnostic split of DRBL-P.",
        "Keep validation/ranking on DRBL/100; do not re-shrink O alone into a substitute overall rate.",
      ],
      teaches: [
        "Offensive contribution inside the possession diagnostic.",
        "Why O+D must not be sold as the canonical ability total.",
        "Role-matched offensive expectation, not league-average only.",
      ],
      doesnt: [
        "Half of validated DRBL/100 by construction.",
        "Shot-quality process grades or tracking gravity.",
        "Independent season win totals (see WAR1 / R1 Points).",
      ],
      upsides: [
        "Supports two-way storytelling without inventing a second ranking system.",
        "Consistent higher-is-better sign on offense.",
        "Tied to the same R1 language as the rest of DRBL.",
      ],
      downsides: [
        "Can be misread as “offense WAR.”",
        "Sample splits are noisier than the combined P view.",
        "A box-score-only shortcut. DRBL-O comes from possession attribution.",
      ],
      apply: [
        "Use as a diagnostic panel next to DRBL-P and DRBL-D.",
        "If O and D disagree strongly, check role and matchup before rewriting the overall rank.",
        "Never present O+D as canonical DRBL/100.",
      ],
      sources: ["/learn/drbl", "DRBL glossary: DRBL-O"],
    },
  },
  {
    id: "drbl_d",
    slug: "drbl-d",
    name: "DRBL Defense (DRBL-D)",
    shortName: "DRBL-D",
    category: "proprietary",
    blurb:
      "How much value did the player add on defense versus DRBL’s role-matched baseline? Higher is better, context next to DRBL/100, not a substitute for it.",
    plain: {
      teaches: [
        "Whether defense is a real part of the player’s possession-side story.",
        "The defensive half of DRBL-P, paired with DRBL-O.",
        "A check when a strong overall rate looks one-way on film.",
      ],
      doesnt: [
        "Half of DRBL/100, O and D split the possession diagnostic only.",
        "A complete defensive grade from steals and blocks alone.",
        "Proven camera-tracked contests, positioning, or “gravity.”",
      ],
      upsides: [
        "Higher means more estimated defensive value (same direction as offense).",
        "Helps separate offense-only seasons from two-way ones at the diagnostic layer.",
        "Uses the same R1 baseline language as the rest of DRBL.",
      ],
      downsides: [
        "Defense is usually noisier than offense in possession attribution.",
        "Diagnostic only, not the public ranking number.",
        "Easy to confuse with DBPM or tracking defense grades.",
      ],
      apply: [
        "Check when DRBL/100 looks offense-driven or defense-driven.",
        "Read with DRBL-O; don’t sum into DRBL/100.",
        "Prefer DRBL/100 for overall ability ranking.",
      ],
    },
    deep: {
      definition:
        "DRBL-D is the defensive half of the possession component (DRBL-P): value added on defensive possessions versus the contextual role-matched R1 reference. Higher is better (more defensive value). With DRBL-O it partitions P, it does not partition validated DRBL/100.",
      formula:
        "DRBL-D = defensive half of DRBL-P (vs role-matched R1);  DRBL-O + DRBL-D ≠ DRBL/100",
      calculation: [
        "Attribute Approach-B residuals on defensive possessions against the R1 expected-points baseline.",
        "Express the defensive share as the DRBL-D diagnostic split of DRBL-P.",
        "Leave canonical ranking on validated DRBL/100; treat D as disclosure, not a second overall rate.",
      ],
      teaches: [
        "Defensive contribution inside the possession diagnostic.",
        "Sign convention: higher defensive value is better.",
        "Non-equivalence of O+D with DRBL/100.",
      ],
      doesnt: [
        "Camera-tracked contests, positioning, or gravity.",
        "Causal claim that the player “locked up” a specific opponent.",
        "Calibrated defensive uncertainty intervals.",
      ],
      upsides: [
        "Makes one-way vs two-way possession stories inspectable.",
        "Consistent with R1 role-matched framing.",
        "Avoids forcing box-only defensive myths as the product truth.",
      ],
      downsides: [
        "Noisier splits invite overinterpretation.",
        "Can be confused with DBPM or tracking defense grades.",
        "No shipped claim of beating external defensive models.",
      ],
      apply: [
        "Use beside DRBL-O on advanced player disclosures.",
        "Investigate large O/D imbalances before labeling someone two-way.",
        "Keep overall sorts on DRBL/100.",
      ],
      sources: ["/learn/drbl", "DRBL glossary: DRBL-D"],
    },
  },
  {
    id: "drbl_p",
    slug: "drbl-p",
    name: "DRBL-P",
    shortName: "DRBL-P",
    category: "proprietary",
    blurb:
      "Possession-side diagnostic: how DRBL’s play-by-play attribution looks versus the R1 baseline. Parent of DRBL-O and DRBL-D, not a piece you add with LN and B to rebuild DRBL/100.",
    plain: {
      teaches: [
        "How the “what happened on possessions” slice looks relative to expectation.",
        "The parent view that Offense (DRBL-O) and Defense (DRBL-D) split.",
        "One of three context lenses (P, LN, B), they don’t add into the main ranking.",
      ],
      doesnt: [
        "The same thing as DRBL/100, or DRBL/100 when added to LN and B.",
        "A tracking / off-ball camera metric.",
        "Traditional WAR or replacement wins.",
      ],
      upsides: [
        "Closest diagnostic to the possession story behind DRBL.",
        "O/D halves give a readable offense vs defense split underneath.",
        "Helps explain disagreements without changing the public rank.",
      ],
      downsides: [
        "Easy to misuse as a second ranking total.",
        "Adding P + LN + B invents a false overall number.",
        "Still not a causal “replace this player” estimate.",
      ],
      apply: [
        "Open advanced disclosure when DRBL/100 needs a possession-side check.",
        "Read O and D as splits of P, not of DRBL/100.",
        "Never treat P + LN + B as the “true” ability rate.",
      ],
    },
    deep: {
      definition:
        "DRBL-P is the diagnostic possession component: Approach-B marginal contribution from expected-possession residuals versus a contextual, role-matched R1 reference. DRBL-O and DRBL-D are its offensive and defensive halves. P, LN, and B are non-additive diagnostics, they do not sum to DRBL/100 and are not fused into the canonical v1 validated rate as a three-way total.",
      formula:
        "DRBL-P = possession-component diagnostic (Approach-B vs R1);  DRBL-O + DRBL-D = P split;  P + LN + B ≠ DRBL/100",
      calculation: [
        "From play-by-play possessions, compute expected-points residuals versus the cutoff-frozen R1 baseline.",
        "Attribute Approach-B marginal contribution into the possession component readout (DRBL-P).",
        "Optionally split that component into DRBL-O and DRBL-D for disclosure.",
        "Do not add LN or B to P to reconstruct validated DRBL/100.",
      ],
      teaches: [
        "Possession-attribution diagnostic structure.",
        "Parent/child relationship of P to O and D.",
        "Non-additivity with lineup and behavior diagnostics.",
      ],
      doesnt: [
        "Canonical ranking by itself.",
        "Optical tracking gravity or proven off-ball impact.",
        "Individual predictive uncertainty intervals.",
      ],
      upsides: [
        "Transparent link to the possession engine narrative.",
        "Supports O/D storytelling without replacing DRBL/100.",
        "Keeps research components visible without fusing them.",
      ],
      downsides: [
        "Users may still try to “add the parts.”",
        "Noisier than the shrunk ability rate.",
        "Coverage follows PBP DRBL seasons only.",
      ],
      apply: [
        "Use as the possession column in diagnostic panels.",
        "When P disagrees with LN or B, treat disagreement as a signal to investigate, not a ranking penalty.",
        "Anchor public ranks to DRBL/100 and WAR1.",
      ],
      sources: [
        "/learn/drbl",
        "NON_ADDITIVE_COMPONENT_WARNING (P / LN / B)",
      ],
    },
  },
  {
    id: "drbl_ln",
    slug: "drbl-ln",
    name: "DRBL-LN",
    shortName: "DRBL-LN",
    category: "proprietary",
    blurb:
      "Lineup-context diagnostic: how the player looks after adjusting for who shared the floor. Association with teammates, not proven off-ball impact, and not fused into DRBL/100.",
    plain: {
      teaches: [
        "Whether lineup / teammate context tells a different story than possession attribution alone.",
        "A regularized on/off-style readout for context, not a causal stamp of credit.",
        "Why great teammates (or tough ones) can move the eye test without rewriting DRBL/100.",
      ],
      doesnt: [
        "Proof of off-ball value or camera-tracked gravity.",
        "A term you add with P and B to get DRBL/100.",
        "A public ranking substitute.",
      ],
      upsides: [
        "Surfaces “who did they play with?” disagreements productively.",
        "Dampens raw plus-minus chaos with regularization.",
        "Keeps research lineage visible without overselling it.",
      ],
      downsides: [
        "Easy to misread as “hidden off-ball proof.”",
        "Adjusted association ≠ causal credit.",
        "Sensitive to lineup sample and who always plays together.",
      ],
      apply: [
        "Compare LN to P when teammate quality or stint luck is the debate.",
        "Leave it out of any sum that claims to rebuild DRBL/100.",
        "Prefer DRBL/100 for overall ability ranking.",
      ],
    },
    deep: {
      definition:
        "DRBL-LN is a diagnostic lineup-context component: a regularized possession lineup (RAPM-style) rating expressing adjusted association, not a causal claim. It is not proven off-ball impact, is not optical tracking, and is not fused into canonical validated DRBL/100 in v1. With P and B it is non-additive, P + LN + B ≠ DRBL/100.",
      formula:
        "DRBL-LN = regularized lineup-context diagnostic (RAPM-style association);  P + LN + B ≠ DRBL/100  (LN not fused into canonical v1)",
      calculation: [
        "Estimate a regularized lineup / on-off style association on possession outcomes.",
        "Publish the result as a diagnostic disclosure beside P and B.",
        "Do not interpret LN as proven off-ball; do not fuse it into the EB1600 validated ability rate for canonical v1 ranking.",
      ],
      teaches: [
        "Lineup-adjusted association as a separate lens.",
        "Non-additivity with possession and behavior diagnostics.",
        "Research-boundary humility: association ≠ off-ball proof.",
      ],
      doesnt: [
        "UIR-style off-ball product claims on public boards.",
        "Causal teammate-making identification without further study.",
        "A ranking penalty or calibrated standard error by itself.",
      ],
      upsides: [
        "Useful disagreement signal versus box/behavior and possession attribution.",
        "Keeps RAPM-style context available to analysts.",
        "Avoids silently baking lineup terms into the public ability rate.",
      ],
      downsides: [
        "High misuse risk as “hidden off-ball.”",
        "Sensitive to lineup collinearity and sample.",
        "A full replacement for DRBL/100. Use this to read lineup context.",
      ],
      apply: [
        "Show in advanced diagnostic panels with an explicit non-additive warning.",
        "If LN >> P, investigate teammates and stint structure before rewriting narratives.",
        "Never market LN as part of a three-way sum equal to DRBL/100.",
      ],
      sources: ["/learn/drbl", "DRBL glossary: DRBL-LN"],
    },
  },
  {
    id: "drbl_b",
    slug: "drbl-b",
    name: "DRBL-B",
    shortName: "DRBL-B",
    category: "proprietary",
    blurb:
      "Box / behavior diagnostic from public counting and play-by-play features (usage, creation, shot mix). Not optical tracking, and not a piece of a P+LN+B sum.",
    plain: {
      teaches: [
        "How a behavior / shot-decision style model sees the player.",
        "Whether the box-score profile lines up with possession and lineup diagnostics.",
        "Useful when “the box looks great but impact looks flat” (or the reverse).",
      ],
      doesnt: [
        "Camera-measured gravity, screens, or spacing.",
        "DRBL/100 when added to P and LN.",
        "A substitute for the main ability ranking.",
      ],
      upsides: [
        "Grounded in familiar public box and play-by-play features.",
        "Helps explain counting-stat vs impact disagreements.",
        "Stays labeled as diagnostic so it can’t quietly become the rank.",
      ],
      downsides: [
        "Behavior ≠ proven on-court gravity.",
        "Can overweight shot mix and usage narratives.",
        "Adding with P and LN invents a false total.",
      ],
      apply: [
        "Use when debating creation, usage, and shot profile vs impact.",
        "Cross-check against P and LN without adding them.",
        "Keep public ranking on DRBL/100 and season value on WAR1.",
      ],
    },
    deep: {
      definition:
        "DRBL-B is a diagnostic behavior/shot-decision component: a regularized prediction from public box and play-by-play behavior features (usage, creation, shot mix). It is a behavioral/box diagnostic, not optical tracking and not a measured gravity metric. It is not additive with P and LN into DRBL/100.",
      formula:
        "DRBL-B = regularized behavior/box diagnostic (public box + PBP features);  P + LN + B ≠ DRBL/100",
      calculation: [
        "Build behavior features from public box and play-by-play (usage, creation, shot mix, and related signals).",
        "Fit a regularized predictive/diagnostic readout labeled DRBL-B.",
        "Disclose beside P and LN with an explicit non-additive warning; do not treat B as tracking gravity.",
      ],
      teaches: [
        "Box/behavior association as a third diagnostic lens.",
        "Why gravity language is reserved for tracking, not this field.",
        "Non-additivity with possession and lineup components.",
      ],
      doesnt: [
        "Camera-derived gravity or off-ball measurement.",
        "Canonical ability ranking.",
        "Shipped individual predictive uncertainty for the validated rate.",
      ],
      upsides: [
        "Interpretable in familiar box terms.",
        "Useful disagreement diagnostics with P and LN.",
        "Keeps behavioral signal visible without fusing it into v1 ability.",
      ],
      downsides: [
        "Invites gravity metaphors the data do not support.",
        "Feature definitions can drift across eras.",
        "No claim of beating external box-plus models.",
      ],
      apply: [
        "Place in advanced panels labeled “behavioral / box diagnostic.”",
        "If B diverges from P, inspect usage and shot profile before rewriting impact stories.",
        "Never sell P+LN+B as DRBL/100.",
      ],
      sources: ["/learn/drbl", "DRBL glossary: DRBL-B"],
    },
  },
  {
    id: "r1",
    slug: "r1",
    name: "R1 reference",
    shortName: "R1",
    category: "proprietary",
    blurb:
      "The baseline DRBL compares players against, a role-aware expected-points bar, not a classic “replacement-level fringe player.”",
    plain: {
      teaches: [
        "What “above R1” means: better than the expectation DRBL set for that role and context.",
        "Why DRBL value is relative to a frozen baseline, not a vibes average.",
        "How WAR1 and R1 Points get their meaning from this reference.",
      ],
      doesnt: [
        "The same thing as conventional fringe-player “replacement level.”",
        "A public leaderboard column by itself.",
        "Proof that DRBL’s baseline beats other models’ baselines.",
      ],
      upsides: [
        "Role-matching keeps bigs and guards from sharing one naive bar.",
        "A frozen baseline keeps season accounting stable.",
        "Clear language for “relative to R1” without classic WAR baggage.",
      ],
      downsides: [
        "The name still invites “replacement” misreads.",
        "You can’t recompute it casually from a box score.",
        "Cross-era baseline meaning still has open questions.",
      ],
      apply: [
        "Read every DRBL total as “versus R1,” not “versus a free-agent-minimum archetype.”",
        "When someone says replacement, translate back to role-matched R1.",
        "Use R1 Points / WAR1 for accumulated value above this baseline.",
      ],
    },
    deep: {
      definition:
        "R1 is the contextual, role-matched expected-points reference used for Approach-B attribution in DRBL. Player value is measured relative to this cutoff-frozen baseline. It is not currently claimed to equal conventional NBA fringe-player replacement level, and WAR1 must not be marketed as traditional WAR.",
      formula:
        "R1 = contextual role-matched expected-points baseline (cutoff-frozen);  attribution is vs R1, not classic replacement",
      calculation: [
        "Define role-matched expected points for possessions under the frozen R1 specification.",
        "Attribute Approach-B residuals relative to that expectation.",
        "Accumulate player credit above R1 into R1 Points; convert to WAR1 via frozen P1 when displaying win units.",
      ],
      teaches: [
        "Baseline semantics behind every DRBL “above R1” statement.",
        "Role-matching as the anti-WAR distinguishing claim.",
        "Why unassigned residual / team baseline pieces remain separate from player totals.",
      ],
      doesnt: [
        "A standalone leaderboard column for fans.",
        "Causal roster-replacement identification.",
        "A generic league-average baseline. R1 is role-matched inside DRBL.",
      ],
      upsides: [
        "Keeps attribution language precise across O/D and cumulative metrics.",
        "Frozen cutoffs protect accounting reproducibility.",
        "Supports research additivity and stint conservation work via R1 Points.",
      ],
      downsides: [
        "Easy to smuggle “replacement” rhetoric into product copy.",
        "Harder elevator pitch than “vs average.”",
        "Requires ongoing education next to WAR1.",
      ],
      apply: [
        "Anchor methodology pages and tooltips on “role-matched R1,” not WAR.",
        "When auditing totals, reconcile to R1 Points accounting first.",
        "Refuse forbidden equivalences like “R1 = replacement.”",
      ],
      sources: ["/learn/drbl", "DRBL vocabulary / forbidden claims"],
    },
  },
  {
    id: "r1_points",
    slug: "r1-points",
    name: "R1 Points",
    shortName: "R1 Pts",
    category: "proprietary",
    blurb:
      "The point-credit ledger behind WAR1, same player order, different units. Usually hidden on main boards in favor of WAR1.",
    plain: {
      teaches: [
        "The raw accumulated credit total that win-equivalents are built from.",
        "Ranking matches WAR1 exactly, same order, just point units instead of win-ish units.",
        "Why researchers care about an additive point ledger for audits and team sums.",
      ],
      doesnt: [
        "The preferred casual label (WAR1 is the public face).",
        "Ability rate (use DRBL/100).",
        "A different ranking from WAR1.",
      ],
      upsides: [
        "Best for accounting, additivity checks, and research.",
        "Exact parent of WAR1 under a fixed conversion.",
        "Keeps math in point units without win rhetoric.",
      ],
      downsides: [
        "Less intuitive than win-equivalent language for general readers.",
        "Tempting to promote as a second primary column (product prefers hiding it).",
        "Still not causal replacement value.",
      ],
      apply: [
        "Use in methodology, audits, and advanced disclosures.",
        "Convert to WAR1 for primary boards.",
        "Prefer DRBL/100 when the question is rate, not accumulated points.",
      ],
    },
    deep: {
      definition:
        "R1 Points are the underlying point-equivalent accumulated attribution above the contextual role-matched R1 reference. They remain canonical for accounting, additivity, stint conservation, team decomposition, and research. The product surface normally hides them from primary UI and prefers WAR1, a fixed linear conversion of the same quantity. rank(R1 Points) = rank(WAR1).",
      formula:
        "R1 Points = accumulated point-equivalent attribution above R1;  WAR1 = R1 Points / 37.490662671779255;  rank(R1 Points) = rank(WAR1)",
      calculation: [
        "Attribute Approach-B residuals versus the role-matched R1 expected-points baseline.",
        "Sum player point-equivalent credit into the R1 Points accounting total.",
        "For public win units, divide by frozen P1 (37.490662671779255); keep R1 Points for research and conservation checks.",
        "Omit R1 Points from primary simple surfaces; expose in deep/methodology contexts.",
      ],
      teaches: [
        "Accounting parent of WAR1.",
        "Exact rank equivalence under positive constant scaling.",
        "Why point units matter for stint and team decomposition.",
      ],
      doesnt: [
        "A second independent ranking signal beyond WAR1.",
        "Validated ability rate after EB1600 shrinkage.",
        "Shipped individual predictive uncertainty.",
      ],
      upsides: [
        "Preserves additive research structure.",
        "Auditable bridge to the public win-equivalent label.",
        "Avoids forcing win language into every conservation identity.",
      ],
      downsides: [
        "Primary-UI promotion confuses ability vs value vs accounting.",
        "Readers may think a hidden metric is “more true” than WAR1, it is the same ordering.",
        "A separate ranking from WAR1. Same player order, accounting units.",
      ],
      apply: [
        "Keep as advanced/accounting field; map sorts to WAR1 publicly.",
        "Use when verifying team sums, stints, and conservation.",
        "Never present as traditional WAR.",
      ],
      sources: [
        "/learn/drbl",
        "P1_POINTS_PER_WIN = 37.490662671779255",
      ],
    },
  },
];
