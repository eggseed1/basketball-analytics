/**
 * Injury report: structured fields only, ranked so real absences of key
 * scorers lead and rest days sit last.
 */
import assert from "node:assert/strict";

import { injuryLabel, parseInjuryFeed, rankInjuries, type InjuryEntry } from "../src/lib/injury-report";

assert.equal(injuryLabel({ type: "Knee", detail: "Sprain", side: "Left" }), "Left knee sprain");
assert.equal(injuryLabel({ type: "Achilles", detail: "Surgery", side: "Not Specified" }), "Achilles surgery");
assert.equal(injuryLabel({ type: "Lower Body", detail: "Not Specified", side: "Not Specified" }), "Lower body");
assert.equal(injuryLabel({ type: "Not Injury Related" }), "Not injury related");
assert.equal(injuryLabel({ type: "Not Specified" }), null);

const athlete = (id: string, name: string, team: string) => ({
  displayName: name,
  links: [{ href: `https://example.com/nba/player/_/id/${id}/slug` }],
  team: { abbreviation: team },
});

const entries = parseInjuryFeed({
  injuries: [
    {
      injuries: [
        {
          status: "Out",
          date: "2026-10-01T12:00Z",
          details: { type: "Knee", detail: "Surgery", side: "Right", returnDate: "2027-01-02" },
          athlete: athlete("1", "Star Out", "GS"),
          // Written notes exist in the feed and must never be read.
          ...({ shortComment: "Long note text", longComment: "More note text" } as object),
        },
        {
          status: "Day-To-Day",
          date: "2026-10-05T12:00Z",
          details: { type: "Rest", returnDate: "2026-10-08" },
          athlete: athlete("2", "Star Rest", "PHI"),
        },
        {
          status: "Day-To-Day",
          date: "2026-10-05T12:00Z",
          details: { type: "Ankle", returnDate: "bad" },
          athlete: athlete("3", "Role Ankle", "NY"),
        },
        { status: "Out", athlete: { displayName: "No Id" } },
      ],
    },
  ],
});

assert.equal(entries.length, 3, "rows without an athlete id are dropped");
assert.ok(!JSON.stringify(entries).includes("note text"), "written notes never copied");
assert.equal(entries[0]!.status, "out");
assert.equal(entries[0]!.returnDate, "2027-01-02");
assert.equal(entries[2]!.returnDate, null, "malformed return date is blank, not guessed");

const withPpg = (e: InjuryEntry, ppg: number | null): InjuryEntry => ({ ...e, ppg, ppgSeason: ppg == null ? null : "2025-26" });
const ranked = rankInjuries([withPpg(entries[1]!, 30), withPpg(entries[2]!, 12), withPpg(entries[0]!, 20)]);
assert.deepEqual(ranked.map((e) => e.name), ["Star Out", "Role Ankle", "Star Rest"]);

const unknown = rankInjuries([withPpg(entries[0]!, null), withPpg(entries[2]!, 2)]);
assert.equal(unknown[0]!.name, "Role Ankle", "players without a season line sort last");

console.log("test-injury-report: PASS");
