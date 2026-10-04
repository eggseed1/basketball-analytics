/**
 * Score recent public Bluesky posts that match each team query and append
 * hashed ids + scores to data/sentiment/ingest/v1/bluesky. Post text, handles
 * and authors are not stored.
 *
 *   npm run sentiment:ingest:bluesky
 *
 * Logged-out search works today. Set BLUESKY_HANDLE and BLUESKY_APP_PASSWORD
 * (an app password from Bluesky settings) to search as an account instead.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { createHeadlineEntityResolver } from "@/sentiment/headline-entities";
import {
  FAN_LEXICON_VERSION,
  isNbaHeadline,
  scoreFanText,
  tagHeadlineTopics,
} from "@/sentiment/headline-lexicon";
import { loadIngestRoster } from "@/sentiment/ingest-roster";
import { appendIngestItems, type FanPostIngestItem } from "@/sentiment/ingest-store";

import { sampleOutputPath, writeSample } from "./lib/fan-eval-sample";

type BlueskyConfig = {
  limit: number;
  maxPages?: number;
  lookbackHours: number;
  maxHashtags: number;
  queries: { id: string; q: string; teamId?: string; strict?: boolean; exclude?: string[] }[];
};

type BlueskyPost = {
  uri: string;
  author: { labels?: { val: string }[] };
  record: { text?: string; createdAt?: string; langs?: string[] };
  embed?: { $type?: string };
  labels?: { val: string }[];
  likeCount?: number;
};

const PUBLIC_APPVIEW = "https://api.bsky.app/xrpc";
const PDS = "https://bsky.social/xrpc";
const USER_AGENT = "basketball-analytics-sentiment/1.0 (+fan tone research)";
const SKIP_LABELS = new Set(["!no-unauthenticated", "porn", "sexual", "nudity", "graphic-media", "spam"]);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function session(): Promise<{ base: string; token: string | null }> {
  const identifier = process.env.BLUESKY_HANDLE;
  const password = process.env.BLUESKY_APP_PASSWORD;
  if (!identifier || !password) return { base: PUBLIC_APPVIEW, token: null };
  const response = await fetch(`${PDS}/com.atproto.server.createSession`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": USER_AGENT },
    body: JSON.stringify({ identifier, password }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Bluesky login HTTP ${response.status}`);
  const body = (await response.json()) as { accessJwt?: string };
  if (!body.accessJwt) throw new Error("Bluesky login returned no token");
  return { base: PDS, token: body.accessJwt };
}

async function search(
  auth: { base: string; token: string | null },
  q: string,
  limit: number,
  since: string,
  maxPages: number
): Promise<BlueskyPost[]> {
  const posts: BlueskyPost[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < maxPages; page += 1) {
    const params = new URLSearchParams({ q, limit: String(limit), sort: "latest", lang: "en", since });
    if (cursor) params.set("cursor", cursor);
    const response = await fetch(`${auth.base}/app.bsky.feed.searchPosts?${params}`, {
      headers: {
        "user-agent": USER_AGENT,
        ...(auth.token ? { authorization: `Bearer ${auth.token}` } : {}),
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      if (page > 0) break;
      throw new Error(`HTTP ${response.status}`);
    }
    const body = (await response.json()) as { posts?: BlueskyPost[]; cursor?: string };
    posts.push(...(body.posts ?? []));
    cursor = body.cursor;
    if (!cursor || (body.posts?.length ?? 0) < limit) break;
    await sleep(300);
  }
  return posts;
}

/**
 * Team nicknames are also birds, dinosaurs and chicken nuggets, so a post
 * counts only with basketball context: a named player, two teams, or game talk.
 */
const BASKETBALL_CONTEXT =
  /\b(nba|basketball|hoops?|game|games|season|playoffs?|preseason|camp|coach\w*|roster|rotation|trade[ds]?|waive[ds]?|signs?|signed|draft\w*|rookies?|minutes|points|pts|rebounds?|assists?|dunk\w*|threes?|bench|starters?|starting|wins?|won|loss(es)?|lose|lost|beat|series|finals|ecf|wcf|mvp|all-star|contract|extension|apron|front office|gm|lineup|injur\w*|ankle|knee|hamstring)\b/i;

/** For nicknames that are everyday words, "game" or "season" is not enough. */
const STRONG_BASKETBALL_CONTEXT =
  /\b(nba|basketball|hoops?|preseason|playoffs?|coach\w*|roster|rotation|trade[ds]?|waive[ds]?|draft\w*|rookies?|rebounds?|assists?|dunk\w*|bench|lineup|front office|gm|mvp|all-star|apron|contract|extension|ecf|wcf|finals|training camp|media day|free agen\w*)\b/i;

