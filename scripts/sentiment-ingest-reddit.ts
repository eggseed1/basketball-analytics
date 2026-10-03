/**
 * Score post titles from an approved subreddit list via Reddit's official
 * OAuth API (app-only client_credentials) and append ids + scores to
 * data/sentiment/ingest/v1/reddit. Titles are not stored.
 *
 *   REDDIT_CLIENT_ID=... REDDIT_CLIENT_SECRET=... npm run sentiment:ingest:reddit
 *
 * Without credentials the script prints a notice and exits 0.
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
import { appendIngestItems, type RedditIngestItem } from "@/sentiment/ingest-store";

type RedditConfig = {
  listings: { sort: "top" | "hot" | "new"; t?: string; limit: number }[];
  skipTitlePatterns: string[];
  subreddits: { name: string; teamId?: string }[];
};

type RedditPost = {
  id: string;
  title: string;
  selftext?: string;
  permalink: string;
  created_utc: number;
  score: number;
  num_comments: number;
  stickied?: boolean;
  over_18?: boolean;
  removed_by_category?: string | null;
};

const USER_AGENT =
  process.env.REDDIT_USER_AGENT ||
  "web:basketball-analytics-sentiment:1.0 (aggregate tone research)";

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
  const fetchedAt = new Date().toISOString();
  const rows = new Map<string, RedditIngestItem>();

  for (const sub of config.subreddits) {
    let count = 0;
    for (const spec of config.listings) {
      try {
        for (const post of await listing(token, sub.name, spec)) {
          if (post.stickied || post.over_18 || post.removed_by_category) continue;
          if (skip.some((pattern) => pattern.test(post.title))) continue;
          const body = (post.selftext ?? "").slice(0, 280);
          const entities = resolve(`${post.title} ${body}`);
          const teamIds = new Set(resolve(post.title).teamIds);
          if (sub.teamId) teamIds.add(sub.teamId);
          const tone = scoreHeadline(
            post.title,
            body,
            entities.playerIds.map((id) => nameById.get(id)!).filter(Boolean)
          );
          rows.set(post.id, {
            id: post.id,
            subreddit: sub.name,
            permalink: `https://www.reddit.com${post.permalink}`,
            createdAt: new Date(post.created_utc * 1000).toISOString(),
            fetchedAt,
            upvotes: post.score,
            comments: post.num_comments,
            score: tone.score,
            topics: tagHeadlineTopics(post.title, body),
            playerIds: entities.playerIds,
            teamIds: [...teamIds],
            modelVersion: HEADLINE_LEXICON_VERSION,
          });
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

  const all = [...rows.values()];
  const added = appendIngestItems("reddit", all, (row) => row.createdAt);
  console.log(
    `sentiment:ingest:reddit fetched=${all.length} new=${added} mentioningPlayers=${all.filter((r) => r.playerIds.length).length}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
