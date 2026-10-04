/**
 * Sentiment ingest: headline scorer, entity resolution, RSS parsing, lane
 * floors, and snapshot honesty rules.
 * Run: npx tsx scripts/test-sentiment-ingest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { createHeadlineEntityResolver } from "../src/sentiment/headline-entities";
import { isNbaHeadline, scoreHeadline, tagHeadlineTopics } from "../src/sentiment/headline-lexicon";
import { parseHeadlineTone } from "../src/sentiment/headline-model";
import {
  buildIngestLane,
  groupByEntity,
  type ScoredIngestItem,
} from "../src/sentiment/ingest-aggregate";
import { parseRss } from "../src/sentiment/rss";
import type { SentimentCuratedSnapshot } from "../src/sentiment/curated-types";

function testLexicon() {
  assert.ok(scoreHeadline("Hornets Waive Rob Dillingham", "", ["Rob Dillingham"]).score < 0);
  assert.ok(scoreHeadline("Stephen Curry, Warriors agree to $116M extension").score > 0);
  assert.ok(scoreHeadline("Star guard suffers torn ACL, out for season").score < 0);
  // Negation flips valence.
  assert.ok(scoreHeadline("Coach is not happy with effort").score < 0);
  // Game vocabulary carries no tone.
  assert.equal(scoreHeadline("He shot, blocked and stole").score, 0);
  assert.ok(scoreHeadline("Chet Holmgren gets laughed at over his measurements", "", ["Chet Holmgren"]).score < 0);
  assert.ok(scoreHeadline("Knicks and guard 'not close' in talks").score < 0);
  assert.equal(scoreHeadline("Exclusive: Heat star talks camp").score, 0);
  // Masked names do not score ("Rob" alone would be −2 in AFINN).
  assert.deepEqual(scoreHeadline("Rob Dillingham", "", ["Rob Dillingham"]).hits, []);
  const tone = scoreHeadline("Great great great amazing win");
  assert.ok(tone.score <= 1 && tone.score >= -1);

  assert.ok(tagHeadlineTopics("Kessler out with ankle sprain").includes("availability"));
  assert.ok(tagHeadlineTopics("Knicks, Towns extension talks stall").includes("extension"));
  assert.deepEqual(tagHeadlineTopics("Media day notes"), ["training_camp"]);
  assert.deepEqual(tagHeadlineTopics("A quiet afternoon"), ["general"]);

  assert.equal(isNbaHeadline("Panic level for Giants, Bears amid QB injuries", false), false);
  assert.equal(isNbaHeadline("NBA closing in on Las Vegas franchise", false), true);
  assert.equal(isNbaHeadline("A headline naming nobody", false), false);
}

function testEntities() {
  const resolve = createHeadlineEntityResolver([
    { playerId: "1", name: "Luka Dončić", teamId: "13" },
    { playerId: "2", name: "Walker Kessler", teamId: "13" },
    { playerId: "3", name: "Draymond Green", teamId: "9" },
    { playerId: "4", name: "Jalen Green", teamId: "21" },
    { playerId: "5", name: "Trae Young", teamId: "1" },
    { playerId: "6", name: "Jaren Jackson Jr.", teamId: "29" },
    { playerId: "7", name: "Shai Gilgeous-Alexander", teamId: "25" },
    { playerId: "8", name: "Trey Alexander", teamId: "24" },
  ]);
  assert.deepEqual(resolve("Gilgeous-Alexander drops 40").playerIds, ["7"]);
  assert.deepEqual(resolve("Alexander makes the roster").playerIds, ["8"]);
  assert.deepEqual(resolve("Kessler-for-Gobert swap").playerIds, ["2"]);
  assert.deepEqual(resolve("Knicks-Celtics rematch").teamIds.sort(), ["18", "2"]);
  assert.deepEqual(resolve("Luka Doncic drops 40").playerIds, ["1"]);
  assert.deepEqual(resolve("Luka Dončić drops 40").playerIds, ["1"]);
  assert.deepEqual(resolve("Kessler talks up Lakers defense").playerIds, ["2"]);
  // Shared surname and everyday-word surname never resolve alone.
  assert.deepEqual(resolve("Green scores 20").playerIds, []);
  assert.deepEqual(resolve("Young core shows promise").playerIds, []);
  assert.deepEqual(resolve("Draymond Green ejected").playerIds, ["3"]);
  assert.deepEqual(resolve("Jaren Jackson Jr. returns").playerIds, ["6"]);
  assert.deepEqual(resolve("SGA pushes for MVP").playerIds, ["7"]);
  assert.deepEqual(resolve("Lakers beat Celtics").teamIds.sort(), ["13", "2"]);
  assert.deepEqual(resolve("Magic Johnson remembers Lakers").teamIds, ["13"]);
  assert.deepEqual(resolve("Heat check: who is hot").teamIds, []);
  assert.deepEqual(resolve("Heat sign guard").teamIds, ["14"]);
  assert.deepEqual(resolve("Sixers and Blazers talk trade").teamIds.sort(), ["20", "22"]);
}

function testRss() {
  const xml = `<?xml version="1.0"?><rss><channel>
    <item><title><![CDATA[Jokić &amp; Nuggets agree]]></title><link>https://x.test/a?utm_source=rss</link>
      <description><![CDATA[<p>He will <b>re-sign</b>.</p>]]></description><pubDate>Tue, 29 Sep 2026 18:00:00 GMT</pubDate></item>
    <item><title>Knicks &#8217;still undecided&#8217;</title><link>https://x.test/b</link></item>
    <item><title></title><link>https://x.test/c</link></item>
  </channel></rss>`;
  const items = parseRss(xml);
  assert.equal(items.length, 2);
  assert.equal(items[0]!.title, "Jokić & Nuggets agree");
  assert.equal(items[0]!.description, "He will re-sign .");
  assert.equal(items[0]!.publishedAt, "2026-09-29T18:00:00.000Z");
  assert.equal(items[1]!.title, "Knicks ’still undecided’");
  assert.equal(items[1]!.publishedAt, null);
}

function testLanes() {
  const now = new Date("2026-09-30T12:00:00Z");
  const item = (daysAgo: number, score: number, topics = ["contract"]): ScoredIngestItem => ({
    id: `${daysAgo}-${score}`,
    date: new Date(now.getTime() - daysAgo * 86_400_000).toISOString(),
    score,
    topics,
    playerIds: ["1"],
    teamIds: [],
  });
  const opts = {
    origin: "headlines" as const,
    platform: "news" as const,
    modelVersion: "t",
    now,
    windowDays: 7,
    seriesDays: 30,
    floor: 3,
  };
  // Below the floor: no lane at all (blank, not neutral).
  assert.equal(buildIngestLane([item(1, 0.5), item(2, 0.5)], opts), null);

  const thin = buildIngestLane([item(1, 0.5), item(2, 0.3), item(3, 0.1)], opts)!;
  assert.equal(thin.lane.mentionVolume, 3);
  assert.equal(thin.lane.score, 0.3);
  assert.equal(thin.lane.priorScore, null, "no prior window means unknown trend");
  assert.equal(thin.lane.origin, "headlines");
  assert.equal(thin.lane.asOf, "2026-09-29");

  const rising = buildIngestLane(
    [item(1, 0.6), item(2, 0.5), item(3, 0.4), item(8, -0.2), item(9, -0.1), item(10, 0)],
    opts
  )!;
  assert.equal(rising.lane.priorScore, -0.1);
  assert.equal(rising.lane.direction, "rising");
  assert.equal(rising.series.length, 6);
  assert.ok(rising.series.every((p) => p.count === 1));

  // A model rating replaces the headline score only in that player's lane.
  const shared: ScoredIngestItem = {
    ...item(1, 0.4),
    playerIds: ["1", "2"],
    teamIds: ["13"],
    playerScores: { "1": -1 },
  };
  const byPlayer = groupByEntity([shared], "playerIds");
  assert.equal(byPlayer.get("1")![0]!.score, -1);
  assert.equal(byPlayer.get("2")![0]!.score, 0.4);
  assert.equal(groupByEntity([shared], "teamIds").get("13")![0]!.score, 0.4);
}

function testHeadlineModel() {
  assert.equal(parseHeadlineTone("1"), 1);
  assert.equal(parseHeadlineTone(" -1\n"), -1);
  assert.equal(parseHeadlineTone("0\n\nDeni Avdija is mentioned"), 0);
  assert.equal(parseHeadlineTone("10"), null);
  assert.equal(parseHeadlineTone("0.5"), null);
  assert.equal(parseHeadlineTone(""), null);
}

function testSnapshot() {
  const snapshot = JSON.parse(
    readFileSync(path.join(process.cwd(), "src", "data", "runtime", "sentiment-snapshot.json"), "utf8")
  ) as SentimentCuratedSnapshot;
  const floor = snapshot.meta.sources?.headlines.floor ?? 3;
  for (const profile of [...snapshot.players, ...(snapshot.teams ?? [])]) {
    assert.ok(profile.fan || profile.media, "every profile keeps at least one lane");
    for (const lane of [profile.fan, profile.media]) {
      if (!lane) continue;
      assert.ok(lane.origin, "every lane is tagged with its origin");
      if (lane.origin === "headlines") assert.ok(lane.mentionVolume >= floor);
    }
    if (profile.fan && profile.fan.origin !== "curated") assert.equal(profile.fan.origin, "fans");
    if (profile.media && profile.media.origin !== "curated") assert.equal(profile.media.origin, "headlines");
  }
  for (const row of snapshot.meta.divergences?.rows ?? []) {
    const profile = snapshot.players.find((p) => p.playerIds.includes(row.playerId))!;
    assert.equal(
      profile.fan!.origin === "curated",
      profile.media!.origin === "curated",
      `${row.displayName}: divergence must not mix curated and measured lanes`
    );
  }
  for (const player of snapshot.players) {
    if (player.provenance === "ingest") {
      assert.ok(player.fan == null || player.fan.origin === "fans", "ingest-only players get no curated fan lane");
    }
  }
  const disclaimer = snapshot.meta.disclaimer;
  assert.ok(!/—/.test(disclaimer), "disclaimer avoids em dashes");
}

testLexicon();
testEntities();
testRss();
testLanes();
testHeadlineModel();
testSnapshot();
console.log("test-sentiment-ingest: ok");
