/**
 * Canonical Learn concept registry — tooltip + Learn routing source of truth.
 * Full pedagogy lives in STAT_GUIDES and LEARN_TOPICS; this file holds Level-1
 * metadata, aliases, and category IA. Do not duplicate long copy here.
 */

export type LearnCategoryId =
  | "basics"
  | "shooting"
  | "usage"
  | "team"
  | "impact"
  | "proprietary"
  | "systems"
  | "status"
  | "transactions";

export type LearnCategoryMeta = {
  id: LearnCategoryId;
  label: string;
  description: string;
};

export const LEARN_CATEGORIES: LearnCategoryMeta[] = [
  {
    id: "basics",
    label: "Basketball basics",
    description: "Core counting stats and scoreboard ideas.",
  },
  {
    id: "shooting",
    label: "Shooting",
    description: "How shots become points — and how efficiently.",
  },
  {
    id: "usage",
    label: "Usage & role",
    description: "How often a player handles the offense.",
  },
  {
    id: "team",
    label: "Team efficiency",
    description: "Team scoring, defense, and margin.",
  },
  {
    id: "impact",
    label: "Impact models",
    description: "Third-party plus-minus style estimates (DARKO, LEBRON).",
  },
  {
    id: "proprietary",
    label: "Proprietary stats",
    description:
      "Original DRBL numbers — how good (rate), how much value (season), and the diagnostics behind them.",
  },
  {
    id: "systems",
    label: "DRBL systems",
    description: "How DRBL ranks seasons, resumes, and games.",
  },
  {
    id: "status",
    label: "Labels & status",
    description: "What DRBL means by even, unavailable, contested, and more.",
  },
  {
    id: "transactions",
    label: "Transactions",
    description: "Source events vs structured trades — and why genealogy waits.",
  },
];

export type LearnConcept = {
  id: string;
  /** Alternate ids used across explainMetric, ASK, pickers, UI labels. */
  aliases: string[];
  label: string;
  shortName: string;
  category: LearnCategoryId;
  /** Level-1 tooltip — keep short. */
  tooltip: string;
  /** Whether MetricHelp should render for this concept. */
  showTooltip: boolean;
  /** Canonical Learn page slug, or null if tooltip-only. */
  learnSlug: string | null;
  relatedIds?: string[];
  seeInAction?: Array<{ label: string; href: string }>;
};

/**
 * Master concept list. IDs are stable; aliases absorb historical naming drift.
 */
