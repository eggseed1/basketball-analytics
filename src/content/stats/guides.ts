/**
 * Canonical advanced-stat guides.
 * Plain copy is short and concrete. Deep mode covers formulas and analyst craft.
 */

import { DRBL_STAT_GUIDES } from "./drbl-guides";

export type StatGuide = {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  category: "impact" | "efficiency" | "possession" | "team" | "proprietary";
  /** One line under the title on /learn/[slug] */
  blurb: string;
  plain: {
    teaches: string[];
    doesnt: string[];
    upsides: string[];
    downsides: string[];
    apply: string[];
  };
  deep: {
    definition: string;
    formula: string;
    calculation: string[];
    teaches: string[];
    doesnt: string[];
    upsides: string[];
    downsides: string[];
    apply: string[];
    sources?: string[];
  };
};

export const STAT_GUIDES: StatGuide[] = [
  {
    id: "darko",
    slug: "darko",
    name: "DARKO",
    shortName: "DARKO",
    category: "impact",
    blurb: "Predictive points per 100 possessions versus an average player.",
    plain: {
      teaches: [
        "How much a player is expected to help or hurt a team’s scoring margin.",
        "A blended offense + defense view, not just points scored.",
        "Who projects as high-impact going forward, not only who stacked counting stats yesterday.",
      ],
      doesnt: [
        "Who “tried hardest” or who had the flashiest highlights.",
        "Chemistry, coaching schemes, or playoff-specific matchups by themselves.",
        "A guarantee - it’s a projection, not a box-score fact.",
      ],
      upsides: [
        "Puts stars and role players on one comparable scale.",
        "Updates as new games come in.",
        "Splits offense and defense so you can see where the value lives.",
      ],
      downsides: [
        "Opaque internals - you can’t recompute it from a box score alone.",
        "Can lag sudden role changes or brand-new injuries.",
        "Easy to overtrust one number without minutes, age, or context.",
      ],
      apply: [
        "Rank trade targets and free agents on the same board.",
        "Pair with minutes and age: a +2.0 at 36 minutes is different from +2.0 at 12.",
        "Use offense/defense splits when building lineups, not just the total.",
      ],
    },
    deep: {
      definition:
        "DARKO (Daily Adjusted Regressed Kalman Optimized) is a proprietary predictive impact model. Public leaderboards report DPM (DARKO Plus-Minus): estimated points per 100 possessions relative to an average NBA player, with offensive (O-DPM) and defensive (D-DPM) components.",
      formula:
        "DPM ≈ O-DPM + D-DPM  (reported as points / 100 possessions vs average)",
      calculation: [
        "Inputs blend box outcomes, on/off style signals, and time-series updating (Kalman-style) so recent play matters without discarding prior information.",
        "Regression pulls extreme small-sample marks toward a prior - early-season spikes dampen.",
        "O-DPM and D-DPM are estimated separately, then combined into total DPM.",
        "Leaderboards also expose box and on/off flavors of DPM; treat those as diagnostic slices, not replacements for total DPM.",
        "This site mirrors the public darko.app board; we do not re-derive proprietary weights.",
      ],
      teaches: [
        "Expected marginal point value on a per-possession scale.",
        "How offense and defense contribute to that margin.",
        "Relative tiers across the league on one currency.",
      ],
      doesnt: [
        "Causal identification of “this player made that teammate better” without lineup study.",
        "Contract value, draft capital, or injury risk.",
        "Exact reproducibility from open box-score formulas.",
      ],
      upsides: [
        "Strong forward-looking signal versus pure retrospective plus-minus.",
        "Daily updating reduces stale rankings.",
        "Component splits support role and scheme analysis.",
      ],
      downsides: [
        "Black-box coefficients limit auditability.",
        "Possessions and lineup context still sit underneath the headline number.",
        "Cross-era comparisons are unreliable - stick to within-season boards.",
      ],
      apply: [
        "Prioritize DPM for valuation; use O/D splits for fit.",
        "Stress-test with minutes, usage, and on/off before a trade.",
        "When DPM and eye test diverge, check role change, injury return, or tiny sample.",
        "Never stack DARKO with another all-in-one impact metric as if independent - they share information.",
      ],
      sources: ["darko.app public leaderboard", "Published DARKO methodology notes"],
    },
  },
  {
    id: "raptor",
    slug: "raptor",
    name: "RAPTOR",
    shortName: "RAPTOR",
    category: "impact",
    blurb:
      "FiveThirtyEight’s open impact metric in points per 100, with offense, defense, and WAR.",
    plain: {
      teaches: [
        "How valuable a player was on a points-per-100 scale for that season.",
        "Where the value lived: O-RAPTOR (offense) vs D-RAPTOR (defense).",
        "WAR — RAPTOR impact scaled by minutes into wins above replacement.",
      ],
      doesnt: [
        "Seasons after FiveThirtyEight stopped publishing RAPTOR (roughly post-2021-22).",
        "A clean forecast of next season the way DARKO aims to.",
        "Basketball Index LEBRON — that metric is proprietary and not on this site.",
      ],
      upsides: [
        "Open, documented, and free (538 GitHub, CC BY 4.0).",
        "Blends box and on/off signals into one total with O/D splits.",
        "Sits next to DARKO and BRef BPM for cross-checking eras.",
      ],
      downsides: [
        "No new seasons after 538 ended the project — use BPM / VORP / DARKO for recent years.",
        "Defense remains noisier than offense.",
        "Will not match proprietary boards like LEBRON.",
      ],
      apply: [
        "Use RAPTOR for historical “what were they?” boards through the late 2010s / early 2020s.",
        "For current seasons, prefer DARKO and BRef BPM columns already on the site.",
        "Pair with DARKO when the question flips to “who should we expect next?”",
      ],
    },
    deep: {
      definition:
        "RAPTOR (Robust Algorithm using Player Tracking and On/Off Ratings) is FiveThirtyEight’s public plus-minus-style impact metric in points per 100 possessions, with offensive and defensive components and WAR (wins above replacement).",
      formula:
        "RAPTOR ≈ O-RAPTOR + D-RAPTOR;  WAR scales impact × playing time toward wins above replacement",
      calculation: [
        "Box-score features enter a regularized model of player contribution.",
        "On/off lineup contexts adjust credit for teammates and opponents.",
        "Tracking inputs (where available in the 538 era) enrich the estimate.",
        "Offense and defense are estimated separately, then summed into total RAPTOR.",
        "WAR converts stabilized impact and minutes into an approximate wins total.",
      ],
      teaches: [
        "Season impact on a familiar pts/100 scale.",
        "Which side of the ball drove the total.",
        "Body-of-work value via WAR.",
      ],
      doesnt: [
        "A pure forecast of next season.",
        "Coverage of the latest NBA seasons after 538 stopped updates.",
        "Identical rankings to DARKO, BPM, or proprietary models.",
      ],
      upsides: [
        "Transparent open data anyone can rebuild from.",
        "Strong historical companion next to predictive boards like DARKO.",
        "O/D splits help role and fit conversations.",
      ],
      downsides: [
        "Frozen history — no live continuation from 538.",
        "Defensive signal remains noisier than offensive.",
        "Cross-era comparisons still need care.",
      ],
      apply: [
        "Use RAPTOR for “what have they been?” in covered seasons; DARKO for “what should we expect?”",
        "When RAPTOR is blank for a recent year, read BPM / VORP on the same board.",
        "Investigate large O vs D imbalances before labeling someone “two-way.”",
      ],
      sources: [
        "FiveThirtyEight RAPTOR (GitHub: fivethirtyeight/data/nba-raptor, CC BY 4.0)",
      ],
    },
  },
  {
    id: "ts",
    slug: "true-shooting",
    name: "True shooting percentage",
    shortName: "TS%",
    category: "efficiency",
    blurb: "Points scored per scoring attempt, counting free throws and threes fairly.",
    plain: {
      teaches: [
        "How efficiently a player turns shot attempts and trips to the line into points.",
        "Whether volume scoring is “cheap” or “expensive” for the offense.",
      ],
      doesnt: [
        "Defense, playmaking, or rebounding.",
        "Shot quality vs finishing luck in isolation.",
        "Whether those shots were good process.",
      ],
      upsides: [
        "One number for 2s, 3s, and free throws.",
        "Easy to compare scorers with different diets.",
        "Stable enough over decent samples.",
      ],
      downsides: [
        "Ignores turnovers and creation burden.",
        "Can flatter foul-drawing without capturing foul trouble.",
        "Role and teammate gravity still matter.",
      ],
      apply: [
        "Pair with usage: high usage + high TS% is rare and valuable.",
        "Don’t crown specialists with tiny attempt volume.",
        "Compare to league average (~56-58% in modern seasons) for context.",
      ],
    },
    deep: {
      definition:
        "True shooting percentage estimates scoring efficiency by scaling points by a weighted combination of field-goal and free-throw attempts.",
      formula: "TS% = PTS / (2 × (FGA + 0.44 × FTA))",
      calculation: [
        "Numerator: points scored.",
        "Denominator: field-goal attempts plus 0.44 × free-throw attempts (the 0.44 approximates possessions used by free-throw trips, including and-1 patterns historically).",
        "Multiply denominator by 2 so the rate sits on a shooting-percentage-like scale.",
        "Example: 30 points on 18 FGA and 8 FTA → TS% = 30 / (2 × (18 + 0.44×8)) = 30 / (2 × 21.52) ≈ 69.7%.",
        "Some analysts tweak the 0.44 coefficient by era; most public boards keep 0.44 for comparability.",
      ],
      teaches: [
        "Points produced per scoring possession-ish unit.",
        "Relative efficiency across shot profiles.",
      ],
      doesnt: [
        "Assist creation or turnover cost.",
        "Defensive value.",
        "Expected TS% from shot quality (that’s a different model family).",
      ],
      upsides: [
        "Standardized, widely understood.",
        "Corrects FG% bias against three-point and free-throw heavy scorers.",
        "Cheap to compute from any box score.",
      ],
      downsides: [
        "0.44 is an approximation, not magic for every season.",
        "Doesn’t charge turnovers (pair with TOV% or possessions used).",
        "High TS% on low usage can be empty calories for roster building.",
      ],
      apply: [
        "Primary filter for scoring efficiency; always show attempts or usage beside it.",
        "Split by play type or location when film says the diet changed.",
        "For team offense, aggregate scoring efficiency plus turnover rate beats TS% alone.",
      ],
    },
  },
  {
    id: "efg",
    slug: "effective-field-goal",
    name: "Effective field goal percentage",
    shortName: "eFG%",
    category: "efficiency",
    blurb: "Field goal percentage that gives threes 1.5× weight.",
    plain: {
      teaches: [
        "How well a player or team shoots from the field once threes count properly.",
        "Whether a “low FG%” shooter is actually fine because of three-point volume.",
      ],
      doesnt: [
        "Free throws.",
        "Turnovers or foul drawing.",
        "Defense.",
      ],
      upsides: [
        "Simple correction to raw FG%.",
        "Great for team shot-profile conversations.",
      ],
      downsides: [
        "Ignores the line completely - use TS% when FTs matter.",
        "Doesn’t capture shot difficulty.",
      ],
      apply: [
        "Team offense reviews: eFG% + TOV% + ORB% + FT rate (the Four Factors).",
        "Player shooting diet checks when comparing eras.",
      ],
    },
    deep: {
      definition:
        "Effective field goal percentage adjusts field-goal percentage so each made three counts as 1.5 makes.",
      formula: "eFG% = (FGM + 0.5 × 3PM) / FGA",
      calculation: [
        "Take makes, add half of three-pointers made, divide by field-goal attempts.",
        "Example: 10 FGM, 4 threes, 22 FGA → eFG% = (10 + 0.5×4) / 22 = 12/22 ≈ 54.5%.",
        "Raw FG% would be 10/22 ≈ 45.5% - eFG% shows the three-point boost.",
      ],
      teaches: [
        "Shooting efficiency from the field with three-point equity.",
        "Team spacing outcomes at a glance.",
      ],
      doesnt: [
        "Free-throw scoring.",
        "Creation cost or turnovers.",
      ],
      upsides: [
        "Transparent formula.",
        "Core of Dean Oliver’s Four Factors.",
      ],
      downsides: [
        "Incomplete scoring picture without FTs.",
        "Can look elite on assisted catch-and-shoot roles that don’t generalize.",
      ],
      apply: [
        "Use eFG% for field-only debates; switch to TS% for total scoring efficiency.",
        "On teams, read eFG% with turnover rate before blaming “bad shooting nights” alone.",
      ],
    },
  },
  {
    id: "usg",
    slug: "usage",
    name: "Usage rate",
    shortName: "USG%",
    category: "possession",
    blurb: "Share of team plays a player finishes while on the floor.",
    plain: {
      teaches: [
        "How often the offense runs through someone.",
        "Whether efficiency came with real creation burden.",
      ],
      doesnt: [
        "How good those decisions were.",
        "Off-ball gravity that never shows up as a FGA/TOV/FT.",
        "Defense.",
      ],
      upsides: [
        "Contextualizes scoring and playmaking volume.",
        "Helps spot empty efficiency or overloaded stars.",
      ],
      downsides: [
        "Definitions vary slightly by source.",
        "Punishes players who pass into someone else’s finish (by design).",
      ],
      apply: [
        "Always read TS% (or scoring) next to usage.",
        "High usage + mediocre efficiency can still be required - check alternatives on the roster.",
      ],
    },
    deep: {
      definition:
        "Usage rate estimates the percentage of team possessions ending with a player’s shot, drawn foul, or turnover while that player is on the floor.",
      formula:
        "USG% ≈ 100 × ((FGA + 0.44×FTA + TOV) × (Tm MP / 5)) / (MP × (Tm FGA + 0.44×Tm FTA + Tm TOV))",
      calculation: [
        "Player “ends”: FGA + 0.44×FTA + turnovers.",
        "Scale by team minutes structure (Tm MP / 5) so the rate is while the player is on the floor.",
        "Divide by player minutes × team on-court ending rate.",
        "League average centers near ~20% (five players sharing possessions).",
        "Stars often sit mid-to-high 20s; ultra-high 30%+ is heavy creation load.",
      ],
      teaches: [
        "Creation burden versus finishing role.",
        "Whether efficiency is “easy” or hard-earned.",
      ],
      doesnt: [
        "Screen assists, gravity, or hockey assists.",
        "Quality of the usage (good isolation vs forced late clock).",
      ],
      upsides: [
        "Standard companion to efficiency metrics.",
        "Comparable across teams better than raw FGA.",
      ],
      downsides: [
        "Box-score usage misses some modern creation patterns.",
        "Foul/turnover coefficients are conventions.",
      ],
      apply: [
        "Build scatterplots: usage × TS% to find unicorns and sinkholes.",
        "When adding a high-usage star, plan who loses touches.",
        "For development, rising usage with stable efficiency beats empty bench TS%.",
      ],
    },
  },
  {
    id: "net",
    slug: "net-rating",
    name: "Net rating",
    shortName: "NET",
    category: "team",
    blurb: "Point margin per 100 possessions - offense minus defense.",
    plain: {
      teaches: [
        "Whether a team (or on-court group) outscores opponents on a possession-normalized scale.",
        "The cleanest single scoreboard for “are we winning the run of play?”",
      ],
      doesnt: [
        "Individual credit by itself.",
        "Schedule strength automatically.",
        "Future health or regression.",
      ],
      upsides: [
        "Pace-proof comparison across eras of different speed.",
        "Ties directly to winning.",
      ],
      downsides: [
        "Noisy in small samples.",
        "Player on/off net is teammate-contaminated.",
      ],
      apply: [
        "Team tier lists and playoff outlooks.",
        "Lineup research - always show possessions with the net.",
      ],
    },
    deep: {
      definition:
        "Net rating is offensive rating minus defensive rating: points scored per 100 possessions minus points allowed per 100.",
      formula: "NET = ORtg − DRtg",
      calculation: [
        "Compute team (or lineup) possessions - methods vary (NBA, Basketball-Reference, etc.).",
        "ORtg = 100 × points / possessions.",
        "DRtg = 100 × points allowed / possessions.",
        "Subtract. Example: ORtg 118, DRtg 110 → NET +8.",
        "Player “net” on many boards is on-court team net, not a pure individual metric.",
      ],
      teaches: [
        "Possession-normalized dominance.",
        "Balance between scoring and prevention.",
      ],
      doesnt: [
        "Isolated individual plus-minus without adjustments.",
        "Clutch narratives unless filtered to those minutes.",
      ],
      upsides: [
        "The right currency for team quality.",
        "Composes cleanly from ORtg/DRtg diagnostics.",
      ],
      downsides: [
        "Opponent adjustments needed for schedule.",
        "On/off nets lure false causal stories.",
      ],
      apply: [
        "Start team analysis with NET, then split ORtg/DRtg.",
        "For players, prefer adjusted plus-minus / impact models over raw on-court net.",
        "Always publish sample size (possessions).",
      ],
    },
  },
  {
    id: "ortg",
    slug: "offensive-rating",
    name: "Offensive rating",
    shortName: "ORtg",
    category: "team",
    blurb: "Points scored per 100 possessions.",
    plain: {
      teaches: [
        "How potent an offense is after removing pace.",
        "Whether “we score a lot” is real offense or just a fast game.",
      ],
      doesnt: [
        "Defense.",
        "Individual shot-making alone when used as a team number.",
      ],
      upsides: [
        "Comparable across fast and slow teams.",
        "Pairs with Four Factors diagnostics.",
      ],
      downsides: [
        "Individual ORtg definitions differ and can mislead.",
        "Needs enough possessions.",
      ],
      apply: [
        "Team building: raise ORtg via eFG%, fewer turnovers, offensive boards, FT rate.",
        "Don’t confuse player ORtg with team ORtg.",
      ],
    },
    deep: {
      definition:
        "Offensive rating is points produced per 100 possessions. Team ORtg is straightforward; “individual” ORtg estimates points produced per 100 possessions used.",
      formula: "Team ORtg = 100 × Points / Possessions",
      calculation: [
        "Estimate possessions (common: FGA − ORB + TOV + 0.44×FTA, with variants).",
        "Scale points to per-100.",
        "Individual offensive rating (Oliver-style) allocates scoring and possessions used - treat vendor formulas carefully.",
      ],
      teaches: [
        "Pace-free offensive strength.",
        "Where scoring comes from when paired with Four Factors.",
      ],
      doesnt: [
        "Shot quality expectation.",
        "Defensive scheme interactions.",
      ],
      upsides: [
        "Foundation of modern team analysis.",
        "Stable with season samples.",
      ],
      downsides: [
        "Possession formulas disagree slightly across sites.",
        "Individual ORtg is easy to misuse in media graphics.",
      ],
      apply: [
        "Lead with team ORtg/DRtg/NET.",
        "Diagnose ORtg dips with eFG%, TOV%, ORB%, FT rate before blaming one player.",
      ],
    },
  },
  {
    id: "drtg",
    slug: "defensive-rating",
    name: "Defensive rating",
    shortName: "DRtg",
    category: "team",
    blurb: "Points allowed per 100 possessions.",
    plain: {
      teaches: [
        "How stingy a defense is after removing pace.",
        "Whether a team is truly elite defensively or just slow.",
      ],
      doesnt: [
        "Individual stopper value by itself.",
        "Scheme aesthetics.",
      ],
      upsides: [
        "Pace-normalized.",
        "Clear team comparison tool.",
      ],
      downsides: [
        "Noisy for individuals.",
        "Opponent offense quality matters.",
      ],
      apply: [
        "Pair with opponent adjustment when ranking defenses.",
        "For players, prefer contests, on-ball indicators, and impact models over raw DRtg.",
      ],
    },
    deep: {
      definition:
        "Defensive rating is points allowed per 100 possessions. Lower is better for teams.",
      formula: "Team DRtg = 100 × Points allowed / Possessions",
      calculation: [
        "Same possession basis as ORtg for the opponent’s offense while you defend.",
        "Individual defensive rating estimates are model-heavy; prefer stated methodology.",
      ],
      teaches: [
        "Team prevention skill on a fair scale.",
      ],
      doesnt: [
        "Clean individual defensive ranking without more data.",
      ],
      upsides: [
        "Essential half of net rating.",
      ],
      downsides: [
        "Schedule and variance.",
        "Box-score individual DRtg can be misleading.",
      ],
      apply: [
        "Team tiers: DRtg + opponent quality.",
        "Player defense: triangulate film, tracking, and adjusted plus-minus.",
      ],
    },
  },
  ...DRBL_STAT_GUIDES,
];

export function getStatGuide(slug: string): StatGuide | undefined {
  if (slug === "wins-above-r1") {
    return STAT_GUIDES.find((g) => g.slug === "war1" || g.id === "r1_win_eq");
  }
  // Legacy Learn URL for the retired LEBRON guide → RAPTOR.
  if (slug === "lebron") {
    return STAT_GUIDES.find((g) => g.slug === "raptor" || g.id === "raptor");
  }
  return STAT_GUIDES.find((g) => g.slug === slug || g.id === slug);
}

export function listStatGuides(): StatGuide[] {
  return STAT_GUIDES;
}
