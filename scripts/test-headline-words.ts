/**
 * Sentiment word clouds: real headline words, minus function words, the
 * player's own name and his team's nicknames.
 *   npx tsx scripts/test-headline-words.ts
 */
import assert from "node:assert/strict";

import { headlineWordCloud, headlineWords, ownWords } from "../src/sentiment/headline-words";

const tatum = ownWords("Jayson Tatum", "2");
assert.deepEqual(
  headlineWords("Mike Conley Jr. raves about Jayson Tatum's leadership for Celtics", tatum),
  ["mike", "conley", "raves", "leadership"]
);

const embiid = ownWords("Joel Embiid", "20");
assert.deepEqual(headlineWords("76ers win 120-97 as Embiid’s knee holds up", embiid), [
  "win",
  "knee",
  "holds",
]);
assert.deepEqual(headlineWords("Bulls vs 76ers: what the Sixers said", ownWords("Coby White", "4")), [
  "76ers",
  "sixers",
]);

assert.deepEqual(headlineWords("Luka Dončić lifts Lakers", ownWords("Luka Doncic", "13")), ["lifts"]);

const cloud = headlineWordCloud(
  [
    { title: "Hukporti suffers non-contact injury", date: "2026-10-05T01:00:00Z" },
    { title: "Hukporti noncontact injury looks scary", date: "2026-10-06T01:00:00Z" },
    { title: "Hukporti injury update", date: "2026-10-06T02:00:00Z" },
  ],
  ownWords("Ariel Hukporti", "20")
);
assert.ok(cloud);
assert.equal(cloud.headlines, 3);
assert.deepEqual(cloud.words.slice(0, 2), [
  ["injury", 3],
  ["non-contact", 2],
]);

assert.equal(headlineWordCloud([], new Set()), undefined);
assert.equal(headlineWordCloud([{ title: "The and as", date: "2026-10-06" }], new Set()), undefined);

console.log("headline-words: ok");
