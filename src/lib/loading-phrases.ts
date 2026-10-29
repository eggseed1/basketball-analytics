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

/** How long each line stays up before the next. */
export const LOADING_PHRASE_ROTATE_MS = 1600;

const PHRASES: Record<LoadingContext, readonly string[]> = {
  home: [
    "Warming up the tip-off board",
    "Shuffling tonight's insights",
    "Checking who went off last night",
    "Polishing the home stack",
    "Cueing the night's cards",
  ],
  scores: [
    "Listening for live tip-offs",
    "Syncing the scoreboard crawl",
    "Counting down to the next whistle",
    "Straightening the schedule tiles",
    "Flipping to tonight's slate",
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
    "Ranking the next column",
  ],
  "explore-games": [
    "Flipping through the game archive",
    "Matching dates to tip-offs",
    "Stacking the score tiles",
    "Brushing dust off old boxes",
    "Finding the right night",
  ],
  "explore-viz": [
    "Plotting the league scatter",
    "Tuning the race tracker axes",
    "Coloring the usage map",
    "Spacing the chart labels",
    "Warming the viz brushes",
  ],
  "explore-styles": [
    "Clustering play styles",
    "Grouping similar shot diets",
    "Sorting the archetype lanes",
    "Matching nearby profiles",
    "Sketching the style map",
  ],
  "explore-hot-cold": [
    "Feeling out the hot streaks",
    "Chilling the cold snaps",
    "Scanning recent form",
    "Marking the heaters",
    "Tracking the cool-downs",
  ],
  "explore-trade": [
    "Balancing the trade sketch",
    "Running the salary fit",
    "Stress-testing the roster math",
    "Moving chips on the board",
    "Checking the cap room",
  ],
  standings: [
    "Stacking East and West",
    "Recounting the win columns",
    "Pinning the play-in line",
    "Sorting the seed rows",
    "Updating the race board",
  ],
  "standings-viz": [
    "Drawing the race curves",
    "Checking luck vs skill",
    "Wiring the team charts",
    "Smoothing the season paths",
    "Labeling the conference lines",
  ],
  team: [
    "Opening the franchise binder",
    "Lining up the roster cards",
    "Reading the team board",
    "Warming the depth chart",
    "Pulling the season ledger",
  ],
  player: [
    "Fetching the player file",
    "Loading career tape",
    "Ranking the percentile lanes",
    "Cueing the shot map",
    "Flipping through the seasons",
  ],
  compare: [
    "Setting the two sides",
    "Lining up the shared seasons",
    "Weighing the head-to-head",
    "Matching the overlapping years",
    "Putting the cards side by side",
  ],
  ask: [
    "Waking Ask DRBL",
    "Indexing a few more answers",
    "Clearing a path to the models",
    "Warming the question desk",
    "Pulling nearby facts",
  ],
  awards: [
    "Dusting off the trophy case",
    "Checking ballot history",
    "Sorting the award shelves",
    "Recounting the hardware",
    "Opening last year's envelope",
  ],
  history: [
    "Winding the Time Machine",
    "Pulling a season snapshot",
    "Dusting the archive shelves",
    "Finding the right year",
    "Replaying an old slate",
  ],
  offseason: [
    "Reading the transaction wire",
    "Sorting signings from waives",
    "Catching up on the rumor mill",
    "Scanning free-agent notes",
    "Logging the latest moves",
  ],
  learn: [
    "Opening the methods notes",
    "Bookmarking the glossary",
    "Flipping to the next explainer",
    "Lining up the examples",
    "Warming the chalkboard",
  ],
  arcade: [
    "Shuffling today's puzzles",
    "Dealing a fresh board",
    "Warming the arcade lights",
    "Stacking a new round",
    "Cueing the next game",
  ],
  dashboard: [
    "Wiring the league boards",
    "Snapping chart filters into place",
    "Lining up the dashboard tiles",
    "Refreshing the control row",
    "Loading the overview pane",
  ],
  sentiment: [
    "Listening to the fan lanes",
    "Skimming the headline mood",
    "Sampling the mention stream",
    "Reading the noise floor",
    "Sorting praise from panic",
  ],
  injuries: [
    "Checking the injury report",
    "Updating return windows",
    "Scanning the availability list",
    "Marking day-to-day notes",
    "Refreshing status tags",
  ],
  findings: [
    "Replaying recent findings",
    "Stacking the insight cards",
    "Pulling the latest notes",
    "Sorting what stood out",
    "Cueing the next card",
  ],
  movement: [
    "Tracking roster movement",
    "Following the latest deals",
    "Reading the wire again",
    "Logging who changed hands",
    "Sorting trades from signings",
  ],
  franchises: [
    "Unfolding franchise history",
    "Matching eras to logos",
    "Flipping through the timeline",
    "Pulling old season marks",
    "Lining up the franchise file",
  ],
  gm: [
    "Booting the front office",
    "Loading the salary sheet",
    "Warming the draft board",
    "Opening the assets drawer",
    "Checking the cap sheet",
  ],
  section: [
    "Scouring the database",
    "Wiring this section",
    "Almost there",
    "Pulling the next block",
    "Warming this panel",
  ],
  "section-lab": [
    "Warming Game Lab",
    "Tracing possessions",
    "Checking the flow chart",
    "Loading the deep cuts",
    "Lining up the lab tabs",
  ],
  "section-chart": [
    "Triple-checking the graphs",
    "Inking the axes",
    "Plotting the next series",
    "Spacing the data points",
    "Warming the chart pane",
  ],
  "section-roster": [
    "Calling roll on the roster",
    "Matching names to headshots",
    "Sorting the depth rows",
    "Checking who's dressed",
    "Lining up the roster cards",
  ],
  "section-salary": [
    "Reading the salary books",
    "Balancing the cap sheet",
    "Counting the draft chips",
    "Checking the money lanes",
    "Tallying the contracts",
  ],
  "section-preview": [
    "Scouting the matchup",
    "Pulling recent form",
    "Lining up the starters",
    "Reading the preview notes",
    "Checking the last five",
  ],
  "section-flow": [
    "Tracing the scoring runs",
    "Plotting every make and miss",
    "Replaying the flow",
    "Marking the swing minutes",
    "Walking the possession trail",
  ],
  about: [
    "Opening the about page",
    "Dusting off the origin story",
    "Pulling the project notes",
    "Lining up the credits",
    "Warming the intro",
  ],
  bracket: [
    "Drawing the bracket lines",
    "Seeding the field",
    "Connecting the rounds",
    "Checking the matchup slots",
    "Warming the bracket board",
  ],
  race: [
    "Lining up the race lanes",
    "Cueing the season tracker",
    "Spacing the leader dots",
    "Checking the pace marks",
    "Warming the race board",
  ],
  generic: [
    "Scouring the database",
    "Wiring the backend",
    "Triple-checking the graphs",
    "Almost ready",
    "Pulling the next page",
  ],
};

export function loadingPhrasesFor(
  context: LoadingContext
): readonly string[] {
  return PHRASES[context] ?? PHRASES.generic;
}

/**
 * Client start index so soft-navs and simultaneous loaders don't all open on
 * line 0. Mixes context with a wall-clock tick roughly once per rotate.
 */
export function loadingPhraseStartIndex(
  context: LoadingContext,
  now = Date.now()
): number {
  const phrases = loadingPhrasesFor(context);
  const length = phrases.length;
  if (length <= 1) return 0;
  let h = 0;
  for (let i = 0; i < context.length; i++) {
    h = (h * 33 + context.charCodeAt(i)) | 0;
  }
  const tick = Math.floor(now / LOADING_PHRASE_ROTATE_MS);
  return Math.abs(tick + h) % length;
}

/** SSR / aria first paint — stable phrase[0] until the client rotates. */
export function initialLoadingPhrase(context: LoadingContext): string {
  return loadingPhrasesFor(context)[0] ?? "Loading…";
}