function hasBasketballContext(
  text: string,
  playerCount: number,
  teamCount: number,
  strict: boolean
): boolean {
  if (playerCount > 0 || teamCount >= 2) return true;
  return (strict ? STRONG_BASKETBALL_CONTEXT : BASKETBALL_CONTEXT).test(text);
}

/** Link shares are mostly news reposts and trend bots, not fan voice. */
function isFanVoice(post: BlueskyPost, text: string, maxHashtags: number): boolean {
  const labels = [...(post.labels ?? []), ...(post.author.labels ?? [])];
  if (labels.some((label) => SKIP_LABELS.has(label.val))) return false;
  if (post.embed?.$type?.startsWith("app.bsky.embed.external")) return false;
  if (/https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|co)\//i.test(text)) return false;
  if ((text.match(/#\w+/g) ?? []).length > maxHashtags) return false;
  return text.trim().length >= 12;
}

async function main() {
  const config = JSON.parse(
    readFileSync(path.join(process.cwd(), "data", "sentiment", "sources", "v1", "bluesky.json"), "utf8")
  ) as BlueskyConfig;
  const roster = loadIngestRoster();
  const nameById = new Map(roster.map((p) => [p.playerId, p.name]));
  const resolve = createHeadlineEntityResolver(roster);
  const auth = await session().catch((error: Error) => {
    console.warn(`  Bluesky login failed (${error.message}), searching logged out`);
    return { base: PUBLIC_APPVIEW, token: null };
  });
  console.log(`  auth=${auth.token ? "account" : "public"}`);
  const fetchedAt = new Date().toISOString();
  const since = new Date(Date.now() - config.lookbackHours * 3_600_000).toISOString();
  const rows = new Map<string, FanPostIngestItem>();
  const samplePath = sampleOutputPath();
  const sampleText = new Map<string, string>();
  const dryRun = process.argv.includes("--dry-run") || samplePath !== null;
  let failures = 0;

  for (const query of config.queries) {
    let kept = 0;
    const exclude = (query.exclude ?? []).map((p) => new RegExp(p, "i"));
    try {
      const posts = await search(auth, query.q, config.limit, since, config.maxPages ?? 1);
      for (const post of posts) {
        const text = (post.record.text ?? "").slice(0, 300);
        if (!isFanVoice(post, text, config.maxHashtags)) continue;
        if (exclude.some((pattern) => pattern.test(text))) continue;
        const entities = resolve(text);
        if (!hasBasketballContext(text, entities.playerIds.length, entities.teamIds.length, Boolean(query.strict))) continue;
        if (!isNbaHeadline(text, true)) continue;
        const createdAt = post.record.createdAt ? new Date(post.record.createdAt) : null;
        if (!createdAt || Number.isNaN(createdAt.getTime())) continue;
        const id = createHash("sha1").update(post.uri).digest("hex").slice(0, 16);
        const prior = rows.get(id);
        const teamIds = new Set([...(prior?.teamIds ?? []), ...(query.teamId ? [query.teamId] : entities.teamIds)]);
        const tone = scoreFanText(
          text,
          entities.playerIds.map((pid) => nameById.get(pid)!).filter(Boolean)
        );
        rows.set(id, {
          id,
          platform: "bluesky",
          source: prior?.source ?? query.id,
          createdAt: createdAt.toISOString(),
          fetchedAt,
          likes: post.likeCount ?? 0,
          score: tone.score,
          topics: tagHeadlineTopics(text),
          playerIds: entities.playerIds,
          teamIds: [...teamIds],
          modelVersion: FAN_LEXICON_VERSION,
        });
        kept += 1;
        if (samplePath) sampleText.set(id, text);
        if (dryRun && !samplePath && kept <= 3) {
          console.log(`    ${tone.score.toFixed(2).padStart(5)} ${text.replace(/\s+/g, " ").slice(0, 110)}`);
        }
      }
      console.log(`  ${query.id}: ${posts.length} posts, kept ${kept}`);
    } catch (error) {
      failures += 1;
      console.warn(`  ${query.id}: skipped (${(error as Error).message})`);
    }
    await sleep(400);
  }

  if (failures === config.queries.length) throw new Error("every Bluesky query failed");
  const all = [...rows.values()];
  if (samplePath) writeSample(samplePath, all, sampleText, nameById);
  if (dryRun) {
    console.log(`sentiment:ingest:bluesky dry run kept=${all.length}`);
    return;
  }
  const added = appendIngestItems("bluesky", all, (row) => row.createdAt);
  console.log(
    `sentiment:ingest:bluesky kept=${all.length} new=${added} mentioningPlayers=${all.filter((r) => r.playerIds.length).length}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
