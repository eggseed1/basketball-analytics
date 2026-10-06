import "server-only";

import { sharedGetOrSet } from "@/data/cache/shared-ttl-cache";
import { isTrustedGoogleSource } from "@/data/providers/insights/analytics-news";
import { pickLeagueMoves, type LeagueMove, type LeagueMoveHeadline } from "@/lib/league-moves";

const FEED_TIMEOUT_MS = 4500;
const CACHE_TTL_MS = 1000 * 60 * 30;
const CACHE_STALE_MS = 1000 * 60 * 60 * 12;

type Feed = { url: string; publication?: string; nbaOnly: boolean; google?: boolean };

const GOOGLE = (q: string) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;

const FEEDS: Feed[] = [
  { url: "https://www.hoopsrumors.com/feed", publication: "Hoops Rumors", nbaOnly: true },
  { url: "https://basketball.realgm.com/rss/wiretap/0/0.xml", publication: "RealGM", nbaOnly: true },
  { url: "https://www.nytimes.com/athletic/rss/nba/", publication: "The Athletic", nbaOnly: true },
  { url: "https://www.espn.com/espn/rss/nba/news", publication: "ESPN", nbaOnly: true },
  { url: "https://sports.yahoo.com/nba/rss.xml", publication: "Yahoo Sports", nbaOnly: true },
  {
    url: GOOGLE(
      'NBA (hires OR hired OR names OR named OR fires OR fired OR "parts ways" OR promotes OR extension) (coach OR "general manager" OR president OR "basketball operations") when:30d'
    ),
    nbaOnly: false,
    google: true,
  },
  {
    url: GOOGLE(
      'NBA ("Board of Governors" OR expansion OR fined OR suspended OR "rule change" OR "NBA Europe" OR "competition committee" OR "sale of") when:30d'
    ),
    nbaOnly: false,
    google: true,
  },
];

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&#8217;|&rsquo;/g, "'")
    .replace(/&#8216;|&lsquo;/g, "'")
    .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"')
    .replace(/&#821[12];|&ndash;|&mdash;/g, "-")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tag(block: string, name: string): string {
  return decode(block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"))?.[1] ?? "");
}

function parseFeed(xml: string, feed: Feed): LeagueMoveHeadline[] {
  const out: LeagueMoveHeadline[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const block = m[1] ?? "";
    let title = tag(block, "title");
    const url = tag(block, "link");
    if (!title || !/^https?:\/\//.test(url)) continue;
    let publication = feed.publication ?? "";
    if (feed.google) {
      const sourceUrl = block.match(/<source[^>]*\burl="([^"]+)"/i)?.[1];
      if (!isTrustedGoogleSource(sourceUrl)) continue;
      publication = tag(block, "source");
      if (publication) title = title.replace(new RegExp(`\\s+[-|]\\s*${publication.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`), "");
      title = title.replace(/\s+-\s+The Athletic\s*$/, "").trim();
    }
    const ms = Date.parse(tag(block, "pubDate"));
    out.push({
      title,
      url,
      publication,
      publishedMs: Number.isNaN(ms) ? null : ms,
      nbaOnly: feed.nbaOnly,
    });
  }
  return out;
}

async function fetchFeed(feed: Feed): Promise<LeagueMoveHeadline[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FEED_TIMEOUT_MS);
  try {
    const res = await fetch(feed.url, {
      signal: ctrl.signal,
      headers: {
        Accept: "application/rss+xml, application/xml, text/xml, */*",
        "User-Agent": "Mozilla/5.0 (compatible; BasketballAnalytics/0.1; +educational news aggregation)",
      },
      next: { revalidate: 60 * 30 },
    } as RequestInit);
    if (!res.ok) return [];
    return parseFeed(await res.text(), feed);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** Recent front office, coaching, ownership and league headlines. */
export async function getLeagueMoves(limit = 6): Promise<LeagueMove[]> {
  return sharedGetOrSet(
    `league-moves:v2:${limit}`,
    { ttlMs: CACHE_TTL_MS, staleMs: CACHE_STALE_MS },
    async () => {
      const headlines = (await Promise.all(FEEDS.map(fetchFeed))).flat();
      if (!headlines.length) throw new Error("league-moves: no feed responded");
      return pickLeagueMoves(headlines, Date.now(), limit);
    }
  );
}
