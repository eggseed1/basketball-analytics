/**
 * League & team moves: strict headline matching, one headline per story.
 */
import assert from "node:assert/strict";

import { classifyLeagueMove, pickLeagueMoves, type LeagueMoveHeadline } from "../src/lib/league-moves";

const kind = (title: string, nbaOnly = false) => classifyLeagueMove(title, nbaOnly)?.kind ?? null;
const team = (title: string, nbaOnly = false) => classifyLeagueMove(title, nbaOnly)?.teamAbbr ?? null;

// Team moves with an NBA team as the subject.
assert.equal(kind("Cavaliers promote Brandon Weems to general manager"), "front-office");
assert.equal(team("Cavaliers promote Brandon Weems to general manager"), "CLE");
assert.equal(kind("Cleveland promotes long-time executive Brandon Weems to General Manager"), "front-office");
assert.equal(kind("Clippers name Trent Redden interim president of basketball ops in place of suspended Lawrence Frank"), "front-office");
assert.equal(kind("Lakers sign coach JJ Redick to multiyear extension"), "coaching");
assert.equal(kind("Doc Rivers named Bucks head coach"), "coaching");
assert.equal(team("Doc Rivers named Bucks head coach"), "MIL");

// Other sports, quotes, opinion and former coaches stay out.
assert.equal(kind("L.A. Sparks fire coach Lynne Roberts after two seasons"), null);
assert.equal(kind("Houston Dash fire coach Fabrice Gautrat and technical director Twila Kilgore"), null);
assert.equal(kind("Avalanche sign head coach Jared Bednar to 4-year extension"), null);
assert.equal(kind("Jusuf Nurkic names coach Will Hardy as the main reason to re-sign with Utah"), null);
assert.equal(kind("Former Mavericks coach Jason Kidd to join TV studio show"), null);
assert.equal(kind("'I'm not trying to get fined' - Scottie Barnes has had enough of officials"), null);
assert.equal(kind("Bucks Sign Johni Broome", true), null, "player signings belong to transactions");
assert.equal(kind("Should the Knicks fire their coach?"), null);

// Shared nicknames need the full name outside NBA-only feeds.
assert.equal(kind("Kings fire head coach after slow start"), null);
assert.equal(kind("Kings fire head coach after slow start", true), "coaching");
assert.equal(kind("Sacramento Kings fire head coach after slow start"), "coaching");

// Ownership and league stories.
assert.equal(kind("Trail Blazers sale to Tom Dundon group approved"), "ownership");
assert.equal(kind("Las Vegas NBA expansion bids down to 3 finalists"), "league");
assert.equal(classifyLeagueMove("Euroleague to vote on expansion offers as NBA Europe talks loom", false)?.topic, "nba-europe");
assert.equal(kind("Lakers' Marcus Smart, Luke Kennard fined for Game 4 actions"), "league");
assert.equal(kind("NBA Board of Governors approves draft lottery reform"), "league");
assert.equal(kind("NBA season preview: 30 teams in 30 days"), null);

// One headline per story, newest first, league stories capped.
{
  const now = Date.parse("2026-10-06T18:00:00Z");
  const day = 86_400_000;
  const h = (title: string, ago: number, nbaOnly = true): LeagueMoveHeadline => ({
    title,
    url: `https://example.com/${encodeURIComponent(title)}`,
    publication: "Outlet",
    publishedMs: now - ago * day,
    nbaOnly,
  });
  const moves = pickLeagueMoves(
    [
      h("Las Vegas NBA expansion bids down to 3 finalists", 6),
      h("NBA expansion team in Las Vegas could debut in 2029-30", 4),
      h("Cavaliers promote Brandon Weems to general manager", 18),
      h("Cleveland promotes Brandon Weems to GM", 17),
      h("NBA Europe talks continue after EuroLeague vote", 0.5),
      h("NBA Board of Governors approves draft lottery reform", 2),
      h("Lakers' Marcus Smart fined $25,000 by the NBA", 1),
      h("Hornets fire head coach Charles Lee", 45),
      h("Cavaliers to sell minority stake to new investors", 3),
    ],
    now,
    10
  );
  assert.deepEqual(
    moves.map((m) => m.title),
    [
      "NBA Europe talks continue after EuroLeague vote",
      "Lakers' Marcus Smart fined $25,000 by the NBA",
      "NBA Board of Governors approves draft lottery reform",
      "Cavaliers to sell minority stake to new investors",
      "Cleveland promotes Brandon Weems to GM",
    ]
  );
}

console.log("test-league-moves: PASS");
