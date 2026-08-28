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
  ["/ask", "ASK DRBL"],
  ["/ask?q=raptor", "ASK DRBL"],
  ["/scores", "Games"],
  ["/scores?view=week", "Games"],
  ["/explore/games", "Games"],
  ["/games/401585601", "Games"],
  ["/explore/players", "Players"],
  ["/players/1966", "Players"],
  ["/players/1966/season-compare", "Players"],
  ["/players/1966/season-rank", "Players"],
  ["/standings", "Teams"],
  ["/explore/teams", "Teams"],
  ["/teams/2", "Teams"],
  ["/compare", "Compare"],
  ["/offseason", "Transactions"],
  ["/offseason?year=2025", "Transactions"],
  ["/learn", "Learn"],
  ["/learn/true-shooting", "Learn"],
  ["/franchises", "History"],
  ["/franchises/bos", "History"],
  ["/history", "History"],
  ["/history?season=1978-79", "History"],
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
    "ASK DRBL",
    "Games",
    "Players",
    "Teams",
    "Compare",
    "Transactions",
    "Learn",
    "History",
  ]
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
]) {
  assert.ok(
    !PRIMARY_NAV.some((n) => n.label === banned),
    `top-level must not include ${banned}`
  );
}

// ASK remains prominent and pinned second.
assert.equal(PRIMARY_NAV[1]?.id, "ask");
assert.equal(PRIMARY_NAV[1]?.prominent, true);

console.log("test-site-nav: all assertions passed");
