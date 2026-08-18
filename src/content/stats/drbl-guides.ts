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
    category: "impact",
    blurb:
      "How strong was the player’s estimated impact rate? Validated ability per 100 possession appearances versus a role-matched R1 reference — the canonical DRBL ranking number.",
    plain: {
      teaches: [
        "Estimated impact rate relative to a contextual, role-matched R1 baseline.",
        "How strong the player looked on a per-100-appearances scale, not how much season total they piled up.",
        "Who ranks high when the question is ability/rate, not accumulated value.",
      ],
      doesnt: [
        "Season cumulative value (use WAR1 for that).",
        "Traditional WAR, DARKO superiority claims, or roster-replacement causality.",
        "Calibrated individual predictive uncertainty — those intervals are not shipped.",
        "What you get by adding DRBL-P + DRBL-LN + DRBL-B (those do not sum to DRBL/100).",
      ],
      upsides: [
        "Puts players on one comparable ability-rate scale.",
        "Shrinks noisy raw rates so tiny samples don’t dominate rankings.",
        "Canonical public ranking statistic for DRBL boards.",
      ],
      downsides: [
        "Needs play-by-play seasons with DRBL coverage — not every archive year.",
        "Cross-era comparability is not fully established.",
        "Easy to confuse with WAR1 when minutes or volume differ.",
      ],
      apply: [
        "Sort and rank by DRBL/100 when asking “who is better at the rate level?”",
        "Pair with WAR1 when minutes and season accrual matter.",
        "Treat O/D and P/LN/B as diagnostics — never as a rebuild of this total.",
      ],
    },
    deep: {
      definition:
        "DRBL/100 is the validated ability rate: estimated player impact per 100 combined possession appearances versus a contextual, role-matched R1 reference. It is the EB1600 posterior of the raw ability rate shrunk toward zero, and the canonical DRBL ranking statistic — not traditional WAR and not a claim that DRBL outperforms external models (M17c not done).",
      formula:
        "rawAbilityRate = attributedValue / combinedPossessionAppearances × 100;  validatedDRBL100 = EB₁₆₀₀(rawAbilityRate) toward 0  ≡  (N/(N+k))×rawAbilityRate + (k/(N+k))×0  with k = 1600, prior mean = 0",
      calculation: [
        "Reconstruct possessions from public play-by-play and attribute Approach-B residuals vs a cutoff-frozen R1 expected-points baseline.",
        "Form rawAbilityRate as attributed value per combined possession appearances, scaled to per-100.",
        "Apply exact empirical-Bayes shrinkage EB1600: pull rawAbilityRate toward prior mean 0 with k = 1600.",
        "Publish the shrunk posterior as validated DRBL/100 — the public ranking rate.",
        "Do not fuse LN or B into this canonical v1 point estimate; P/LN/B remain non-additive diagnostics.",
      ],
      teaches: [
        "Stabilized ability/rate vs role-matched R1.",
        "How sample size (N) trades off against the k = 1600 prior.",
        "Separation of rate ranking from season win-equivalent totals.",
      ],
      doesnt: [
        "Individual predictive intervals (not shipped for validated DRBL/100).",
        "Causal “replace this player on the roster” effects.",
        "Proof of superiority over DARKO, LEBRON, or other external metrics.",
      ],
      upsides: [
        "Transparent EB prior (mean 0, k = 1600) for auditability of the validation step.",
        "Rate framing supports fairer cross-minute comparisons than raw totals.",
        "Aligned with product canonical ranking.",
      ],
      downsides: [
        "Heavy shrinkage can mute true early-season leaps briefly.",
        "Coverage limited to seasons with validated DRBL pipelines.",
        "Residual team / unassigned value is outside this player rate.",
      ],
      apply: [
        "Use as the headline ability sort on player explorers.",
        "When DRBL/100 and WAR1 diverge, check minutes and volume first.",
        "Never reconstruct DRBL/100 as O+D or P+LN+B.",
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
    category: "impact",
    blurb:
      "DRBL's realized season-value statistic — how much value a player accumulated above the contextual R1 reference.",
    plain: {
      teaches: [
        "DRBL/100 tells you the rate of impact; WAR1 tells you how much season value accrued.",
        "Two players can have similar DRBL/100 but different WAR1 when one played much more.",
        "Season body of work in win-equivalent units above a role-matched R1 reference.",
        "The name is intended as Wins Above R1 — but the public product label is WAR1, and it is not traditional replacement-level WAR.",
      ],
      doesnt: [
        "Traditional WAR or causal roster-replacement effects.",
        "Ability rate (use DRBL/100 for how good at the rate).",
        "A different ranking from R1 Points — the ranks match exactly.",
        "Proof that DRBL wins beat other public win metrics.",
      ],
      upsides: [
        "Easier to talk about than raw point residuals.",
        "Preferred public display of accumulated R1-relative value.",
        "Fixed conversion keeps ranking identical to the accounting total.",
      ],
      downsides: [
        "Volume-driven — high minutes can inflate totals without a higher rate.",
        "Name invites WAR confusion; R1 is role-matched context, not classic replacement.",
        "Still silent on contracts, injuries, and scheme fit.",
      ],
      apply: [
        "Sort by WAR1 for who accrued the most this season.",
        "Always pair with DRBL/100 when comparing players with different minute loads.",
        "Prefer this label over R1 Points on primary UI surfaces.",
      ],
    },
    deep: {
      definition:
        "WAR1 is DRBL's win-equivalent season-value statistic above its contextual R1 reference. Formally it is a fixed linear conversion of R1 Points by the frozen P1 points-per-win constant. The name is intended as Wins Above R1, but WAR1 is the public product label. It is not traditional WAR — R1 is a contextual role-matched reference, not a conventional fringe-player replacement baseline. Because the divisor is a fixed positive constant, rank(R1 Points) = rank(WAR1) exactly.",
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
        "Claims of external metric superiority (M17c not done).",
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
    category: "impact",
    blurb:
      "How much value did the player add on offense versus the role-matched R1 reference? Offensive half of the possession component (DRBL-P) — higher is better.",
    plain: {
      teaches: [
        "Where offensive value sits relative to the player’s R1 expectation.",
        "One side of the ball for the possession diagnostic, not a full ranking substitute.",
        "Whether offense is carrying more of the possession-side story than defense.",
      ],
      doesnt: [
        "Equal half of DRBL/100 — O and D are halves of DRBL-P, not of the validated ability rate.",
        "A rebuild of DRBL/100 when added to DRBL-D.",
        "Playmaking chemistry or scheme proof by itself.",
      ],
      upsides: [
        "Quick read on offensive contribution vs role-matched baseline.",
        "Higher-is-better framing on both O and D.",
        "Useful when building offensive-fit narratives next to the total rate.",
      ],
      downsides: [
        "Diagnostic — easy to over-weight versus canonical DRBL/100.",
        "Still tied to possession attribution noise.",
        "Not a claim of optical off-ball creation.",
      ],
      apply: [
        "Inspect when two similar DRBL/100 players feel different on offense.",
        "Pair with DRBL-D; never sum them into DRBL/100.",
        "Keep DRBL/100 as the overall ability rank.",
      ],
    },
    deep: {
      definition:
        "DRBL-O is the offensive half of the possession component (DRBL-P): value added on offensive possessions versus the contextual role-matched R1 reference. Higher is better. DRBL-O + DRBL-D describes the P split — it is not DRBL/100 and must not be treated as additive halves of the validated ability rate.",
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
        "External-model superiority not established (M17c not done).",
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
    category: "impact",
    blurb:
      "How much value did the player add on defense versus the role-matched R1 reference? Defensive half of the possession component (DRBL-P) — higher is better.",
    plain: {
      teaches: [
        "Defensive value relative to the player’s role-matched R1 expectation.",
        "The other half of the possession diagnostic alongside DRBL-O.",
        "Whether defense is a meaningful part of the possession-side story.",
      ],
      doesnt: [
        "Half of DRBL/100 — O and D split DRBL-P, not the validated ability rate.",
        "Steals/blocks as a complete defensive grade.",
        "Proven optical off-ball or “gravity” defense from tracking cameras.",
      ],
      upsides: [
        "Higher-is-better defensive framing (more defensive value).",
        "Helps separate one-way offensive seasons from two-way ones at the diagnostic layer.",
        "Same R1 language as the rest of the family.",
      ],
      downsides: [
        "Defense remains noisier than offense in possession attribution.",
        "Diagnostic only — not a substitute ranking number.",
        "Individual predictive uncertainty not shipped.",
      ],
      apply: [
        "Check when a strong DRBL/100 looks offense-driven or defense-driven.",
        "Read with DRBL-O; do not sum into DRBL/100.",
        "Prefer DRBL/100 for overall ability ranking.",
      ],
    },
    deep: {
      definition:
        "DRBL-D is the defensive half of the possession component (DRBL-P): value added on defensive possessions versus the contextual role-matched R1 reference. Higher is better (more defensive value). With DRBL-O it partitions P — it does not partition validated DRBL/100.",
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
    category: "possession",
    blurb:
      "Possession-side diagnostic: Approach-B value from expected-possession residuals versus role-matched R1. Useful context — not a piece you add with LN and B to rebuild DRBL/100.",
    plain: {
      teaches: [
        "How the possession-attribution slice looks relative to R1.",
        "The parent diagnostic that DRBL-O and DRBL-D split.",
        "One non-additive lens among P, LN, and B.",
      ],
      doesnt: [
        "Equal DRBL/100, or DRBL/100 when added to LN and B.",
        "A proven off-ball or tracking metric.",
        "Traditional WAR or replacement wins.",
      ],
      upsides: [
        "Closest diagnostic to the possession-reconstruction story.",
        "O/D halves give readable structure underneath P.",
        "Helps explain disagreements without changing the canonical rank.",
      ],
      downsides: [
        "Easy to misuse as a second ranking total.",
        "Non-additive with LN and B — summing invents a false overall.",
        "Still not a causal replacement estimate.",
      ],
      apply: [
        "Open advanced disclosure when DRBL/100 needs a possession-side check.",
        "Read O and D as splits of P, not of DRBL/100.",
        "Never compute P + LN + B as a “true” ability rate.",
      ],
    },
    deep: {
      definition:
        "DRBL-P is the diagnostic possession component: Approach-B marginal contribution from expected-possession residuals versus a contextual, role-matched R1 reference. DRBL-O and DRBL-D are its offensive and defensive halves. P, LN, and B are non-additive diagnostics — they do not sum to DRBL/100 and are not fused into the canonical v1 validated rate as a three-way total.",
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
        "When P disagrees with LN or B, treat disagreement as a signal to investigate — not a ranking penalty.",
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
    category: "possession",
    blurb:
      "Lineup-context diagnostic (RAPM-style association). It is not proven off-ball impact, and it is not fused into canonical DRBL/100 in v1.",
    plain: {
      teaches: [
        "How lineup-adjusted association looks next to the possession and behavior slices.",
        "A regularized on/off-style readout for context — not a causal stamp.",
        "Why teammates and stint structure can move the eye test without rewriting the ability rate.",
      ],
      doesnt: [
        "Proven off-ball value or camera-tracked gravity.",
        "A term you add with P and B to get DRBL/100.",
        "A fused piece of the canonical v1 validated ability rate.",
      ],
      upsides: [
        "Surfaces lineup-context disagreement productively.",
        "Regularization dampens raw plus-minus chaos.",
        "Keeps research lineage visible without overselling it.",
      ],
      downsides: [
        "Easy to misread as “off-ball proof.”",
        "Adjusted association ≠ causal credit.",
        "Not a public ranking substitute.",
      ],
      apply: [
        "Compare LN to P when lineup luck or teammate quality is the debate.",
        "Leave it out of any sum that claims to rebuild DRBL/100.",
        "Prefer DRBL/100 for overall ability ranking.",
      ],
    },
    deep: {
      definition:
        "DRBL-LN is a diagnostic lineup-context component: a regularized possession lineup (RAPM-style) rating expressing adjusted association, not a causal claim. It is not proven off-ball impact, is not optical tracking, and is not fused into canonical validated DRBL/100 in v1. With P and B it is non-additive — P + LN + B ≠ DRBL/100.",
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
        "External superiority vs other lineup models not claimed (M17c not done).",
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
    category: "impact",
    blurb:
      "Behavioral / box diagnostic from public box and play-by-play features (usage, creation, shot mix). Not optical tracking gravity, and not a piece of a P+LN+B sum.",
    plain: {
      teaches: [
        "How a behavior/shot-decision style model sees the player.",
        "A box/PBP feature lens next to possession and lineup diagnostics.",
        "Whether counting-stat behavior aligns with the other DRBL slices.",
      ],
      doesnt: [
        "Optical tracking gravity, screens, or measured spacing.",
        "DRBL/100 when added to P and LN.",
        "A substitute for the validated ability rate.",
      ],
      upsides: [
        "Grounded in public box/PBP behavior features.",
        "Helps explain “box looks great / impact looks flat” disagreements.",
        "Stays labeled as diagnostic so it can’t quietly become the rank.",
      ],
      downsides: [
        "Behavior ≠ proven on-court gravity.",
        "Can overweight shot mix and usage narratives.",
        "Non-additive — summing with P and LN invents a false total.",
      ],
      apply: [
        "Use when debating creation, usage, and shot profile vs impact.",
        "Cross-check against P and LN without adding them.",
        "Keep public ranking on DRBL/100 and season value on WAR1.",
      ],
    },
    deep: {
      definition:
        "DRBL-B is a diagnostic behavior/shot-decision component: a regularized prediction from public box and play-by-play behavior features (usage, creation, shot mix). It is a behavioral/box diagnostic — not optical tracking and not a measured gravity metric. It is not additive with P and LN into DRBL/100.",
      formula:
        "DRBL-B = regularized behavior/box diagnostic (public box + PBP features);  P + LN + B ≠ DRBL/100",
      calculation: [
        "Build behavior features from public box and play-by-play (usage, creation, shot mix, and related signals).",
        "Fit a regularized predictive/diagnostic readout labeled DRBL-B.",
        "Disclose beside P and LN with an explicit non-additive warning; do not treat B as tracking gravity.",
      ],
      teaches: [
        "Box/behavior association as a third diagnostic lens.",
        "Why gravity language is reserved for tracking — not this field.",
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
        "No claim of beating external box-plus models (M17c not done).",
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
    category: "team",
    blurb:
      "The contextual, role-matched expected-points baseline DRBL compares players against. Not the same thing as a classic NBA fringe “replacement player.”",
    plain: {
      teaches: [
        "What “above R1” means: better than the role-matched expectation used in DRBL attribution.",
        "Why DRBL value is relative to a frozen contextual baseline, not a vibes average.",
        "How WAR1 and R1 Points inherit their meaning from this reference.",
      ],
      doesnt: [
        "Conventional fringe-player replacement level (not currently claimed).",
        "A public player ranking statistic by itself.",
        "Proof that DRBL’s baseline beats other models’ baselines (M17c not done).",
      ],
      upsides: [
        "Role-matching keeps bigs and guards from sharing one naive bar.",
        "Cutoff-frozen baseline supports stable accounting.",
        "Clear language for “relative to R1” without WAR baggage.",
      ],
      downsides: [
        "Name collision with “replacement” invites WAR misreads.",
        "Baseline construction is not a casual box-score recomputation.",
        "Cross-era baseline meaning still has open questions.",
      ],
      apply: [
        "Read every DRBL total as “versus R1,” not “versus a free agent minimum archetype.”",
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
        "External baseline superiority claims.",
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
    category: "impact",
    blurb:
      "Underlying point-equivalent credit above the role-matched R1 baseline. Accounting and research currency — normally hidden from the primary UI in favor of WAR1.",
    plain: {
      teaches: [
        "The raw accumulated attribution total that win-equivalents are built from.",
        "That ranking matches WAR1 exactly — same order, different units.",
        "Why researchers care about an additive point-equivalent ledger.",
      ],
      doesnt: [
        "The preferred casual label (WAR1 is the public face).",
        "Ability rate (use DRBL/100).",
        "Traditional WAR or a different ordering from WAR1.",
      ],
      upsides: [
        "Canonical for accounting, additivity, stint conservation, and team decomposition.",
        "Exact linear parent of WAR1.",
        "Keeps research math in point units without win rhetoric.",
      ],
      downsides: [
        "Less intuitive than win-equivalent language for general readers.",
        "Tempting to promote as a second primary column (product prefers hiding it).",
        "Still not causal replacement value.",
      ],
      apply: [
        "Use in methodology, audits, and advanced disclosures.",
        "Convert to WAR1 for primary boards via ÷ frozen P1.",
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
        "Readers may think a hidden metric is “more true” than WAR1 — it is the same ordering.",
        "No external superiority claim attached (M17c not done).",
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
