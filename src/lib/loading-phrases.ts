/**
 * Fun, page-aware loading lines. Shown while skeletons paint — not product
 * blurbs about what the destination "will" do.
 */

export type LoadingContext =
  | "home"
  | "scores"
  | "game"
  | "explore-players"
  | "explore-games"
  | "explore-viz"
  | "explore-styles"
  | "explore-hot-cold"
  | "explore-trade"
  | "standings"
  | "standings-viz"
  | "team"
  | "player"
  | "compare"
  | "ask"
  | "awards"
  | "history"
  | "offseason"
  | "learn"
  | "arcade"
  | "dashboard"
  | "sentiment"
  | "injuries"
  | "findings"
  | "movement"
  | "franchises"
  | "gm"
  | "section"
  | "section-lab"
  | "section-chart"
  | "section-roster"
  | "section-salary"
  | "section-preview"
  | "section-flow"
  | "about"
  | "bracket"
  | "race"
  | "generic";

const PHRASES: Record<LoadingContext, readonly string[]> = {
  home: [
    "Warming up the tip-off board",
    "Shuffling tonight's insights",
    "Checking who went off last night",
    "Polishing the home stack",
  ],
  scores: [
    "Listening for live tip-offs",
    "Syncing the scoreboard crawl",
    "Counting down to the next whistle",
    "Straightening the schedule tiles",
  ],
  game: [
    "Pulling the box score apart",
    "Tracing every possession",
    "Warming Game Lab",
    "Lining up the shot chart",
    "Triple-checking the period table",
  ],
  "explore-players": [
    "Scouring the player board",
    "Sorting a few thousand rows",
    "Aligning the frozen name column",
    "Baking the season filters",
  ],
  "explore-games": [
    "Flipping through the game archive",
    "Matching dates to tip-offs",
    "Stacking the score tiles",
  ],
  "explore-viz": [
    "Plotting the league scatter",
    "Tuning the race tracker axes",
    "Coloring the usage map",
  ],
  "explore-styles": [
    "Clustering play styles",
    "Grouping similar shot diets",
  ],
  "explore-hot-cold": [
    "Feeling out the hot streaks",
    "Chilling the cold snaps",
  ],
  "explore-trade": [
    "Balancing the trade sketch",
    "Running the salary fit",
    "Stress-testing the roster math",
  ],
  standings: [
    "Stacking East and West",
    "Recounting the win columns",
    "Pinning the play-in line",
  ],
  "standings-viz": [
    "Drawing the race curves",
    "Checking luck vs skill",
    "Wiring the team charts",
  ],
  team: [
    "Opening the franchise binder",
    "Lining up the roster cards",
    "Reading the team board",
    "Warming the depth chart",
  ],
  player: [
    "Fetching the player file",
    "Loading career tape",
    "Ranking the percentile lanes",
    "Cueing the shot map",
  ],
  compare: [
    "Setting the two sides",
    "Lining up the shared seasons",
    "Weighing the head-to-head",
  ],
  ask: [
    "Waking Ask DRBL",
    "Indexing a few more answers",
    "Clearing a path to the models",
  ],
  awards: [
    "Dusting off the trophy case",
    "Checking ballot history",
  ],
  history: [
    "Winding the Time Machine",
    "Pulling a season snapshot",
    "Dusting the archive shelves",
  ],
  offseason: [
    "Reading the transaction wire",
    "Sorting signings from waives",
    "Catching up on the rumor mill",
  ],
  learn: [
    "Opening the methods notes",
    "Bookmarking the glossary",
  ],
  arcade: [
    "Shuffling today's puzzles",
    "Dealing a fresh board",
  ],
  dashboard: [
    "Wiring the league boards",
    "Snapping chart filters into place",
  ],
  sentiment: [
    "Listening to the fan lanes",
    "Skimming the headline mood",
  ],
  injuries: [
    "Checking the injury report",
    "Updating return windows",
  ],
  findings: [
    "Replaying recent findings",
    "Stacking the insight cards",
  ],
  movement: [
    "Tracking roster movement",
    "Following the latest deals",
  ],
  franchises: [
    "Unfolding franchise history",
    "Matching eras to logos",
  ],
  gm: [
    "Booting the front office",
    "Loading the salary sheet",
    "Warming the draft board",
  ],
  section: [
    "Scouring the database",
    "Wiring this section",
    "Almost there",
  ],
  "section-lab": [
    "Warming Game Lab",
    "Tracing possessions",
    "Checking the flow chart",
  ],
  "section-chart": [
    "Triple-checking the graphs",
    "Inking the axes",
    "Plotting the next series",
  ],
  "section-roster": [
    "Calling roll on the roster",
    "Matching names to headshots",
  ],
  "section-salary": [
    "Reading the salary books",
    "Balancing the cap sheet",
    "Counting the draft chips",
  ],
  "section-preview": [
    "Scouting the matchup",
    "Pulling recent form",
    "Lining up the starters",
  ],
  "section-flow": [
    "Tracing the scoring runs",
    "Plotting every make and miss",
    "Replaying the flow",
  ],
  about: [
    "Opening the about page",
    "Dusting off the origin story",
  ],
  bracket: [
    "Drawing the bracket lines",
    "Seeding the field",
  ],
  race: [
    "Lining up the race lanes",
    "Cueing the season tracker",
  ],
  generic: [
    "Scouring the database",
    "Wiring the backend",
    "Triple-checking the graphs",
    "Almost ready",
  ],
};

export function loadingPhrasesFor(
  context: LoadingContext
): readonly string[] {
  return PHRASES[context] ?? PHRASES.generic;
}

/** Stable first phrase for SSR / first paint (no random flash). */
export function initialLoadingPhrase(context: LoadingContext): string {
  return loadingPhrasesFor(context)[0] ?? "Loading…";
}