export const LEARN_CONCEPTS: LearnConcept[] = [
  // --- Basics (mostly tooltip-only; no Learn spam for Points) ---
  {
    id: "pts",
    aliases: ["points", "ppg", "team_ppg"],
    label: "Points",
    shortName: "PTS",
    category: "basics",
    tooltip: "Points scored. PPG is points per game.",
    showTooltip: false,
    learnSlug: null,
  },
  {
    id: "reb",
    aliases: ["rebounds", "rpg", "team_rpg"],
    label: "Rebounds",
    shortName: "REB",
    category: "basics",
    tooltip: "Missed shots recovered. RPG is rebounds per game.",
    showTooltip: false,
    learnSlug: null,
  },
  {
    id: "ast",
    aliases: ["assists", "apg"],
    label: "Assists",
    shortName: "AST",
    category: "basics",
    tooltip: "Passes that directly lead to a made basket. APG is assists per game.",
    showTooltip: false,
    learnSlug: null,
  },
  {
    id: "stl",
    aliases: ["steals", "spg"],
    label: "Steals",
    shortName: "STL",
    category: "basics",
    tooltip: "Defensive takeaways credited as steals.",
    showTooltip: false,
    learnSlug: null,
  },
  {
    id: "blk",
    aliases: ["blocks", "bpg"],
    label: "Blocks",
    shortName: "BLK",
    category: "basics",
    tooltip: "Shots rejected by a defender.",
    showTooltip: false,
    learnSlug: null,
  },
  {
    id: "tov",
    aliases: ["turnovers", "topg", "team_tov"],
    label: "Turnovers",
    shortName: "TOV",
    category: "basics",
    tooltip:
      "Possessions lost without a shot attempt. Raw turnovers per game are volume — they rise with minutes, touches, and usage, and are not a skill grade by themselves.",
    showTooltip: true,
    learnSlug: "turnovers",
    relatedIds: ["ast_to", "usg"],
  },
  {
    id: "min",
    aliases: ["minutes", "mpg"],
    label: "Minutes",
    shortName: "MIN",
    category: "basics",
    tooltip:
      "Playing time. MPG measures availability and role size, not shooting or defensive skill.",
    showTooltip: true,
    learnSlug: null,
  },
  {
    id: "diff",
    aliases: ["point_differential", "team_diff", "avgDiff", "point-differential"],
    label: "Point differential",
    shortName: "DIFF",
    category: "basics",
    tooltip:
      "Average scoring margin (points scored minus points allowed). Positive means outscoring opponents.",
    showTooltip: true,
    learnSlug: "point-differential",
    relatedIds: ["net", "plus_minus"],
    seeInAction: [
      { label: "Team profiles", href: "/explore/teams" },
      { label: "Ask DRBL", href: "/ask?q=Boston%20point%20differential" },
    ],
  },
  {
    id: "plus_minus",
    aliases: ["plus-minus", "plusminus", "+/-"],
    label: "Plus/minus",
    shortName: "+/−",
    category: "basics",
    tooltip:
      "Team scoring margin while the player is on the floor. Strongly affected by teammates and opponents.",
    showTooltip: true,
    learnSlug: "plus-minus",
    relatedIds: ["diff", "net"],
  },
  {
    id: "pace",
    aliases: ["possessions"],
    label: "Pace",
    shortName: "Pace",
    category: "basics",
    tooltip:
      "How many possessions a team typically plays per game. Faster pace raises counting stats.",
    showTooltip: true,
    learnSlug: "pace",
    relatedIds: ["ortg", "drtg"],
  },

  // --- Shooting ---
  {
    id: "fg",
    aliases: ["fg_pct", "field_goal"],
    label: "Field goal percentage",
    shortName: "FG%",
    category: "shooting",
    tooltip: "Made field goals ÷ field goal attempts. Treats twos and threes the same.",
    showTooltip: true,
    learnSlug: "field-goal-percentage",
    relatedIds: ["efg", "ts", "fg3"],
  },
  {
    id: "fg3",
    aliases: ["fg3_pct", "three_point", "team_fg3"],
    label: "Three-point percentage",
    shortName: "3P%",
    category: "shooting",
    tooltip: "Made threes ÷ three-point attempts.",
    showTooltip: true,
    learnSlug: "three-point-percentage",
    relatedIds: ["efg", "ts"],
  },
  {
    id: "ft",
    aliases: ["ft_pct", "free_throw"],
    label: "Free throw percentage",
    shortName: "FT%",
    category: "shooting",
    tooltip: "Made free throws ÷ free throw attempts.",
    showTooltip: false,
    learnSlug: null,
  },
  {
    id: "ts",
    aliases: ["trueShooting", "true_shooting", "ts_pct", "team_ts", "true-shooting"],
    label: "True shooting percentage",
    shortName: "TS%",
    category: "shooting",
    tooltip:
      "Scoring efficiency that accounts for 2-point shots, 3-point shots, and free throws.",
    showTooltip: true,
    learnSlug: "true-shooting",
    relatedIds: ["efg", "fg", "usg"],
    seeInAction: [
      { label: "Player leaderboard", href: "/explore/players" },
      { label: "Ask DRBL", href: "/ask?q=Who%20led%20the%20NBA%20in%20TS%25" },
    ],
  },
  {
    id: "efg",
    aliases: ["effectiveFieldGoal", "efg_pct", "team_efg", "effective-field-goal"],
    label: "Effective field goal percentage",
    shortName: "eFG%",
    category: "shooting",
    tooltip:
      "Shooting efficiency that gives extra credit for made threes (without free throws).",
    showTooltip: true,
    learnSlug: "effective-field-goal",
    relatedIds: ["ts", "fg", "fg3"],
  },
  {
    id: "three_par",
    aliases: ["3par", "three_point_rate"],
    label: "Three-point attempt rate",
    shortName: "3PAr",
    category: "shooting",
    tooltip: "Share of field goal attempts that are threes.",
    showTooltip: true,
    learnSlug: "three-point-rate",
    relatedIds: ["fg3", "efg"],
  },

  // --- Usage ---
  {
    id: "usg",
    aliases: ["usage", "usg_pct", "usage_pct"],
    label: "Usage rate",
    shortName: "USG%",
    category: "usage",
    tooltip:
      "Share of team possessions a player uses (shots, free throws, turnovers) while on the floor. Higher usage means more on-ball responsibility — not automatically better play.",
    showTooltip: true,
    learnSlug: "usage",
    relatedIds: ["ts", "tov"],
  },
  {
    id: "ast_to",
    aliases: ["asttov", "assist_to_turnover", "atr"],
    label: "Assist-to-turnover ratio",
    shortName: "AST/TO",
    category: "usage",
    tooltip:
      "Assists divided by turnovers. Higher usually means cleaner creation when the sample is adequate.",
    showTooltip: true,
    learnSlug: "assist-to-turnover",
    relatedIds: ["ast", "tov"],
  },
  {
    id: "orb",
    aliases: ["orb_pct", "offensiveReboundPct", "offensive_rebounding"],
    label: "Offensive rebound percentage",
    shortName: "ORB%",
    category: "usage",
    tooltip:
      "Estimated share of available offensive rebounds a player or team grabs.",
    showTooltip: true,
    learnSlug: "offensive-rebound-percentage",
    relatedIds: ["reb"],
  },

  // --- Team ---
  {
    id: "ortg",
    aliases: ["offensive_rating", "offensive-rating"],
    label: "Offensive rating",
    shortName: "ORtg",
    category: "team",
    tooltip:
      "Points scored per 100 possessions. On player pages, ESPN season boards may supply only an approximate individual estimate — missing ratings stay unavailable rather than fabricated.",
    showTooltip: true,
    learnSlug: "offensive-rating",
    relatedIds: ["drtg", "net", "ts"],
  },
  {
    id: "drtg",
    aliases: ["defensive_rating", "defensive-rating"],
    label: "Defensive rating",
    shortName: "DRtg",
    category: "team",
    tooltip: "Points allowed per 100 possessions. Lower is better.",
    showTooltip: true,
    learnSlug: "defensive-rating",
    relatedIds: ["ortg", "net"],
  },
  {
    id: "net",
    aliases: ["net_rating", "net-rating"],
    label: "Net rating",
    shortName: "NET",
    category: "team",
    tooltip: "ORtg minus DRtg — scoring margin per 100 possessions.",
    showTooltip: true,
    learnSlug: "net-rating",
    relatedIds: ["ortg", "drtg", "diff"],
  },
  {
    id: "opp_ppg",
    aliases: ["team_opp_ppg", "opponent_ppg"],
    label: "Opponent points per game",
    shortName: "Opp PPG",
    category: "team",
    tooltip: "Points allowed per game. Lower is better on defense.",
    showTooltip: true,
    learnSlug: "point-differential",
    relatedIds: ["diff", "drtg"],
  },

  // --- Impact ---
  {
    id: "darko",
    aliases: ["darko_dpm", "darko-off", "darko-def"],
    label: "DARKO",
    shortName: "DARKO",
    category: "impact",
    tooltip:
      "Estimated points per 100 possessions above or below an average player (predictive impact).",
    showTooltip: true,
    learnSlug: "darko",
    relatedIds: ["lebron", "percentiles"],
    seeInAction: [{ label: "Impact leaders", href: "/" }],
  },
  {
    id: "lebron",
    aliases: ["olebron", "dlebron"],
    label: "LEBRON",
    shortName: "LEBRON",
    category: "impact",
    tooltip:
      "Luck-adjusted impact estimate on a points-per-100 scale, with offense and defense splits.",
    showTooltip: true,
    learnSlug: "lebron",
    relatedIds: ["darko"],
  },
  {
    id: "drbl",
    aliases: [
      "drbl100",
      "drbl_100",
      "drbl/100",
      "validated_drbl",
      "ability_rate",
    ],
    label: "DRBL/100",
    shortName: "DRBL/100",
    category: "proprietary",
    tooltip:
      "How good was the player’s impact rate? DRBL’s main ranking number — like quality per 100 possessions, not season total.",
    showTooltip: true,
    learnSlug: "drbl-100",
    relatedIds: [
      "r1_win_eq",
      "drbl_o",
      "drbl_d",
      "r1_points",
      "r1",
      "how_drbl_works",
      "darko",
    ],
    seeInAction: [
      { label: "Explore by DRBL/100", href: "/explore/players?sort=drbl100" },
      { label: "DRBL overview", href: "/learn/drbl" },
    ],
  },
  {
    id: "r1_points",
    aliases: ["r1points", "r1_pts"],
    label: "R1 Points",
    shortName: "R1 Pts",
    category: "proprietary",
    tooltip:
      "The point-credit ledger behind WAR1. Same player order as WAR1 — different units. Usually hidden on main boards.",
    showTooltip: true,
    learnSlug: "r1-points",
    relatedIds: ["r1_win_eq", "drbl", "r1"],
  },
  {
    id: "r1_win_eq",
    aliases: [
      "r1_win_equivalents",
      "r1wineq",
      "win_equivalents",
      "wins_above_r1",
      "war1",
    ],
    label: "WAR1",
    shortName: "WAR1",
    category: "proprietary",
    tooltip:
      "How much season value did they pile up? Wins-style total above DRBL’s R1 baseline — not classic “replacement-level WAR.”",
    showTooltip: true,
    learnSlug: "war1",
    relatedIds: ["drbl", "r1_points", "r1"],
  },
  {
    id: "drbl_o",
    aliases: ["drblo", "drbl-o", "drbl_offense"],
    label: "DRBL-O",
    shortName: "DRBL-O",
    category: "proprietary",
    tooltip:
      "Offensive side of DRBL’s possession diagnostic — helpful context, not a replacement for DRBL/100.",
    showTooltip: true,
    learnSlug: "drbl-o",
    relatedIds: ["drbl_d", "drbl", "drbl_p"],
  },
  {
    id: "drbl_d",
    aliases: ["drbld", "drbl-d", "drbl_defense"],
    label: "DRBL-D",
    shortName: "DRBL-D",
    category: "proprietary",
    tooltip:
      "Defensive side of DRBL’s possession diagnostic — helpful context, not a replacement for DRBL/100.",
    showTooltip: true,
    learnSlug: "drbl-d",
    relatedIds: ["drbl_o", "drbl", "drbl_p"],
  },
  {
    id: "drbl_p",
    aliases: ["drblp", "drbl-p"],
    label: "DRBL-P",
    shortName: "DRBL-P",
    category: "proprietary",
    tooltip:
      "Possession-level diagnostic (parent of DRBL-O / DRBL-D). Do not add with LN and B to “rebuild” DRBL/100.",
    showTooltip: true,
    learnSlug: "drbl-p",
    relatedIds: ["drbl", "drbl_ln", "drbl_b", "drbl_o", "drbl_d"],
  },
  {
    id: "drbl_ln",
    aliases: ["drblln", "drbl-ln"],
    label: "DRBL-LN",
    shortName: "DRBL-LN",
    category: "proprietary",
    tooltip:
      "Lineup-context diagnostic — who you played with. Not proven off-ball value; not part of a P+LN+B sum.",
    showTooltip: true,
    learnSlug: "drbl-ln",
    relatedIds: ["drbl", "drbl_p", "drbl_b"],
  },
  {
    id: "drbl_b",
    aliases: ["drblb", "drbl-b"],
    label: "DRBL-B",
    shortName: "DRBL-B",
    category: "proprietary",
    tooltip:
      "Box-score / behavior diagnostic (usage, creation, shot mix). Not camera tracking; not part of a P+LN+B sum.",
    showTooltip: true,
    learnSlug: "drbl-b",
    relatedIds: ["drbl", "drbl_p", "drbl_ln"],
  },
  {
    id: "r1",
    aliases: ["r1_reference", "above_r1", "role_matched_r1"],
    label: "R1",
    shortName: "R1",
    category: "proprietary",
    tooltip:
      "The baseline DRBL compares players to — a role-aware expectation, not a classic “replacement player.”",
    showTooltip: true,
    learnSlug: "r1",
    relatedIds: ["r1_win_eq", "r1_points", "drbl"],
  },
  {
    id: "how_drbl_works",
    aliases: ["how_drbl", "drbl_method"],
    label: "How DRBL works",
    shortName: "How DRBL works",
    category: "systems",
    tooltip: "Possession → expected scoring → player credit → rate + season total.",
    showTooltip: true,
    learnSlug: "how-drbl-works",
    relatedIds: ["drbl", "drbl_validation", "drbl_limitations"],
  },
  {
    id: "drbl_validation",
    aliases: ["drbl_validate", "m16j", "m17b"],
    label: "DRBL validation",
    shortName: "Validation",
    category: "systems",
    tooltip:
      "Held-out and out-of-time tests for DRBL — not a claim that it beats other public metrics.",
    showTooltip: true,
    learnSlug: "drbl-validation",
    relatedIds: ["drbl", "drbl_limitations"],
  },
  {
    id: "drbl_historical",
    aliases: ["drbl_history", "historical_drbl"],
    label: "DRBL historical data",
    shortName: "Historical data",
    category: "systems",
    tooltip:
      "Why older seasons can have box scores without a published DRBL number.",
    showTooltip: true,
    learnSlug: "drbl-historical-data",
    relatedIds: ["drbl", "drbl_limitations"],
  },
  {
    id: "drbl_limitations",
    aliases: ["drbl_limits", "drbl_caveats"],
    label: "DRBL limitations",
    shortName: "Limitations",
    category: "systems",
    tooltip:
      "What DRBL is not: causal WAR, full off-ball measurement, or a proven best-in-public model.",
    showTooltip: true,
    learnSlug: "drbl-limitations",
    relatedIds: ["drbl", "drbl_ln", "r1"],
  },

  // --- Systems ---
  {
    id: "cpi",
    aliases: ["career_production_index"],
    label: "Career Production Index",
    shortName: "CPI",
    category: "systems",
    tooltip:
      "DRBL’s transparent counting composite for Career Resume peak/prime/longevity — not DARKO or LEBRON.",
    showTooltip: true,
    learnSlug: "cpi",
    relatedIds: ["career_resume", "career_peak", "career_prime", "career_longevity"],
    seeInAction: [{ label: "Ask peak production", href: "/ask?q=What%20was%20LeBron%27s%20peak%20production%20season%3F" }],
  },
  {
    id: "career_resume",
    aliases: ["resume"],
    label: "Career Resume",
    shortName: "Career Resume",
    category: "systems",
    tooltip:
      "DRBL summary of a career’s Peak, Prime, Longevity, and Trajectory from qualifying seasons.",
    showTooltip: true,
    learnSlug: "career-resume",
    relatedIds: [
      "cpi",
      "career_peak",
      "career_prime",
      "career_longevity",
      "career_arc",
      "career_self_comparison",
    ],
  },
  {
    id: "career_peak",
    aliases: ["peak", "peak_season"],
    label: "Career Peak",
    shortName: "Peak",
    category: "systems",
    tooltip:
      "The single qualifying season with the highest Career Production Index (CPI) for this player.",
    showTooltip: true,
    learnSlug: "peak-prime-longevity",
    relatedIds: ["career_prime", "career_longevity", "cpi", "career_resume"],
  },
  {
    id: "career_prime",
    aliases: ["prime", "prime_seasons"],
    label: "Career Prime",
    shortName: "Prime",
    category: "systems",
    tooltip:
      "Longest contiguous run of qualifying seasons at or above 90% of the player’s own peak CPI.",
    showTooltip: true,
    learnSlug: "peak-prime-longevity",
    relatedIds: [
      "career_peak",
      "career_longevity",
      "prime_contiguity",
      "longevity_only",
      "cpi",
    ],
  },
  {
    id: "career_longevity",
    aliases: ["longevity"],
    label: "Career Longevity",
    shortName: "Longevity",
    category: "systems",
    tooltip:
      "Qualifying seasons at or above 70% of the player’s own Career Resume peak CPI — not merely years in the league.",
    showTooltip: true,
    learnSlug: "peak-prime-longevity",
    relatedIds: [
      "career_peak",
      "career_prime",
      "longevity_only",
      "career_self_comparison",
      "cpi",
    ],
  },
  {
    id: "longevity_only",
    aliases: ["longevity_only_season"],
    label: "Longevity-only season",
    shortName: "Longevity-only",
    category: "systems",
    tooltip:
      "A qualifying season at 70–89% of peak CPI — longevity-level production outside the prime band.",
    showTooltip: true,
    learnSlug: "peak-prime-longevity",
    relatedIds: ["career_longevity", "career_prime", "career_arc"],
  },
  {
    id: "prime_contiguity",
    aliases: ["contiguous_prime"],
    label: "Prime contiguity",
    shortName: "Contiguous prime",
    category: "systems",
    tooltip:
      "Career Resume prime is the longest unbroken run of ≥90% seasons — a gap below 90% splits prime windows.",
    showTooltip: true,
    learnSlug: "peak-prime-longevity",
    relatedIds: ["career_prime", "career_peak"],
  },
  {
    id: "career_development",
    aliases: ["development_season", "emergence", "rise"],
    label: "Development / Emergence",
    shortName: "Development",
    category: "systems",
    tooltip:
      "Descriptive rise toward peak on the career arc — not a formal Career Resume v1 scoring band.",
    showTooltip: true,
    learnSlug: "career-arc",
    relatedIds: ["career_arc", "career_peak", "career_prime", "career_resume"],
  },
  {
    id: "career_arc",
    aliases: ["trajectory", "career_trajectory"],
    label: "Career Arc",
    shortName: "Career Arc",
    category: "systems",
    tooltip:
      "How Peak, Prime, Longevity, and trajectory phases fit together — overlapping performance bands, not exclusive buckets.",
    showTooltip: true,
    learnSlug: "career-arc",
    relatedIds: [
      "career_peak",
      "career_prime",
      "career_longevity",
      "career_development",
      "career_resume",
    ],
  },
  {
    id: "career_self_comparison",
    aliases: ["career_self", "of_peak"],
    label: "Career-self comparison",
    shortName: "Career-self",
    category: "systems",
    tooltip:
      "Peak/Prime/Longevity use % of this player’s own peak CPI — not a league or board percentile.",
    showTooltip: true,
    learnSlug: "career-self-comparison",
    relatedIds: ["career_peak", "career_prime", "career_longevity", "percentiles", "cpi"],
  },
  {
    id: "rank_my_seasons",
    aliases: ["season_rank", "player_season_rank"],
    label: "Rank My Seasons",
    shortName: "Rank My Seasons",
    category: "systems",
    tooltip:
      "Ranks a player’s seasons with pairwise comparisons and Copeland points — no opaque season score.",
    showTooltip: true,
    learnSlug: "rank-my-seasons",
    relatedIds: ["copeland", "contested", "close_top"],
  },
  {
    id: "team_rank_seasons",
    aliases: ["team_season_rank"],
    label: "Rank Team Seasons",
    shortName: "Rank Team Seasons",
    category: "systems",
    tooltip:
      "Ranks a franchise’s seasons with pairwise Team Season Compare and Copeland points.",
    showTooltip: true,
    learnSlug: "team-rank-seasons",
    relatedIds: ["copeland", "team_season_compare"],
    seeInAction: [
      { label: "Rank Boston seasons", href: "/compare?mode=teams&view=rank&teamId=2" },
    ],
  },
  {
    id: "team_season_compare",
    aliases: ["compare_team_seasons"],
    label: "Team Season Compare",
    shortName: "Team Compare",
    category: "systems",
    tooltip:
      "Head-to-head team seasons using board metrics, tolerances, and category plurality — no composite score.",
    showTooltip: true,
    learnSlug: "team-season-compare",
    relatedIds: ["essentially_even", "team_rank_seasons"],
  },
  {
    id: "player_season_compare",
    aliases: ["season_compare"],
    label: "Player Season Compare",
    shortName: "Season Compare",
    category: "systems",
    tooltip:
      "Head-to-head player seasons by category edges — the building block for Rank My Seasons.",
    showTooltip: true,
    learnSlug: "player-season-compare",
    relatedIds: ["rank_my_seasons", "essentially_even"],
  },
  {
    id: "copeland",
    aliases: ["copeland_ranking"],
    label: "Copeland ranking",
    shortName: "Copeland",
    category: "systems",
    tooltip:
      "Ranking method: win a pairwise matchup = 1 point, essentially even = 0.5, loss/unavailable = 0.",
    showTooltip: true,
    learnSlug: "copeland",
    relatedIds: ["rank_my_seasons", "team_rank_seasons", "contested"],
  },
  {
    id: "game_lab",
    aliases: ["winning_factors"],
    label: "Game Lab",
    shortName: "Game Lab",
    category: "systems",
    tooltip:
      "Box-score story of a game: what stood out, what changed, and team context — without PBP claims.",
    showTooltip: true,
    learnSlug: "game-lab",
    relatedIds: ["season_evidence", "season_baseline", "scoreboard_only"],
  },
  {
    id: "season_evidence",
    aliases: ["team_season_game_evidence"],
    label: "Season evidence",
    shortName: "Season evidence",
    category: "systems",
    tooltip:
      "Representative games (largest win, highest scoring, etc.) that illustrate a season — descriptive, not “most important.”",
    showTooltip: true,
    learnSlug: "season-evidence",
    relatedIds: ["game_lab", "team_rank_seasons", "season_baseline"],
  },
  {
    id: "scoreboard_only",
    aliases: ["scoreboard_shell", "game_shell"],
    label: "Scoreboard-only",
    shortName: "Scoreboard only",
    category: "systems",
    tooltip:
      "DRBL knows the game from schedule/score data, but detailed box-score rows are not available yet.",
    showTooltip: true,
    learnSlug: "game-lab",
    relatedIds: ["game_lab", "season_evidence"],
  },
  {
    id: "season_baseline",
    aliases: ["team_season_average", "vs_season_average"],
    label: "Season baseline",
    shortName: "Season baseline",
    category: "systems",
    tooltip:
      "The team's average performance across qualifying games from the same season — used to describe how unusual a single game was.",
    showTooltip: true,
    learnSlug: "season-baseline",
    relatedIds: ["game_lab", "season_evidence", "essentially_even"],
    seeInAction: [
      { label: "Open a Game Lab", href: "/explore/games" },
      { label: "Season evidence", href: "/learn/season-evidence" },
    ],
  },
  {
    id: "ask_drbl",
    aliases: ["ask"],
    label: "ASK DRBL",
    shortName: "ASK DRBL",
    category: "systems",
    tooltip:
      "Natural-language questions routed to existing DRBL analyzers — not a free-form AI fantasy.",
    showTooltip: true,
    learnSlug: "ask-drbl",
    seeInAction: [{ label: "Open ASK DRBL", href: "/ask" }],
  },
  {
    id: "percentiles",
    aliases: ["percentile", "season_percentile"],
    label: "Percentiles",
    shortName: "Percentile",
    category: "systems",
    tooltip:
      "Share of a defined population below this value. Always check which population DRBL used.",
    showTooltip: true,
    learnSlug: "percentiles",
    relatedIds: ["cpi", "darko"],
  },
  {
    id: "historical_impact",
    aliases: ["season_true"],
    label: "Historical impact",
    shortName: "Historical impact",
    category: "systems",
    tooltip:
      "DRBL only treats season-true impact archives as historical. Live overlays are not backfilled history.",
    showTooltip: true,
    learnSlug: "historical-impact",
    relatedIds: ["darko", "lebron"],
  },

  // --- Status labels ---
  {
    id: "essentially_even",
    aliases: ["even", "tolerance"],
    label: "Essentially even",
    shortName: "Even",
    category: "status",
    tooltip:
      "The two values are within DRBL’s comparison tolerance, so neither side gets a meaningful edge.",
    showTooltip: true,
    learnSlug: "essentially-even",
    relatedIds: ["unavailable", "copeland"],
  },
  {
    id: "unavailable",
    aliases: [],
    label: "Unavailable",
    shortName: "Unavailable",
    category: "status",
    tooltip:
      "Required data is missing or not reliable enough for this comparison.",
    showTooltip: true,
    learnSlug: "unavailable",
  },
  {
    id: "insufficient_evidence",
    aliases: ["insufficient_data"],
    label: "Insufficient evidence",
    shortName: "Insufficient",
    category: "status",
    tooltip:
      "Some data exists, but the sample does not meet DRBL’s qualification threshold.",
    showTooltip: true,
    learnSlug: "insufficient-evidence",
    relatedIds: ["not_eligible", "incomplete_season"],
  },
  {
    id: "not_eligible",
    aliases: ["ineligible", "eligible"],
    label: "Not eligible",
    shortName: "Not eligible",
    category: "status",
    tooltip:
      "This season does not meet the minimum participation rules for the analysis.",
    showTooltip: true,
    learnSlug: "not-eligible",
    relatedIds: ["incomplete_season"],
  },
  {
    id: "incomplete_season",
    aliases: ["incomplete", "current_season"],
    label: "Incomplete season",
    shortName: "Incomplete",
    category: "status",
    tooltip:
      "The season is still in progress or lacks enough games to treat as a completed season.",
    showTooltip: true,
    learnSlug: "incomplete-season",
  },
  {
    id: "contested",
    aliases: ["cycle"],
    label: "Contested ranking",
    shortName: "Contested",
    category: "status",
    tooltip:
      "Pairwise wins form a cycle, so the ranking has no clean transitive ordering.",
    showTooltip: true,
    learnSlug: "contested",
    relatedIds: ["copeland", "close_top"],
  },
  {
    id: "close_top",
    aliases: ["closeTop", "close"],
    label: "Close top",
    shortName: "Close",
    category: "status",
    tooltip:
      "The top-ranked options are separated by only a small Copeland gap under the current methodology.",
    showTooltip: true,
    learnSlug: "close-top",
    relatedIds: ["copeland", "contested"],
  },

  // --- Transactions ---
  {
    id: "source_event",
    aliases: [],
    label: "Source event",
    shortName: "Source event",
    category: "transactions",
    tooltip:
      "A verbatim ESPN transaction blurb. Reporting context — not a structured asset ledger.",
    showTooltip: true,
    learnSlug: "transaction-layers",
    relatedIds: ["related_event_cluster", "structured_transaction"],
    seeInAction: [{ label: "Offseason Tracker", href: "/offseason" }],
  },
  {
    id: "related_event_cluster",
    aliases: [],
    label: "Related event cluster",
    shortName: "Related cluster",
    category: "transactions",
    tooltip:
      "Multiple source events safely linked as related reporting — still not a verified trade package.",
    showTooltip: true,
    learnSlug: "transaction-layers",
  },
  {
    id: "structured_transaction",
    aliases: ["genealogy"],
    label: "Structured transaction",
    shortName: "Structured tx",
    category: "transactions",
    tooltip:
      "Verified asset-level transaction. Currently 0 in production — trade genealogy stays blocked.",
    showTooltip: true,
    learnSlug: "transaction-layers",
    relatedIds: [
      "source_event",
      "related_event_cluster",
      "trade_exception",
      "draft_capital",
    ],
  },
  {
    id: "trade_exception",
    aliases: ["tpe", "trade_exceptions"],
    label: "Trade Exception",
    shortName: "TPE",
    category: "transactions",
    tooltip:
      "A CBA mechanism that may let a team absorb qualifying salary without matching outgoing salary — only when a structured TPE ledger exists.",
    showTooltip: true,
    learnSlug: "trade-exception",
    relatedIds: ["salary_fit", "trade_legality", "structured_transaction"],
    seeInAction: [{ label: "Team assets", href: "/teams/bos" }],
  },
  {
    id: "salary_fit",
    aliases: ["cap_fit", "what_can_fit"],
    label: "Salary fit",
    shortName: "Salary fit",
    category: "transactions",
    tooltip:
      "Whether a player's salary amount fits a cap mechanism (e.g. a TPE). Fit is not eligibility and not legality.",
    showTooltip: true,
    learnSlug: "salary-fit-vs-legality",
    relatedIds: ["trade_exception", "trade_legality"],
  },
  {
    id: "trade_legality",
    aliases: ["trade_validator", "legal_trade"],
    label: "Trade legality",
    shortName: "Legality",
    category: "transactions",
    tooltip:
      "Whether a full proposed transaction satisfies applicable CBA and roster rules. Requires a deterministic validator — never inferred from fit lists.",
    showTooltip: true,
    learnSlug: "salary-fit-vs-legality",
    relatedIds: ["salary_fit", "trade_exception"],
  },
  {
    id: "draft_capital",
    aliases: ["draft_picks", "pick_ownership"],
    label: "Draft capital",
    shortName: "Draft capital",
    category: "transactions",
    tooltip:
      "Owned draft picks and related rights from a structured pick ledger — not inferred from ESPN free text.",
    showTooltip: true,
    learnSlug: "transaction-layers",
    relatedIds: ["structured_transaction", "source_event"],
  },
];

