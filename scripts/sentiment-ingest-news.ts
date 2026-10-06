/**
 * Pull NBA headlines from publisher RSS feeds, score headline + lede tone,
 * resolve player/team mentions, and append to data/sentiment/ingest/v1/news.
 *
 *   npm run sentiment:ingest:news
 *   npm run sentiment:ingest:fan-blogs   (--feeds fan-blogs --store fanblogs)
 *
 * Re-running is safe: rows dedupe by link, so series grow across runs.
 * A feed with a teamId (a team fan blog) tags every item with that team.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { extractReporters } from "@/movement-center/reporters";
import { createHeadlineEntityResolver } from "@/sentiment/headline-entities";
import {
  HEADLINE_LEXICON_VERSION,
  isNbaHeadline,
  scoreHeadline,
  tagHeadlineTopics,
} from "@/sentiment/headline-lexicon";
import { loadIngestRoster } from "@/sentiment/ingest-roster";
import {
  appendIngestItems,
  type IngestSource,
  type NewsIngestItem,
} from "@/sentiment/ingest-store";
import { parseRss } from "@/sentiment/rss";

type FeedConfig = {
  feeds: {
    id: string;
    outlet: string;
    url: string;
    teamId?: string;
    /** Regex for non-editorial items in the feed (ticket promos and the like). */
    skipTitle?: string;
    /** WordPress `?paged=N` depth for feeds that only hold a few hours of posts. */
    pages?: number;
  }[];
};

/** Slow team feeds reach back months; older items fall outside every window. */
const MAX_AGE_DAYS = 35;

function argValue(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1]! : fallback;
}

const USER_AGENT = "basketball-analytics-sentiment/1.0 (+headline tone research)";

function canonicalLink(link: string): string {
  try {
    const url = new URL(link);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|ftag|src|ref)/i.test(key)) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return link;
  }
}

async function fetchFeed(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "user-agent": USER_AGENT, accept: "application/rss+xml, application/xml, text/xml" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function fetchFeedItems(url: string, pages: number) {
  const items = parseRss(await fetchFeed(url));
  const seen = new Set(items.map((item) => item.link));
  for (let page = 2; page <= pages; page++) {
    const next = new URL(url);
    next.searchParams.set("paged", String(page));
    let fresh;
    try {
      fresh = parseRss(await fetchFeed(next.toString())).filter((item) => !seen.has(item.link));
    } catch {
      break;
    }
    if (!fresh.length) break;
    for (const item of fresh) seen.add(item.link);
    items.push(...fresh);
  }
  return items;
}

async function main() {
  const feedsName = argValue("feeds", "news-feeds");
  const store = argValue("store", "news") as IngestSource;
  if (store !== "news" && store !== "fanblogs") throw new Error(`--store ${store} is not a headline store`);
  const config = JSON.parse(
    readFileSync(
      path.join(process.cwd(), "data", "sentiment", "sources", "v1", `${feedsName}.json`),
      "utf8"
    )
  ) as FeedConfig;
  const roster = loadIngestRoster();
  const nameById = new Map(roster.map((p) => [p.playerId, p.name]));
  const resolve = createHeadlineEntityResolver(roster);
  const fetchedAt = new Date().toISOString();
  const oldest = Date.now() - MAX_AGE_DAYS * 86_400_000;
  const rows: NewsIngestItem[] = [];

  for (const feed of config.feeds) {
    try {
      const skip = feed.skipTitle ? new RegExp(feed.skipTitle, "i") : null;
      const items = (await fetchFeedItems(feed.url, feed.pages ?? 1)).filter(
        (item) =>
          !skip?.test(item.title) &&
          (item.publishedAt == null || Date.parse(item.publishedAt) >= oldest)
      );
      for (const item of items) {
        const url = canonicalLink(item.link);
        const lede = item.description.slice(0, 280);
        const reporters = extractReporters(`${item.title} ${item.description}`);
        const inTitle = resolve(item.title);
        const inLede = resolve(lede);
        const playerIds = [...new Set([...inTitle.playerIds, ...inLede.playerIds])];
        const teamIds = feed.teamId
          ? [...new Set([feed.teamId, ...inTitle.teamIds])]
          : inTitle.teamIds;
        const tone = scoreHeadline(
          item.title,
          lede,
          playerIds.map((id) => nameById.get(id)!).filter(Boolean)
        );
        rows.push({
          id: createHash("sha1").update(url).digest("hex").slice(0, 16),
          url,
          title: item.title,
          outlet: feed.outlet,
          feedId: feed.id,
          publishedAt: item.publishedAt ?? fetchedAt,
          fetchedAt,
          score: tone.score,
          hits: tone.hits,
          topics: tagHeadlineTopics(item.title, lede),
          nba: isNbaHeadline(item.title, playerIds.length + teamIds.length > 0),
          playerIds,
          teamIds,
          modelVersion: HEADLINE_LEXICON_VERSION,
          ...(reporters.length ? { reporters } : {}),
        });
      }
      console.log(`  ${feed.id}: ${items.length} items`);
    } catch (error) {
      console.warn(`  ${feed.id}: skipped (${(error as Error).message})`);
    }
  }

  if (process.argv.includes("--dry-run")) {
    for (const row of rows) {
      console.log(
        `${row.nba ? " " : "x"}${row.score.toFixed(2).padStart(5)} [${row.playerIds.join(",")}|${row.teamIds.join(",")}] ${row.title}  {${row.hits.join(" ")}}`
      );
    }
    return;
  }

  const added = appendIngestItems(store, rows, (row) => row.publishedAt);
  const withPlayers = rows.filter((row) => row.playerIds.length).length;
  console.log(
    `sentiment:ingest:${store} fetched=${rows.length} new=${added} mentioningPlayers=${withPlayers}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
