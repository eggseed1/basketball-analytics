/**
 * Storylines, rating talk, rating tags and tone vs production.
 *   npx tsx scripts/test-sentiment-storylines.ts
 */
import assert from "node:assert/strict";

import type { TrackedPlayerSentimentRow } from "../src/sentiment/curated-types";
import { tagRatingTopics } from "../src/sentiment/headline-lexicon";
import type { ScoredIngestItem } from "../src/sentiment/ingest-aggregate";
import { buildRatingTalk, buildStorylines, type StorylineInput } from "../src/sentiment/storylines";
import { toneVsProduction } from "../src/sentiment/tone-vs-production";

// Rating tags
assert.deepEqual(tagRatingTopics("Is Jalen Duren overrated after the extension?"), ["overrated"]);
assert.deepEqual(tagRatingTopics("The most under-rated wing in the East"), ["underrated"]);
assert.deepEqual(tagRatingTopics("Why everyone slept on this rookie"), ["underrated"]);
assert.deepEqual(tagRatingTopics("Fantasy sleepers, breakouts and busts"), []);
assert.deepEqual(tagRatingTopics("Lakers win in overtime"), []);

// Storylines
const now = new Date("2026-10-07T12:00:00Z");
let seq = 0;
function item(daysAgo: number, topics: string[], playerIds: string[], score = 0.5): ScoredIngestItem {
  seq += 1;
  const date = new Date(now.getTime() - daysAgo * 86_400_000 - 3_600_000).toISOString();
  return { id: `i${seq}`, date, score, topics, playerIds, teamIds: [] };
}

const media: ScoredIngestItem[] = [
  // Previous week: 20 headlines, 2 on contract.
  ...Array.from({ length: 18 }, (_, i) => item(8 + (i % 6), ["general"], [])),
  item(9, ["contract"], ["p1"]),
  item(10, ["contract"], ["p1"]),
  // This week: 10 headlines, 5 on contract.
  item(1, ["contract"], ["p1"], 0.6),
  item(2, ["contract"], ["p1"], 0.2),
  item(3, ["contract", "overrated"], ["p2"], -0.4),
  item(3, ["contract"], ["p2"], -0.2),
  item(4, ["contract"], ["p1"], 0.4),
  ...Array.from({ length: 5 }, () => item(2, ["general"], [])),
];
const fanAll: ScoredIngestItem[] = [
  item(1, ["contract"], ["p1"], 0.9),
  item(1, ["contract"], ["p1"], 0.7),
  item(2, ["contract", "underrated"], ["p3"], 0.5),
  item(2, ["scoring"], ["p1"], 0.1),
];
const names: Record<string, { name: string; teamKey?: string }> = {
  p1: { name: "Player One", teamKey: "1" },
  p2: { name: "Player Two" },
  p3: { name: "Player Three" },
};
const input: StorylineInput = {
  media,
  fanPlayers: fanAll,
  fanAll,
  now,
  windowDays: 7,
  seriesDays: 14,
  name: (id) => names[id],
  headline: (itemId) => ({
    title: `Headline ${itemId}`,
    url: `https://example.com/${itemId}`,
    outlet: "Example",
    publishedAt: media.find((m) => m.id === itemId)!.date,
    score: 0,
  }),
};
const storylines = buildStorylines(input, {
  limit: 5,
  playerLimit: 3,
  minItems: 3,
  toneFloor: 2,
  dailyFloor: { fan: 1, media: 1 },
  priorMediaFloor: 10,
});

assert.deepEqual(
  storylines.map((s) => s.topic),
  ["contract"],
  "general, rating topics and thin topics are not storylines"
);
const contract = storylines[0];
assert.equal(contract.mediaCount, 5);
assert.equal(contract.fanCount, 3);
assert.equal(contract.mediaShare, 0.5);
assert.equal(contract.priorMediaShare, 0.1);
assert.equal(contract.playerCount, 3);
assert.deepEqual(
  contract.players.map((p) => [p.playerId, p.fanCount, p.mediaCount]),
  [
    ["p1", 2, 3],
    ["p2", 0, 2],
    ["p3", 1, 0],
  ]
);
assert.equal(contract.players[2].fanScore, undefined, "one post is under the tone floor");
assert.equal(contract.players[0].headline?.title, `Headline ${media.at(-10)!.id}`, "latest headline");
const days = contract.daily.map((d) => d.date);
assert.equal(days[0] >= "2026-09-24", true);
assert.equal(days.at(-1), "2026-10-06", "trailing days with no data are trimmed");
assert.equal(
  contract.daily.find((d) => d.date === "2026-10-04")?.fan,
  null,
  "a day with no fan posts is blank, not 0"
);

const newestP1 = media.at(-10)!.id;
const skipping = buildStorylines(
  { ...input, headline: (itemId, playerId) => (itemId === newestP1 ? undefined : input.headline(itemId, playerId)) },
  { limit: 5, playerLimit: 3, minItems: 3, toneFloor: 2, dailyFloor: { fan: 1, media: 1 }, priorMediaFloor: 10 }
);
assert.equal(
  skipping[0].players[0].headline?.title,
  `Headline ${media.at(-9)!.id}`,
  "a skipped headline falls back to the next newest"
);

const sparse = buildStorylines(input, {
  limit: 5,
  playerLimit: 3,
  minItems: 3,
  toneFloor: 2,
  dailyFloor: { fan: 1, media: 1 },
  priorMediaFloor: 100,
});
assert.equal(sparse[0].priorMediaShare, null, "too few headlines last week means no comparison");

// Rating talk
const talk = buildRatingTalk(input, { playerLimit: 5, toneFloor: 2 });
assert.equal(talk.overrated.mediaCount, 1);
assert.deepEqual(talk.overrated.players.map((p) => p.playerId), ["p2"]);
assert.equal(talk.underrated.fanCount, 1);
assert.deepEqual(talk.underrated.players.map((p) => p.playerId), ["p3"]);

// Tone vs production
function row(i: number, fanScore: number, drbl100: number, volume = 20): TrackedPlayerSentimentRow {
  return {
    playerId: `t${i}`,
    displayName: `Tracked ${i}`,
    window: "7d",
    fan: {
      score: fanScore,
      mentionVolume: volume,
      polarity: "neutral",
      origin: "fans",
    } as TrackedPlayerSentimentRow["fan"],
    performance: { season: "2025-26", drbl100, possessions: 2000 },
  };
}
const rows = Array.from({ length: 20 }, (_, i) => row(i, i / 20, i));
rows[0] = row(0, 0.99, 0);
rows[19] = row(19, -0.5, 19);
rows.push(row(20, 0.9, 5, 3));
const gaps = toneVsProduction(rows, "fan", { minVolume: 10 });
assert.ok(gaps);
assert.equal(gaps.qualified, 20, "low-volume lanes are left out");
assert.equal(gaps.talkedUp[0].playerId, "t0");
assert.equal(gaps.talkedUp[0].gap, 100);
assert.equal(gaps.overlooked[0].playerId, "t19");
assert.equal(gaps.overlooked[0].gap, -100);
assert.equal(toneVsProduction(rows.slice(0, 10), "fan", { minVolume: 10 }), null, "too few players");
assert.equal(toneVsProduction(rows, "media", { minVolume: 1 }), null, "no media lanes");

console.log("sentiment storylines tests passed");