const byId = new Map<string, LearnConcept>();
const byAlias = new Map<string, LearnConcept>();

function indexConcepts() {
  if (byId.size) return;
  for (const c of LEARN_CONCEPTS) {
    byId.set(c.id, c);
    byAlias.set(c.id.toLowerCase(), c);
    byAlias.set(c.shortName.toLowerCase(), c);
    byAlias.set(c.label.toLowerCase(), c);
    for (const a of c.aliases) {
      byAlias.set(a.toLowerCase(), c);
    }
  }
}

export function getLearnConcept(idOrAlias: string): LearnConcept | null {
  indexConcepts();
  const key = idOrAlias.trim().toLowerCase();
  return byAlias.get(key) ?? byId.get(idOrAlias) ?? null;
}

export function listLearnConcepts(): LearnConcept[] {
  return LEARN_CONCEPTS;
}

export function listLearnConceptsByCategory(
  category: LearnCategoryId
): LearnConcept[] {
  return LEARN_CONCEPTS.filter((c) => c.category === category);
}

export function learnHrefFor(idOrAlias: string): string | null {
  const c = getLearnConcept(idOrAlias);
  if (!c?.learnSlug) return null;
  // Canonical nested WAR1 route (flat /learn/war1 redirects here).
  if (c.id === "r1_win_eq" || c.learnSlug === "war1") {
    return "/learn/drbl/war1";
  }
  return `/learn/${c.learnSlug}`;
}

export function searchLearnConcepts(query: string): LearnConcept[] {
  const q = query.trim().toLowerCase();
  if (!q) return LEARN_CONCEPTS.filter((c) => c.learnSlug || c.showTooltip);
  return LEARN_CONCEPTS.filter((c) => {
    const hay = [
      c.id,
      c.label,
      c.shortName,
      c.tooltip,
      ...c.aliases,
      c.learnSlug ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}
