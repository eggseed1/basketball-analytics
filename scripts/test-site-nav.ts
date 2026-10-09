/**
 * Site IA / active-nav checks.
 * Run: npx tsx scripts/test-site-nav.ts
 */
import assert from "node:assert/strict";

import {
  PRIMARY_NAV,
  primaryNavLabelForPath,
} from "../src/components/sports/site-nav";

const cases: Array<[string, string]> = [
  ["/", "Home"],
  ["/ask", "Ask DRBL"],
  ["/ask?q=raptor", "Ask DRBL"],
  ["/scores", "Games"],
  ["/scores?view=week", "Games"],
  ["/explore/games", "Games"],
  ["/games/401585601", "Games"],
  ["/explore/players", "Players"],
  ["/explore/players/race", "Players"],
  ["/explore/players/visualizations", "Players"],
  ["/players/1966", "Players"],
  ["/players/1966/season-compare", "Players"],
  ["/players/1966/season-rank", "Players"],
  ["/standings", "Teams"],
  ["/standings/visualizations", "Teams"],
  ["/standings/tracker", "Teams"],
  ["/explore/bracket", "Teams"],
  ["/explore/teams", "Teams"],
  ["/teams/2", "Teams"],
  ["/compare", "Compare"],
  ["/offseason", "Transactions"],
  ["/offseason?year=2025", "Transactions"],
  ["/learn", "Learn"],
  ["/learn/true-shooting", "Learn"],
  ["/franchises", "Teams"],
  ["/franchises/bos", "Teams"],
  ["/history", "History"],
  ["/history?season=1978-79", "History"],
  ["/arcade", "Arcade"],
  ["/arcade/zero-82", "Arcade"],
  ["/gm", "Arcade"],
  ["/gm/roster", "Arcade"],
];

for (const [path, expected] of cases) {
  // Pathname-only matching (query stripped like Next usePathname).
  const pathname = path.split("?")[0]!;
  assert.equal(
    primaryNavLabelForPath(pathname),
    expected,
    `${path} → expected ${expected}`
  );
}

assert.deepEqual(
  PRIMARY_NAV.map((n) => n.label),
  [
    "Home",
    "Games",
    "Players",
    "Teams",
    "Compare",
    "Sentiment",
    "Transactions",
    "Learn",
    "Ask DRBL",
    "History",
    "Arcade",
  ]
);

const teams = PRIMARY_NAV.find((n) => n.id === "teams");
assert.ok(teams?.subnav?.length);
assert.equal(teams.href, "/standings");
assert.deepEqual(
  teams.subnav.map((s) => s.label),
  ["Standings", "Visualizations"]
);
const teamsSubnavFor = (p: string) =>
  teams.subnav!.filter((s) => s.match?.(p)).map((s) => s.label);
for (const [path, expected] of [
  ["/standings", ["Standings"]],
  ["/teams/2", ["Standings"]],
  ["/franchises/bos", ["Standings"]],
  ["/standings/visualizations", ["Visualizations"]],
] as const) {
  assert.deepEqual(teamsSubnavFor(path), expected, `${path} teams subnav`);
}

assert.equal(
  PRIMARY_NAV.find((n) => n.id === "standings"),
  undefined,
  "Standings is not a top-level primary"
);

const players = PRIMARY_NAV.find((n) => n.id === "players");
assert.ok(players?.subnav?.length);
assert.deepEqual(
  players.subnav.map((s) => s.label),
  ["Board", "Hot & Cold", "Visualizations"]
);

// Deep features must not be top-level.
for (const banned of [
  "Game Lab",
  "Career Resume",
  "Season Compare",
  "Rank My Seasons",
  "Gamefeed",
  "Leaderboard",
  "Offseason",
  "Stats",
  "Franchises",
  "Standings",
]) {
  assert.ok(
    !PRIMARY_NAV.some((n) => n.label === banned),
    `top-level must not include ${banned}`
  );
}

// ASK stays prominent and sits beside Learn on desktop.
const askIndex = PRIMARY_NAV.findIndex((n) => n.id === "ask");
const learnIndex = PRIMARY_NAV.findIndex((n) => n.id === "learn");
assert.equal(PRIMARY_NAV[askIndex]?.prominent, true);
assert.equal(askIndex, learnIndex + 1);

console.log("test-site-nav: all assertions passed");
