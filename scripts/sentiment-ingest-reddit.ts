/**
 * Score post titles from an approved subreddit list via Reddit's official
 * OAuth API (app-only client_credentials) and append one daily average per
 * player, team and the league to data/sentiment/ingest/v1/reddit.
 *
 * Only titles are read. Each run covers posts created in the 24 hours before
 * it. Post ids, links, titles, authors and vote counts stay in memory for
 * the run and are never written anywhere.
 *
 *   REDDIT_CLIENT_ID=... REDDIT_CLIENT_SECRET=... npm run sentiment:ingest:reddit
 *
 * Without credentials the script prints a notice and exits 0. If Reddit
 * access ends, `npm run sentiment:purge:reddit` deletes everything derived
 * from it.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { createHeadlineEntityResolver } from "@/sentiment/headline-entities";
import {
  HEADLINE_LEXICON_VERSION,
  scoreHeadline,
  tagHeadlineTopics,
} from "@/sentiment/headline-lexicon";
import { loadIngestRoster } from "@/sentiment/ingest-roster";
import { appendIngestItems, type RedditDailyItem } from "@/sentiment/ingest-store";

type RedditConfig = {
  listings: { sort: "top" | "hot" | "new"; t?: string; limit: number }[];
  skipTitlePatterns: string[];
  subreddits: { name: string; teamId?: string }[];
};

type RedditPost = {
  id: string;
  title: string;
  created_utc: number;
  stickied?: boolean;
  over_18?: boolean;
  removed_by_category?: string | null;
};

const USER_AGENT =
  process.env.REDDIT_USER_AGENT || "web:drbl-analytics:1.0 (NBA fan sentiment feature)";

const WINDOW_MS = 24 * 60 * 60 * 1000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function appToken(clientId: string, secret: string): Promise<string> {
  const response = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": USER_AGENT,
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`token HTTP ${response.status}`);
  const body = (await response.json()) as { access_token?: string };
  if (!body.access_token) throw new Error("token response had no access_token");
  return body.access_token;
}

async function listing(
  token: string,
  subreddit: string,
  spec: RedditConfig["listings"][number]
): Promise<RedditPost[]> {
  const params = new URLSearchParams({ limit: String(spec.limit), raw_json: "1" });
  if (spec.t) params.set("t", spec.t);
  const response = await fetch(
    `https://oauth.reddit.com/r/${subreddit}/${spec.sort}?${params}`,
    {
      headers: { authorization: `Bearer ${token}`, "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(15_000),
    }
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = (await response.json()) as {
    data?: { children?: { data: RedditPost }[] };
  };
  return (body.data?.children ?? []).map((child) => child.data);
}

type Bucket = { posts: number; scoreSum: number; topicCounts: Record<string, number> };

function addToBucket(buckets: Map<string, Bucket>, key: string, score: number, topics: string[]) {
  const bucket = buckets.get(key) ?? { posts: 0, scoreSum: 0, topicCounts: {} };
  bucket.posts += 1;
  bucket.scoreSum += score;
  for (const topic of topics) bucket.topicCounts[topic] = (bucket.topicCounts[topic] ?? 0) + 1;
  buckets.set(key, bucket);
}

async function main() {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  if (!clientId || !secret) {
    console.log(
      "sentiment:ingest:reddit skipped: set REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET (Reddit app, script type) to enable the fan lane."
    );
    return;
  }

  const config = JSON.parse(
    readFileSync(
      path.join(process.cwd(), "data", "sentiment", "sources", "v1", "reddit.json"),
      "utf8"
    )
  ) as RedditConfig;
  const skip = config.skipTitlePatterns.map((p) => new RegExp(p, "i"));
  const roster = loadIngestRoster();
  const nameById = new Map(roster.map((p) => [p.playerId, p.name]));
  const resolve = createHeadlineEntityResolver(roster);
  const token = await appToken(clientId, secret);
  const runMs = Date.now();
  const date = new Date(runMs).toISOString().slice(0, 10);
  const seen = new Set<string>();
  const buckets = new Map<string, Bucket>();

  for (const sub of config.subreddits) {
    let count = 0;
    for (const spec of config.listings) {
      try {
        for (const post of await listing(token, sub.name, spec)) {
          if (seen.has(post.id)) continue;
          seen.add(post.id);
          if (post.stickied || post.over_18 || post.removed_by_category) continue;
          if (runMs - post.created_utc * 1000 > WINDOW_MS) continue;
          if (skip.some((pattern) => pattern.test(post.title))) continue;
          const entities = resolve(post.title);
          const teamIds = new Set(entities.teamIds);
          if (sub.teamId) teamIds.add(sub.teamId);
          const tone = scoreHeadline(
            post.title,
            "",
            entities.playerIds.map((id) => nameById.get(id)!).filter(Boolean)
          );
          const topics = tagHeadlineTopics(post.title, "");
          addToBucket(buckets, "league|nba", tone.score, topics);
          for (const id of entities.playerIds) addToBucket(buckets, `player|${id}`, tone.score, topics);
          for (const id of teamIds) addToBucket(buckets, `team|${id}`, tone.score, topics);
          count += 1;
        }
      } catch (error) {
        console.warn(`  r/${sub.name} ${spec.sort}: skipped (${(error as Error).message})`);
      }
      // OAuth budget is 100 requests/minute; stay well under it.
      await sleep(1100);
    }
    console.log(`  r/${sub.name}: ${count} posts`);
  }
  seen.clear();

  const rows: RedditDailyItem[] = [...buckets].map(([key, bucket]) => {
    const [scope, entityId] = key.split("|") as [RedditDailyItem["scope"], string];
    return {
      id: `${date}|${scope}|${entityId}`,
      date,
      scope,
      entityId,
      posts: bucket.posts,
      meanScore: Math.round((bucket.scoreSum / bucket.posts) * 1000) / 1000,
      topicCounts: bucket.topicCounts,
      modelVersion: HEADLINE_LEXICON_VERSION,
    };
  });
  const added = appendIngestItems("reddit", rows, (row) => row.date);
  const league = buckets.get("league|nba");
  console.log(
    `sentiment:ingest:reddit date=${date} posts=${league?.posts ?? 0} rows=${rows.length} new=${added} players=${rows.filter((r) => r.scope === "player").length}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
