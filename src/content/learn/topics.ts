/**
 * Learn topics — standard template for DRBL education pages.
 * Existing advanced-stat pedagogy remains in STAT_GUIDES; this covers
 * systems, status labels, and additional concepts with a consistent shape.
 */

export type LearnTopic = {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  category: string;
  /** One sentence under the title. */
  oneSentence: string;
  whyItMatters: string[];
  howToInterpret: string[];
  howDrblUses: string[];
  formula?: string;
  calculation?: string[];
  caveats: string[];
  relatedIds: string[];
  seeInAction: Array<{ label: string; href: string }>;
  sources?: string[];
};

export const LEARN_TOPICS: LearnTopic[] = [
  {
    id: "cpi",
    slug: "cpi",
    name: "Career Production Index (CPI)",
    shortName: "CPI",
    category: "systems",
    oneSentence:
      "CPI estimates how much counting production a player created per game in a season using a transparent formula.",
    whyItMatters: [
      "Career Resume needs one clear production axis for Peak, Prime, and Longevity.",
      "Fans can recompute it from ordinary per-game stats.",
    ],
    howToInterpret: [
      "Higher CPI means more combined scoring, playmaking, rebounding, and defensive counting stats after turnovers.",
      "Compare a player only to their own peak — not to the league board — inside Career Resume.",
    ],
    howDrblUses: [
      "Primary metric for Career Resume Peak / Prime / Longevity.",
      "Shown as context in Rank My Seasons; it is never the ranking model itself.",
      "True shooting is shown beside Peak for efficiency context and does not enter CPI.",
    ],
    formula: "CPI = PPG + 1.5×APG + 1.2×RPG + 2.0×SPG + 2.0×BPG − TOV",
    calculation: [
      "All terms are per-game counting rates from season-true career rows.",
      "Multi-team seasons keep the row with the most games.",
    ],
    caveats: [
      "CPI is not BPM, DARKO, or LEBRON.",
      "It does not measure defense beyond steals/blocks and ignores lineup context.",
      "DARKO on career rows is currently a live overlay — not used as historical peak.",
    ],
    relatedIds: ["career_resume", "career_peak", "career_prime", "career_longevity", "career_self_comparison", "ts"],
    seeInAction: [
      {
        label: "Ask peak production",
        href: "/ask?q=What%20was%20LeBron%27s%20peak%20production%20season%3F",
      },
    ],
    sources: ["docs/career-resume.md", "src/analytics/career-resume.ts"],
  },
  {
    id: "career_resume",
    slug: "career-resume",
    name: "Career Resume",
    shortName: "Career Resume",
    category: "systems",
    oneSentence:
      "Career Resume answers what a career looks like analytically: Peak, Prime, Longevity, and Trajectory — using overlapping career-self bands, not mutually exclusive buckets.",
    whyItMatters: [
      "Casual fans get a readable career arc without inventing a single “GOAT score.”",
      "Peak, Prime, and Longevity stack: a peak season is also prime and longevity; prime seasons remain longevity seasons.",
    ],
    howToInterpret: [
      "Peak = the single qualifying season with the highest CPI.",
      "Prime = the longest contiguous run of qualifying seasons at ≥90% of that peak CPI.",
      "Longevity = count of qualifying seasons at ≥70% of peak CPI (includes all prime seasons).",
      "Longevity-only = 70–89% of peak — still meaningful production outside the prime band.",
      "Bands are career_self — relative to this player’s own peak, not a league percentile.",
    ],
    howDrblUses: [
      "Player pages and ASK DRBL career questions.",
      "Qualification: GP≥20 & MPG≥15 (or shortened-season accommodation).",
      "Trajectory phases (rise / prime / late / current) describe arc shape; they are not separate CPI thresholds.",
    ],
    calculation: [
      "Compute CPI for each qualifying season.",
      "Peak = max CPI.",
      "Mark ≥90% as prime-band; the displayed Prime window is the longest unbroken run of those seasons.",
      "Mark ≥70% as longevity-band (a superset of the prime band).",
    ],
    caveats: [
      "Incomplete current seasons below the GP floor are shown but excluded from Peak/Prime/Longevity.",
      "Official awards are not included (no award feed yet).",
      "“Development / Emergence” on the arc is descriptive — not a formal Career Resume v1 scoring band.",
    ],
    relatedIds: [
      "cpi",
      "career_peak",
      "career_prime",
      "career_longevity",
      "longevity_only",
      "career_arc",
      "career_self_comparison",
      "career_development",
    ],
    seeInAction: [
      { label: "Explore players", href: "/explore/players" },
      { label: "Peak, Prime & Longevity", href: "/learn/peak-prime-longevity" },
    ],
    sources: ["docs/career-resume.md", "src/analytics/career-resume.ts"],
  },
  {
    id: "peak_prime_longevity",
    slug: "peak-prime-longevity",
    name: "Peak, Prime, and Longevity",
    shortName: "Peak · Prime · Longevity",
    category: "systems",
    oneSentence:
      "Peak is one highest-CPI season; Prime is the longest contiguous ≥90% run; Longevity is every qualifying season at ≥70% of that same peak — and these bands overlap.",
    whyItMatters: [
      "Fans often treat “prime years” and “longevity years” as separate piles. Under Career Resume v1 they nest.",
      "Understanding overlap prevents reading a 75% season as “career over.”",
    ],
    howToInterpret: [
      "Peak (100% of peak) ⊂ Prime (≥90%) ⊂ Longevity (≥70%).",
      "Example — Season A at 100%: Peak + Prime + Longevity. Season B at 96%: Prime + Longevity. Season D at 84%: Longevity-only. Season F at 61%: neither.",
      "Longevity-only (70–89%) means strong, peak-relative production that is outside the prime band — not a weak season by default.",
      "Longevity can continue after the contiguous prime ends; a player need not stay at 90% to still clear the 70% floor.",
      "Prime contiguity: 94%, 96%, 88%, 93%, 95% is not one five-year prime — the 88% gap splits two prime windows, and Career Resume keeps the longest run.",
      "Peak ≠ “best season” in a league-percentile sense; Prime ≠ every season that ever hit 90%.",
      "Longevity ≠ years played or durability (games played). It is production sustained vs own peak.",
    ],
    howDrblUses: [
      "Career Resume Peak / Prime / Longevity cards on player pages.",
      "Qualifying-season table bands should be read as overlapping labels.",
      "Primary metric remains CPI (Career Resume methodology v1.0) — unchanged by this Learn page.",
    ],
    formula:
      "100% ─ PEAK\n │\n │  PRIME  (≥90%)\n │\n │  Longevity-only  (70–89%)\n │\n70% ─ LONGEVITY FLOOR\n │\n │  Below longevity threshold",
    calculation: [
      "CPI = PPG + 1.5×APG + 1.2×RPG + 2.0×SPG + 2.0×BPG − TOV (per game).",
      "Peak = max CPI among qualifying seasons.",
      "Prime band = CPI ≥ 90% of peak; displayed Prime = longest contiguous run in that band.",
      "Longevity band = CPI ≥ 70% of peak (includes every prime-band season).",
    ],
    caveats: [
      "90% of peak is not the 90th league percentile.",
      "Incomplete / non-qualifying seasons never enter these bands.",
      "Do not invent a Development Score from this diagram — Development is explanatory on the Career Arc page.",
    ],
    relatedIds: [
      "career_peak",
      "career_prime",
      "career_longevity",
      "longevity_only",
      "prime_contiguity",
      "career_self_comparison",
      "career_arc",
      "cpi",
      "career_resume",
    ],
    seeInAction: [
      {
        label: "Ask peak production",
        href: "/ask?q=What%20was%20LeBron%27s%20peak%20production%20season%3F",
      },
      { label: "Career Resume methodology", href: "/learn/career-resume" },
    ],
    sources: ["docs/career-resume.md", "src/analytics/career-resume.ts"],
  },
  {
    id: "career_arc",
    slug: "career-arc",
    name: "Career Arc",
    shortName: "Career Arc",
    category: "systems",
    oneSentence:
      "A career arc describes how a player moves through development/rise, prime, longevity-only, and late phases — while Peak/Prime/Longevity remain overlapping performance bands.",
    whyItMatters: [
      "Phase language (rise, late, current) is easy to confuse with the 90%/70% production thresholds.",
      "Separating trajectory phases from performance bands keeps Career Resume honest.",
    ],
    howToInterpret: [
      "Typical story: Development / rise → contiguous Prime → Longevity-only seasons → below the longevity floor.",
      "Late career is a trajectory phase (where the season sits on the arc), not automatically “below 70%.”",
      "A late-career season can still be longevity-only or even inside a late prime window.",
      "Development / Emergence means production still below established prime level while the measured arc is building toward peak — DRBL does not claim to know why the player improved.",
    ],
    howDrblUses: [
      "Career Resume trajectory strip (e.g. Development → rise → Prime → Late career → Current).",
      "Biggest career changes reuse Player Evolution YoY deltas — descriptive evidence, not a Development Score.",
      "Formal Development Season labeling is not part of Career Resume methodology v1.0.",
    ],
    caveats: [
      "Trajectory phases are labeled from CPI shape only — no causal claims.",
      "Do not treat every pre-prime season as automatically “developmental.”",
      "Player Evolution YoY changes are available separately and are not a proprietary development model.",
    ],
    relatedIds: [
      "career_development",
      "career_peak",
      "career_prime",
      "career_longevity",
      "longevity_only",
      "career_resume",
      "career_self_comparison",
    ],
    seeInAction: [
      { label: "Peak, Prime & Longevity", href: "/learn/peak-prime-longevity" },
      { label: "Explore players", href: "/explore/players" },
    ],
    sources: ["docs/career-resume.md", "src/analytics/career-resume.ts", "src/analytics/evolution.ts"],
  },
  {
    id: "career_self_comparison",
    slug: "career-self-comparison",
    name: "Career-Self Comparison",
    shortName: "Career-self",
    category: "systems",
    oneSentence:
      "Career Resume Peak, Prime, and Longevity are scored against the player’s own peak CPI (career_self), not against the league or a filtered leaderboard.",
    whyItMatters: [
      "Stops readers from equating “90% of peak” with “90th percentile.”",
      "Lets role players and superstars share the same readable career language.",
    ],
    howToInterpret: [
      "career_self = % of this player’s peak CPI.",
      "Leaderboard / peer percentiles compare to other players on a board or in a season.",
      "Filtered-board percentiles change when you change the explore filters — Career Resume bands do not.",
      "A short career can still show a high share of longevity seasons; a long career can show few if production fell off vs peak.",
    ],
    howDrblUses: [
      "Career Resume of-peak chips and thresholds.",
      "Contrast with percentile chips elsewhere on the site (leaderboards, compares).",
    ],
    caveats: [
      "Career-self bands never replace league context when you need peer standing.",
      "Durability (games / seasons played) is a different question from longevity-as-production.",
    ],
    relatedIds: [
      "career_peak",
      "career_prime",
      "career_longevity",
      "percentiles",
      "cpi",
      "career_resume",
    ],
    seeInAction: [
      { label: "Peak, Prime & Longevity", href: "/learn/peak-prime-longevity" },
      { label: "Percentiles", href: "/learn/percentiles" },
    ],
    sources: ["docs/career-resume.md"],
  },
  {
    id: "rank_my_seasons",
    slug: "rank-my-seasons",
    name: "Rank My Seasons",
    shortName: "Rank My Seasons",
    category: "systems",
    oneSentence:
      "Rank My Seasons orders a player’s selected seasons by pairwise comparisons and Copeland points — not by a hidden universal score.",
    whyItMatters: [
      "“Best season” is ambiguous; DRBL states the methodology instead of pretending objectivity.",
    ],
    howToInterpret: [
      "Every eligible season faces every other via Player Season Compare.",
      "Win = 1 Copeland point, essentially even = 0.5, loss/unavailable = 0.",
      "Contested and close-top flags disclose messy pairwise graphs.",
    ],
    howDrblUses: [
      "Player season-rank routes and ASK “best season” questions for players.",
      "Set size 2–8 seasons.",
    ],
    caveats: [
      "Unavailable evidence is not treated as a substantive loss.",
      "CPI appears only as production context — never as the ranking model.",
    ],
    relatedIds: ["copeland", "player_season_compare", "contested", "close_top"],
    seeInAction: [
      {
        label: "Ask LeBron best seasons",
        href: "/ask?q=Rank%20LeBron%27s%20best%20seasons%20from%202008-09%20to%202015-16",
      },
    ],
    sources: ["docs/season-rank.md", "src/analytics/rank-player-seasons.ts"],
  },
  {
    id: "team_rank_seasons",
    slug: "team-rank-seasons",
    name: "Rank Team Seasons",
    shortName: "Rank Team Seasons",
    category: "systems",
    oneSentence:
      "The team equivalent of Rank My Seasons: Copeland aggregation of pairwise Team Season Compare results.",
    whyItMatters: [
      "Shows which franchise seasons stand out under the same transparent compare rules used elsewhere.",
    ],
    howToInterpret: [
      "Same Copeland rules as player ranking.",
      "Incomplete / thin seasons are listed as not eligible.",
      "Season evidence links representative games for the #1 season.",
    ],
    howDrblUses: [
      "/compare?mode=teams&view=rank",
      "Team pages and ASK team “best season” questions.",
    ],
    caveats: [
      "Within-franchise only — not cross-era normalized greatness.",
      "No opaque team-season score.",
    ],
    relatedIds: ["team_season_compare", "copeland", "season_evidence"],
    seeInAction: [
      {
        label: "Rank Boston seasons",
        href: "/compare?mode=teams&view=rank&teamId=2",
      },
    ],
    sources: ["src/analytics/rank-team-seasons.ts"],
  },
  {
    id: "team_season_compare",
    slug: "team-season-compare",
    name: "Team Season Compare",
    shortName: "Team Compare",
    category: "systems",
    oneSentence:
      "Compares two team seasons with board metrics, documented tolerances, and category plurality.",
    whyItMatters: [
      "Explains why one season looks stronger without inventing a weighted composite.",
    ],
    howToInterpret: [
      "Metrics inside tolerance → essentially even.",
      "Missing sides → unavailable.",
      "Category winner = plurality of decisive metric edges; overall = plurality of category edges.",
    ],
    howDrblUses: [
      "Compare page (same franchise or team vs team).",
      "Pairwise engine inside Rank Team Seasons.",
    ],
    caveats: [
      "Tolerances are product policy, not “truth.”",
      "Does not adjust for era scoring environment.",
    ],
    relatedIds: ["essentially_even", "team_rank_seasons", "unavailable"],
    seeInAction: [{ label: "Compare teams", href: "/compare?mode=teams" }],
    sources: ["src/analytics/compare-team-seasons.ts"],
  },
  {
    id: "player_season_compare",
    slug: "player-season-compare",
    name: "Player Season Compare",
    shortName: "Season Compare",
    category: "systems",
    oneSentence:
      "Head-to-head comparison of two player seasons by category edges under documented tolerances.",
    whyItMatters: [
      "Answers “why does this season beat that one?” with transparent dimensions.",
    ],
    howToInterpret: [
      "Essentially even when within tolerance.",
      "Impact edges require season-true data on both sides.",
    ],
    howDrblUses: [
      "Best Season Lab / season-compare routes.",
      "Pairwise engine for Rank My Seasons.",
    ],
    caveats: ["Missing impact is never treated as zero."],
    relatedIds: ["rank_my_seasons", "essentially_even", "cpi"],
    seeInAction: [{ label: "Compare players", href: "/compare" }],
    sources: ["src/analytics/compare-player-seasons.ts"],
  },
  {
    id: "copeland",
    slug: "copeland",
    name: "Copeland ranking",
    shortName: "Copeland",
    category: "systems",
    oneSentence:
      "A ranking method that scores each option by how it does in head-to-head pairwise matchups.",
    whyItMatters: [
      "Avoids inventing a weighted “season score” while still producing a deterministic order.",
    ],
    howToInterpret: [
      "Win = 1, essentially even = 0.5, loss or unavailable = 0.",
      "Cycles can make the order contested even when Copeland points exist.",
    ],
    howDrblUses: [
      "Rank My Seasons and Rank Team Seasons.",
    ],
    caveats: [
      "Unavailable is tracked separately and is not a substantive loss.",
      "Order is methodology-relative, not universal truth.",
    ],
    relatedIds: ["rank_my_seasons", "team_rank_seasons", "contested"],
    seeInAction: [
      { label: "Team Rank Seasons", href: "/compare?mode=teams&view=rank" },
    ],
  },
  {
    id: "game_lab",
    slug: "game-lab",
    name: "Game Lab",
    shortName: "Game Lab",
    category: "systems",
    oneSentence:
      "Game Lab explains a finished game from the box score and team context — not from play-by-play yet.",
    whyItMatters: [
      "Connects seasons and leaderboards to a specific night’s evidence.",
    ],
    howToInterpret: [
      "Winning factors and “what changed” are box-derived observations.",
      "They are not causal PBP claims.",
    ],
    howDrblUses: [
      "/games/[gameId]",
      "Season evidence cards deep-link here.",
    ],
    caveats: [
      "No possessions, lineup stints, or win probability in v1.",
      "Future PBP will add depth without replacing this layer.",
    ],
    relatedIds: ["season_evidence", "season_baseline", "plus_minus"],
    seeInAction: [{ label: "Explore games", href: "/explore/games" }],
  },
  {
    id: "season_evidence",
    slug: "season-evidence",
    name: "Season evidence",
    shortName: "Season evidence",
    category: "systems",
    oneSentence:
      "Representative schedule-score games that illustrate a season profile — largest win, highest scoring, best defensive result, and similar.",
    whyItMatters: [
      "Turns “this season ranked #1” into concrete nights you can open in Game Lab.",
    ],
    howToInterpret: [
      "Descriptive only — never “most important game.”",
      "Categories without schedule data (eFG, rebounds) stay unavailable.",
    ],
    howDrblUses: [
      "Team Rank #1 evidence.",
      "Team Season Compare “compare the evidence.”",
      "ASK biggest-wins / best-games questions.",
    ],
    caveats: [
      "Uses lightweight GameSummary rows — no Game Lab fetch during selection.",
      "Regular season finals only.",
    ],
    relatedIds: ["game_lab", "team_rank_seasons", "season_baseline"],
    seeInAction: [
      {
        label: "Ask Boston biggest wins",
        href: "/ask?q=What%20were%20Boston%27s%20biggest%20wins%20in%202023-24%3F",
      },
    ],
    sources: ["src/analytics/season-evidence.ts"],
  },
  {
    id: "season_baseline",
    slug: "season-baseline",
    name: "Season baseline",
    shortName: "Season baseline",
    category: "systems",
    oneSentence:
      "The team's average performance across qualifying games from the same season — the yardstick for how unusual a single game was.",
    whyItMatters: [
      "Turns a box score into context: was this night loud offense, quiet defense, or both?",
    ],
    howToInterpret: [
      "Game Lab compares scoreboard points and (when available) box rates to the same-season board.",
      "Inside tolerance means near normal — not a highlight.",
      "Lower opponent points or turnovers can be a positive story; direction is explicit.",
    ],
    howDrblUses: [
      "Game Lab V1.1 How Unusual / What Stood Out.",
      "Existing Level-2 box player vs-season strips.",
    ],
    caveats: [
      "Hidden for live / non-final games.",
      "No percentiles or z-scores in this layer.",
      "Thin historical boxes may only support score context.",
    ],
    relatedIds: ["game_lab", "season_evidence", "essentially_even"],
    seeInAction: [{ label: "Explore games", href: "/explore/games" }],
    sources: ["src/analytics/game-season-context.ts"],
  },
  {
    id: "ask_drbl",
    slug: "ask-drbl",
    name: "ASK DRBL",
    shortName: "ASK DRBL",
    category: "systems",
    oneSentence:
      "ASK DRBL turns natural-language questions into structured queries that call the same analyzers as the rest of the site.",
    whyItMatters: [
      "Lets fans ask “best season?” or “TS%?” without learning every URL.",
    ],
    howToInterpret: [
      "Interpretation lines show how DRBL understood the question.",
      "Unsupported / partial / insufficient data are honest status states — not soft failures.",
    ],
    howDrblUses: [
      "/ask and deep links from team/player pages.",
    ],
    caveats: [
      "Not a free-form chatbot inventing stats.",
      "PBP filters and vague “best player ever” claims stay unsupported.",
    ],
    relatedIds: ["rank_my_seasons", "cpi", "unavailable"],
    seeInAction: [{ label: "Open ASK DRBL", href: "/ask" }],
  },
  {
    id: "percentiles",
    slug: "percentiles",
    name: "Percentiles",
    shortName: "Percentiles",
    category: "systems",
    oneSentence:
      "A percentile answers “what share of a defined population sits below this value?” — not “how many points.”",
    whyItMatters: [
      "DRBL uses several populations; mixing them up misreads the number.",
    ],
    howToInterpret: [
      "90th percentile ≈ above ~90% of that population.",
      "Leaderboard percentiles use the filtered board.",
      "Career Resume “% of peak” is career_self — not a peer percentile.",
      "Game-log percentiles use that player’s games, not the league.",
    ],
    howDrblUses: [
      "Player/team trait panels, leaderboard context, box-score context.",
    ],
    caveats: [
      "Always read the population label beside the percentile.",
      "Small samples make percentiles noisy.",
    ],
    relatedIds: ["cpi", "darko", "insufficient_evidence"],
    seeInAction: [{ label: "Player leaderboard", href: "/explore/players" }],
  },
  {
    id: "historical_impact",
    slug: "historical-impact",
    name: "Historical impact",
    shortName: "Historical impact",
    category: "systems",
    oneSentence:
      "Historical impact on DRBL requires season-true archives — current-only overlays are not treated as backfilled history.",
    whyItMatters: [
      "Prevents fake career peaks from today’s DARKO pasted onto old seasons.",
    ],
    howToInterpret: [
      "Missing stays missing.",
      "When both sides of a compare lack season-true impact, the edge is unavailable.",
    ],
    howDrblUses: [
      "Player season compare impact category.",
      "Coverage diagnostics.",
    ],
    caveats: ["Do not invent historical DARKO from live boards."],
    relatedIds: ["darko", "lebron", "unavailable"],
    seeInAction: [{ label: "Explore players", href: "/explore/players" }],
    sources: ["docs/historical-impact.md"],
  },
  {
    id: "point_differential",
    slug: "point-differential",
    name: "Point differential",
    shortName: "DIFF",
    category: "basics",
    oneSentence:
      "Point differential is scoring margin — points scored minus points allowed.",
    whyItMatters: [
      "One of the simplest signals of team strength across a season.",
    ],
    howToInterpret: [
      "Positive = outscoring opponents on average.",
      "Larger absolute values usually mean clearer separation — still check sample size.",
    ],
    howDrblUses: [
      "Team boards, Team Season Compare Performance category, season evidence largest win/loss.",
    ],
    caveats: ["Does not alone explain how the margin was created."],
    relatedIds: ["net", "plus_minus", "season_evidence"],
    seeInAction: [{ label: "Explore teams", href: "/explore/teams" }],
  },
  {
    id: "plus_minus",
    slug: "plus-minus",
    name: "Plus/minus",
    shortName: "+/−",
    category: "basics",
    oneSentence:
      "Plus/minus is the team’s scoring margin while a player is on the floor.",
    whyItMatters: [
      "Connects individual minutes to team results — with heavy teammate/opponent noise.",
    ],
    howToInterpret: [
      "Positive means the team outscored opponents during those minutes.",
      "Raw +/− is noisy; do not treat it as pure individual skill.",
    ],
    howDrblUses: ["Box scores and Game Lab player lines when present."],
    caveats: ["Strongly confounded by lineup and schedule."],
    relatedIds: ["diff", "net", "game_lab"],
    seeInAction: [{ label: "Scores", href: "/scores" }],
  },
  {
    id: "pace",
    slug: "pace",
    name: "Pace",
    shortName: "Pace",
    category: "basics",
    oneSentence:
      "Pace estimates how many possessions a team plays — how fast the game flows.",
    whyItMatters: [
      "Faster pace inflates raw counting stats; efficiency metrics help compare across speeds.",
    ],
    howToInterpret: [
      "Higher pace = more possessions = more counting-stat opportunities.",
    ],
    howDrblUses: [
      "Mentioned in education and advanced contexts; Game Lab v1 does not claim possession counts.",
    ],
    caveats: [
      "Not available as a first-class GameSummary field for season evidence.",
    ],
    relatedIds: ["ortg", "drtg", "ts"],
    seeInAction: [{ label: "Learn ORtg", href: "/learn/offensive-rating" }],
  },
  {
    id: "turnovers",
    slug: "turnovers",
    name: "Turnovers",
    shortName: "TOV",
    category: "basics",
    oneSentence:
      "A turnover ends a possession without a shot attempt — the ball is lost.",
    whyItMatters: ["Turnovers erase offensive chances and feed the opponent."],
    howToInterpret: [
      "Lower team turnovers (or higher AST/TO) usually signal cleaner offense.",
    ],
    howDrblUses: [
      "Player and team boards; CPI subtracts TOV; Team Compare Possessions category.",
    ],
    caveats: ["Context matters — high-usage creators often carry more turnovers."],
    relatedIds: ["ast_to", "usg", "cpi"],
    seeInAction: [{ label: "Player leaderboard", href: "/explore/players" }],
  },
  {
    id: "field_goal_percentage",
    slug: "field-goal-percentage",
    name: "Field goal percentage",
    shortName: "FG%",
    category: "shooting",
    oneSentence:
      "FG% is makes ÷ attempts for all field goals — twos and threes count the same.",
    whyItMatters: ["Classic shooting rate, but it undervalues threes."],
    howToInterpret: [
      "Use eFG% or TS% when three-point volume differs.",
    ],
    howDrblUses: ["Leaderboards, player tables, Game Lab."],
    caveats: ["Does not include free throws."],
    relatedIds: ["efg", "ts", "fg3"],
    seeInAction: [{ label: "Learn eFG%", href: "/learn/effective-field-goal" }],
  },
  {
    id: "three_point_percentage",
    slug: "three-point-percentage",
    name: "Three-point percentage",
    shortName: "3P%",
    category: "shooting",
    oneSentence: "Made threes divided by three-point attempts.",
    whyItMatters: ["Measures accuracy from beyond the arc."],
    howToInterpret: [
      "Pair with attempt volume — tiny samples swing wildly.",
    ],
    howDrblUses: ["Shooting categories in player/team compares."],
    caveats: ["High 3P% on low volume is not the same as high volume accuracy."],
    relatedIds: ["efg", "three_par", "ts"],
    seeInAction: [{ label: "Learn TS%", href: "/learn/true-shooting" }],
  },
  {
    id: "three_point_rate",
    slug: "three-point-rate",
    name: "Three-point attempt rate",
    shortName: "3PAr",
    category: "shooting",
    oneSentence:
      "Share of field goal attempts that come from three — a style/volume signal.",
    whyItMatters: ["Separates “shoots a lot of threes” from “makes threes.”"],
    howToInterpret: ["Higher 3PAr means a more perimeter-oriented shot diet."],
    howDrblUses: ["Team profile traits and shooting context."],
    caveats: ["Not accuracy — pair with 3P% / eFG%."],
    relatedIds: ["fg3", "efg"],
    seeInAction: [{ label: "Explore teams", href: "/explore/teams" }],
  },
  {
    id: "assist_to_turnover",
    slug: "assist-to-turnover",
    name: "Assist-to-turnover ratio",
    shortName: "AST/TO",
    category: "usage",
    oneSentence: "Assists divided by turnovers — a simple care-vs-creation ratio.",
    whyItMatters: ["Helps read playmaking cleanliness."],
    howToInterpret: ["Higher is generally better; role still matters."],
    howDrblUses: ["Team Compare Possessions; player boards when present."],
    caveats: ["High-usage stars may post lower ratios than low-usage facilitators."],
    relatedIds: ["ast", "tov"],
    seeInAction: [{ label: "Team compare", href: "/compare?mode=teams" }],
  },
  {
    id: "offensive_rebound_percentage",
    slug: "offensive-rebound-percentage",
    name: "Offensive rebound percentage",
    shortName: "ORB%",
    category: "usage",
    oneSentence:
      "Estimated share of available offensive rebounds grabbed by a player or team.",
    whyItMatters: ["Extra possessions without needing a make."],
    howToInterpret: ["Higher ORB% means more second-chance opportunities."],
    howDrblUses: ["Team boards and Team Season Compare rebounding category."],
    caveats: ["Not on lightweight GameSummary evidence rows."],
    relatedIds: ["reb", "diff"],
    seeInAction: [{ label: "Explore teams", href: "/explore/teams" }],
  },
  {
    id: "essentially_even",
    slug: "essentially-even",
    name: "Essentially even",
    shortName: "Even",
    category: "status",
    oneSentence:
      "DRBL labels a comparison essentially even when both sides fall inside the documented tolerance.",
    whyItMatters: [
      "Prevents tiny noise differences from looking like decisive edges.",
    ],
    howToInterpret: [
      "Neither side earns a category/overall win from that metric.",
      "In Copeland ranking, even = 0.5 points each.",
    ],
    howDrblUses: [
      "Player and team season compares; Rank My Seasons / Rank Team Seasons.",
    ],
    caveats: [
      "Tolerance is product policy — not a claim that the true difference is zero.",
    ],
    relatedIds: ["copeland", "unavailable", "team_season_compare"],
    seeInAction: [{ label: "Compare teams", href: "/compare?mode=teams" }],
  },
  {
    id: "unavailable",
    slug: "unavailable",
    name: "Unavailable",
    shortName: "Unavailable",
    category: "status",
    oneSentence:
      "Unavailable means the required data is missing or not reliable enough for that edge.",
    whyItMatters: [
      "Keeps missing evidence visible instead of silently treating it as zero.",
    ],
    howToInterpret: [
      "In Copeland ranking, unavailable awards 0 points but is counted separately from losses.",
    ],
    howDrblUses: ["Compares, rankings, season evidence coverage."],
    caveats: ["Do not invent filler values."],
    relatedIds: ["insufficient_evidence", "historical_impact"],
    seeInAction: [{ label: "Learn historical impact", href: "/learn/historical-impact" }],
  },
  {
    id: "insufficient_evidence",
    slug: "insufficient-evidence",
    name: "Insufficient evidence",
    shortName: "Insufficient",
    category: "status",
    oneSentence:
      "Some data exists, but the sample does not meet DRBL’s qualification threshold for a strong claim.",
    whyItMatters: ["Protects users from overreading tiny samples."],
    howToInterpret: [
      "Different from unavailable (missing) and from a decisive loss.",
    ],
    howDrblUses: ["ASK status states; eligibility messaging."],
    caveats: ["Thresholds differ by feature — read the local methodology."],
    relatedIds: ["not_eligible", "incomplete_season"],
    seeInAction: [{ label: "ASK DRBL", href: "/ask" }],
  },
  {
    id: "not_eligible",
    slug: "not-eligible",
    name: "Not eligible",
    shortName: "Not eligible",
    category: "status",
    oneSentence:
      "A season (or row) that fails minimum participation rules is shown but not competitively ranked.",
    whyItMatters: [
      "Keeps incomplete or thin seasons visible without pretending they are full peers.",
    ],
    howToInterpret: [
      "Typical floors: games played / minutes thresholds documented per feature.",
    ],
    howDrblUses: ["Career Resume, Rank My Seasons, Rank Team Seasons."],
    caveats: ["Eligibility ≠ talent judgment."],
    relatedIds: ["incomplete_season", "insufficient_evidence"],
    seeInAction: [
      { label: "Team Rank Seasons", href: "/compare?mode=teams&view=rank" },
    ],
  },
  {
    id: "incomplete_season",
    slug: "incomplete-season",
    name: "Incomplete season",
    shortName: "Incomplete",
    category: "status",
    oneSentence:
      "A current season still in progress — or below the games threshold — is incomplete for completed-season comparisons.",
    whyItMatters: [
      "Stops midseason samples from being treated like finished 82-game profiles.",
    ],
    howToInterpret: [
      "Team Rank often requires ≥50 GP before treating the current season as complete.",
    ],
    howDrblUses: ["Team/player ranking eligibility notes."],
    caveats: ["You can still inspect available evidence games."],
    relatedIds: ["not_eligible"],
    seeInAction: [
      { label: "Team Rank Seasons", href: "/compare?mode=teams&view=rank" },
    ],
  },
  {
    id: "contested",
    slug: "contested",
    name: "Contested ranking",
    shortName: "Contested",
    category: "status",
    oneSentence:
      "A ranking is contested when pairwise wins form a cycle (A beats B, B beats C, C beats A).",
    whyItMatters: [
      "Honestly discloses that Copeland order is not a uniquely “true” transitive ranking.",
    ],
    howToInterpret: [
      "Inspect the pairwise matrix; do not pretend absolute order.",
    ],
    howDrblUses: ["Rank My Seasons and Rank Team Seasons banners."],
    caveats: ["Copeland points are still shown for a deterministic display order."],
    relatedIds: ["copeland", "close_top"],
    seeInAction: [
      { label: "Team Rank Seasons", href: "/compare?mode=teams&view=rank" },
    ],
  },
  {
    id: "close_top",
    slug: "close-top",
    name: "Close top",
    shortName: "Close",
    category: "status",
    oneSentence:
      "Close top means the leaders are separated by only a small Copeland gap (≤0.5 points in current team/player rankers).",
    whyItMatters: [
      "Signals that #1 vs #2 is fragile under the current selected set.",
    ],
    howToInterpret: [
      "Open pairwise compares; small evidence changes can reorder the top.",
    ],
    howDrblUses: ["Rank My Seasons / Rank Team Seasons."],
    caveats: ["Threshold is documented product policy."],
    relatedIds: ["copeland", "contested"],
    seeInAction: [
      { label: "Team Rank Seasons", href: "/compare?mode=teams&view=rank" },
    ],
  },
  {
    id: "transaction_layers",
    slug: "transaction-layers",
    name: "Transaction layers",
    shortName: "Transactions",
    category: "transactions",
    oneSentence:
      "DRBL separates ESPN source events, related-event clusters, and structured transactions — and only the last can unlock trade genealogy.",
    whyItMatters: [
      "Prevents free-text blurbs from being mistaken for verified asset moves.",
    ],
    howToInterpret: [
      "Source event = verbatim ESPN report.",
      "Related cluster = safely linked reports — still not a full trade package.",
      "Structured transaction = verified assets (currently 0 in production).",
    ],
    howDrblUses: [
      "Offseason Tracker.",
      "Genealogy UI stays blocked until a licensed structured source exists.",
    ],
    caveats: [
      "Do not infer picks/players from ESPN prose.",
      "Structured-source ingestion is parked after a formal NO-GO audit.",
    ],
    relatedIds: [
      "source_event",
      "related_event_cluster",
      "structured_transaction",
      "trade_exception",
      "draft_capital",
    ],
    seeInAction: [{ label: "Offseason Tracker", href: "/offseason" }],
    sources: [
      "docs/offseason-tracker.md",
      "docs/structured-transaction-source-audit.md",
    ],
  },
  {
    id: "trade_exception",
    slug: "trade-exception",
    name: "Trade Exception (TPE)",
    shortName: "TPE",
    category: "transactions",
    oneSentence:
      "A Trade Exception is a CBA mechanism that may allow a team to acquire qualifying salary without sending equal salary back — subject to league rules and only when structured TPE data exists.",
    whyItMatters: [
      "Fans often confuse “fits the dollar amount” with “this trade is legal.”",
      "Teams use TPEs as flexible acquisition tools after outgoing trades.",
    ],
    howToInterpret: [
      "Amount and expiration come only from a verified structured source.",
      "Remaining value is never calculated from assumptions.",
      "Salary fit lists (when available) are not tradability lists.",
    ],
    howDrblUses: [
      "Team Cap & assets shows TPE rows only when a structured ledger is ingested.",
      "MetricHelp / Learn explain the concept; ESPN free text never invents a TPE.",
    ],
    caveats: [
      "Production currently has zero structured TPEs.",
      "Fit ≠ eligibility ≠ legality.",
    ],
    relatedIds: ["salary_fit", "trade_legality", "structured_transaction"],
    seeInAction: [{ label: "Example team assets", href: "/teams/bos" }],
    sources: ["docs/trade-builder-architecture.md"],
  },
  {
    id: "salary_fit_vs_legality",
    slug: "salary-fit-vs-legality",
    name: "Salary fit vs trade legality",
    shortName: "Fit vs legal",
    category: "transactions",
    oneSentence:
      "DRBL separates salary fit, transaction eligibility, and full trade legality so “could fit a TPE” is never shown as “you can trade for this player.”",
    whyItMatters: [
      "Collapsing fit into “tradable” would mislead users and break trust.",
      "A future Trade Builder needs these stages as explicit product steps.",
    ],
    howToInterpret: [
      "Salary fit — does the dollar amount fit the selected mechanism?",
      "Eligibility — are there restrictions on moving that player?",
      "Legality — does the whole package satisfy CBA / roster / timing rules?",
    ],
    howDrblUses: [
      "Cap asset UI keeps tiers separate.",
      "Future validateTrade returns structured reasons; the LLM may explain results but does not decide legality.",
    ],
    caveats: [
      "No production fit lists until structured salary + TPE data exist.",
      "Trade quality analysis is separate from legality.",
    ],
    relatedIds: ["salary_fit", "trade_legality", "trade_exception"],
    seeInAction: [{ label: "Team assets", href: "/teams/bos" }],
    sources: ["docs/trade-builder-architecture.md"],
  },

  // --- DRBL rabbit hole (systems / methodology) ---
  {
    id: "how_drbl_works",
    slug: "how-drbl-works",
    name: "How DRBL works",
    shortName: "How DRBL works",
    category: "systems",
    oneSentence:
      "DRBL watches each possession’s expected scoring value change, credits players when the play-by-play supports it, then turns that into a rate (DRBL/100) and a season total (WAR1).",
    whyItMatters: [
      "Player pages answer “how good?” without teaching the model — this page is for fans who want the possession story.",
      "Formulas make more sense after the basketball sequence is clear.",
    ],
    howToInterpret: [
      "A possession starts with an expected scoring value (what you’d typically get from that situation).",
      "Shots, passes, turnovers, fouls, and other logged actions move that expectation up or down.",
      "When the public play-by-play clearly ties a change to a player, DRBL credits them.",
      "Those credits build a per-possession rate (shrunk for small samples) and a season pile-up above the R1 baseline.",
    ],
    howDrblUses: [
      "Credits are measured against a role-matched R1 expected-points baseline.",
      "DRBL/100 is that rate after shrinkage toward zero for small samples.",
      "WAR1 is the season total (R1 Points) converted into win-style units.",
    ],
    calculation: [
      "Possession begins → expected scoring value is set.",
      "Actions occur → expected value changes.",
      "Credit is attributed for observable contributions.",
      "Possessions accumulate into a raw ability rate.",
      "Small samples are pulled toward zero so early-season noise doesn’t dominate.",
      "Season value accumulates as R1 Points → WAR1.",
    ],
    caveats: [
      "Public play-by-play does not see every off-ball or spatial action.",
      "Credit is not the same as proving “replace this player and wins change by X.”",
      "Diagnostics P / LN / B do not add up to DRBL/100.",
    ],
    relatedIds: ["drbl", "r1_win_eq", "drbl_p", "r1", "drbl_validation", "drbl_limitations"],
    seeInAction: [
      { label: "DRBL overview", href: "/learn/drbl" },
      { label: "Explore by DRBL/100", href: "/explore/players?sort=drbl100" },
    ],
    sources: ["/learn/drbl", "src/content/stats/drbl-guides.ts"],
  },
  {
    id: "drbl_validation",
    slug: "drbl-validation",
    name: "DRBL validation",
    shortName: "Validation",
    category: "systems",
    oneSentence:
      "DRBL was stress-tested on held-out and later seasons to check whether the estimates are useful — without claiming it beats DARKO or other public models.",
    whyItMatters: [
      "Fans deserve to know these numbers were tested, not invented for the UI.",
      "Advanced users need the research trail without treating unfinished external comparisons as product claims.",
    ],
    howToInterpret: [
      "Reserved testing holds out data the model did not tune against.",
      "Out-of-time testing checks whether earlier seasons help predict later ones.",
      "Research milestones (like M16j / M17b) document that work — they are not knobs on the public boards.",
    ],
    howDrblUses: [
      "Published DRBL/100 uses the validated shrinkage path sealed in research.",
      "Product boards do not claim DRBL beats DARKO, BPM, or other externals.",
    ],
    calculation: [
      "Review reserved / out-of-time protocols from the sealed research reports.",
      "Inspect sample sizes and error summaries where published.",
      "On one reserved external comparison, DRBL and BPM were statistically indistinguishable; broader head-to-heads were limited by historical coverage of other metrics.",
    ],
    caveats: [
      "Do not read that comparison as “DRBL beat BPM” or “DRBL is the best public metric.”",
      "Individual uncertainty intervals are not currently shown on player pages.",
      "Validation does not erase play-by-play observability limits.",
    ],
    relatedIds: ["drbl", "how_drbl_works", "drbl_limitations", "drbl_historical"],
    seeInAction: [{ label: "DRBL overview", href: "/learn/drbl" }],
    sources: ["reports/m16j/", "reports/m17b/", "reports/m17c/", "reports/m17c_provenance/"],
  },
  {
    id: "drbl_historical",
    slug: "drbl-historical-data",
    name: "DRBL historical data",
    shortName: "Historical data",
    category: "systems",
    oneSentence:
      "Older seasons can have box scores or raw play-by-play without a published DRBL estimate — missing DRBL is not a zero.",
    whyItMatters: [
      "Fans often ask why older seasons show box scores but not DRBL.",
      "Clear coverage boundaries stop people from treating blanks as “bad” seasons.",
    ],
    howToInterpret: [
      "Raw data can exist farther back than seasons DRBL currently supports as a product estimate.",
      "Supported seasons are listed on the DRBL overview and season registry.",
      "Unsupported seasons are not filled with placeholder DRBL numbers.",
    ],
    howDrblUses: [
      "Player pages show an explicit unsupported / missing reason when DRBL is not published.",
      "Explore filters respect DRBL season coverage.",
    ],
    caveats: [
      "Having raw data ≠ having published DRBL.",
      "Even inside supported windows, cross-era comparisons are not fully settled.",
      "Expanding history further is a future track, not an automatic unlock.",
    ],
    relatedIds: ["drbl", "drbl_validation", "drbl_limitations"],
    seeInAction: [
      { label: "DRBL overview", href: "/learn/drbl" },
      { label: "Explore players", href: "/explore/players" },
    ],
    sources: ["src/data/drbl/season-registry.ts"],
  },
  {
    id: "drbl_limitations",
    slug: "drbl-limitations",
    name: "DRBL limitations",
    shortName: "Limitations",
    category: "systems",
    oneSentence:
      "DRBL is a useful impact estimate — not causal roster value, complete off-ball measurement, classic WAR, or a proven best-in-public metric across eras.",
    whyItMatters: [
      "Honest limits deepen trust more than burying caveats.",
      "Advanced diagnostics (especially LN and B) are easy to over-read.",
    ],
    howToInterpret: [
      "Not a causal “replace this player and the team’s wins change by X.”",
      "Standard play-by-play misses some spatial / off-ball behavior.",
      "Lineup context (DRBL-LN) is association with teammates — not proven off-ball value.",
      "Player pages do not currently show individual uncertainty bands.",
      "R1 is not classic replacement; WAR1 is not traditional WAR.",
      "Cross-era comparisons and “beats DARKO” claims are not product claims.",
    ],
    howDrblUses: [
      "Primary surfaces stay on DRBL/100 and WAR1.",
      "P / LN / B stay as diagnostics with Learn links.",
      "Retired WAR / uncertainty framing stays out of public ranking.",
    ],
    caveats: [
      "Off-ball research tracks remain behind the research boundary.",
      "Do not add P + LN + B and call it DRBL/100.",
    ],
    relatedIds: ["drbl", "drbl_ln", "drbl_b", "r1", "drbl_validation", "drbl_historical"],
    seeInAction: [{ label: "DRBL overview", href: "/learn/drbl" }],
    sources: ["/learn/drbl"],
  },
];

export function getLearnTopic(slug: string): LearnTopic | undefined {
  return LEARN_TOPICS.find((t) => t.slug === slug || t.id === slug);
}

export function listLearnTopics(): LearnTopic[] {
  return LEARN_TOPICS;
}
