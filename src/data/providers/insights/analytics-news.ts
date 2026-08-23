/**
 * Analytics desk feeds - prefer publisher RSS (real bylines) over Google News.
 * Only recent pieces with analytical footing make the board; one outlet per slot.
 */

export type AnalyticsArticle = {
  id: string;
  title: string;
  url: string;
  /** Outlet / publication - primary credit. */
  publication: string;
  /** Journalist byline when available. */
  author?: string;
  publishedAt?: string;
  summary?: string;
};

type FeedDef = {
  publication: string;
  url: string;
  /**
   * Soft title filter for general/news outlets.
   * Pure analytics shops leave this empty and still pass via trust + scoring.
   */
  keywords?: string[];
  /** Outlet is analytics-native - lower bar if recent. */
  analyticsNative?: boolean;
};

type InternalArticle = AnalyticsArticle & {
  publishedMs: number | null;
  analyticsScore: number;
};

const MAX_AGE_DAYS_GENERAL = 45;
const MAX_AGE_DAYS_NATIVE = 120;
const MAX_AGE_DAYS_FILL = 90;
const PREFER_AGE_DAYS = 21;
/** Soft window for “this week” rotation on the homepage desk. */
const FRESH_WEEK_DAYS = 7;
const FRESH_FORTNIGHT_DAYS = 14;
const DESK_DEFAULT_LIMIT = 6;
/** Max pieces from one outlet inside the fresh-week band. */
const MAX_PER_OUTLET_FRESH = 2;
const MAX_PER_OUTLET_DEFAULT = 1;

const PUBLISHER_FEEDS: FeedDef[] = [
  {
    publication: "No Ceilings",
    url: "https://www.noceilingsnba.com/feed",
    analyticsNative: true,
    keywords: [
      "analytics",
      "advanced",
      "model",
      "projection",
      "draft",
      "prospect",
      "scouting",
      "measurement",
      "efficiency",
      "usage",
      "impact",
      "shooting",
      "creation",
      "defense",
      "rim",
      "three",
      "playmaking",
    ],
  },
  {
    publication: "BBall Index",
    url: "https://www.bball-index.com/feed",
    analyticsNative: true,
  },
  {
    publication: "Inpredictable",
    url: "https://www.inpredictable.com/feeds/posts/default?alt=rss",
    analyticsNative: true,
  },
  {
    publication: "Cleaning the Glass",
    url: "https://cleaningtheglass.com/feed/",
    analyticsNative: true,
  },
  {
    publication: "Thinking Basketball",
    url: "https://www.thinkingbasketball.net/feed",
    analyticsNative: true,
  },
  {
    publication: "NBAstuffer",
    url: "https://www.nbastuffer.com/feed/",
    analyticsNative: true,
    keywords: [
      "analytics",
      "pace",
      "efficiency",
      "rating",
      "rest",
      "schedule",
      "four factors",
      "true shooting",
      "usage",
      "advanced",
    ],
  },
  {
    publication: "CBS Sports",
    url: "https://www.cbssports.com/rss/headlines/nba/",
    keywords: [
      "analytics",
      "advanced stats",
      "advanced numbers",
      "efficiency",
      "true shooting",
      "net rating",
      "darko",
      "raptor",
      "plus-minus",
      "on/off",
      "model",
      "projection",
      "player impact",
    ],
  },
];

const GOOGLE_FEEDS = [
  "https://news.google.com/rss/search?q=NBA+(analytics+OR+%22advanced+stats%22+OR+%22true+shooting%22+OR+%22net+rating%22+OR+RAPM+OR+%22plus-minus%22)&hl=en-US&gl=US&ceid=US:en",
  "https://news.google.com/rss/search?q=NBA+(DARKO+OR+EPM+OR+PIPM+OR+%22on/off%22+OR+%22four+factors%22+OR+%22player+impact%22)&hl=en-US&gl=US&ceid=US:en",
  "https://news.google.com/rss/search?q=NBA+(%22Cleaning+the+Glass%22+OR+%22BBall+Index%22+OR+%22Thinking+Basketball%22+OR+%22draft+model%22+OR+%22shot+quality%22)&hl=en-US&gl=US&ceid=US:en",
];

/** Phrases that signal analytical footing (title + summary). */
const ANALYTICS_SIGNALS: Array<{ re: RegExp; weight: number }> = [
  // Metric names - avoid Darko Rajakovic / Toronto Raptors false hits.
  { re: /\bDARKO\b/, weight: 5 },
  { re: /\bdarko\s+(rating|model|projection|dpm)\b/i, weight: 5 },
  { re: /\bRAPTOR\b/, weight: 5 },
  { re: /\braptor\s+(rating|metric|score)\b/i, weight: 5 },
  { re: /\bLEBRON\b/, weight: 5 },
  { re: /\blebron\s+(metric|rating|score|rapm)\b/i, weight: 5 },
  { re: /\brapm\b/i, weight: 5 },
  { re: /\bepm\b/i, weight: 5 },
  { re: /\bpipm\b/i, weight: 4 },
  { re: /\bbpm\b/i, weight: 3 },
  { re: /\bvorp\b/i, weight: 3 },
  { re: /\btrue shooting\b|\bts%\b/i, weight: 4 },
  { re: /\bnet rating\b|\boffensive rating\b|\bdefensive rating\b/i, weight: 4 },
  { re: /\bplus[-\s]?minus\b|\bon\/off\b|\bbox plus\b/i, weight: 4 },
  { re: /\busage\b|\busg%?\b/i, weight: 3 },
  { re: /\befficiency\b|\bfour factors\b/i, weight: 3 },
  { re: /\banalytics?\b|\badvanced stats?\b|\badvanced numbers?\b|\bby the numbers\b/i, weight: 4 },
  { re: /\bmodel\b|\bprojection\b|\bexpected\b|\bestimat(?:e|ed|ion)\b|\belo\b/i, weight: 3 },
  { re: /\bwin probability\b|\bclutch player\b/i, weight: 3 },
  { re: /\bpace\b|\bper 100\b|\bpossession|\brest days?\b/i, weight: 2 },
  { re: /\bshot quality\b|\blineup\b|\brim frequency\b|\bnon-rim\b|\bshot making\b/i, weight: 3 },
  { re: /\bimpact\b|\bvalue over\b|\bmarginal\b|\bdefensive playmaking\b/i, weight: 2 },
  { re: /\bstat guide|\bfilm study\b/i, weight: 3 },
  { re: /\bscouting\b|\bprospect\b|\bdraft model\b|\bmeasurement/i, weight: 2 },
];

const NON_ANALYTICS_PENALTIES: Array<{ re: RegExp; weight: number }> = [
  { re: /\brumor\b|\btrade deadline gossip\b|\binsider says\b/i, weight: 3 },
  { re: /\bpower ranking\b|\bmock draft\b(?!.*model)/i, weight: 2 },
  { re: /\bhighlights?\b|\brecap\b|\bbox score\b/i, weight: 2 },
  { re: /\binjury report\b|\bgame preview\b|\bopening night odds\b|\bodds\b|\bbetting\b|\bdaily fantasy\b/i, weight: 4 },
  { re: /\bdarko rajakovic\b|\bretire(?:s|d|ment)\b|\battends?\b|\bone-day contract\b/i, weight: 4 },
];

const NATIVE_OUTLETS =
  /bball index|cleaning the glass|inpredictable|nbastuffer|no ceilings|nylon calculus|thinking basketball|truehoop|silver bulletin|neilpaine/i;

/** Collapse Google/Substack aliases onto one outlet key. */
function canonicalPublication(raw: string): string {
  const cleaned = raw
    .replace(/\s*[|/-]\s*substack\s*$/i, "")
    .replace(/\s+on\s+substack\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const lower = cleaned.toLowerCase();
  if (/no ceilings/.test(lower)) return "No Ceilings";
  if (/bball index|basketball index/.test(lower)) return "BBall Index";
  if (/cleaning the glass/.test(lower)) return "Cleaning the Glass";
  if (/inpredictable/.test(lower)) return "Inpredictable";
  if (/nbastuffer|nba stuffer/.test(lower)) return "NBAstuffer";
  if (/nylon calculus/.test(lower)) return "Nylon Calculus";
  if (/thinking basketball/.test(lower)) return "Thinking Basketball";
  if (/truehoop/.test(lower)) return "TrueHoop";
  if (/silver bulletin/.test(lower)) return "Silver Bulletin";
  if (/neilpaine|neil paine/.test(lower)) return "Neil Paine";
  if (/the ringer/.test(lower)) return "The Ringer";
  if (/hoopshype/.test(lower)) return "HoopsHype";
  if (/dnvr/.test(lower)) return "DNVR";
  if (/new york times|nytimes/.test(lower)) return "The New York Times";
  if (/cbs sports/.test(lower)) return "CBS Sports";
  if (/the athletic/.test(lower)) return "The Athletic";
  if (/espn/.test(lower)) return "ESPN";
  return cleaned;
}

function stripTags(html: string): string {
  return html
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#039;/g, "'")
    .replace(/&#8217;/g, "'")
    .replace(/&#8211;/g, "-")
    .replace(/&#8212;/g, "-")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tagContent(block: string, tag: string): string {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i");
  return stripTags(block.match(re)?.[1] ?? "");
}

function parsePublishedMs(raw?: string): number | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.getTime();
}

function formatPubDate(ms: number | null, raw?: string): string | undefined {
  if (ms != null) {
    return new Date(ms).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
  if (!raw) return undefined;
  return raw;
}

function looksLikePersonName(name: string): boolean {
  const n = name.trim();
  if (n.length < 3 || n.length > 70) return false;
  if (
    /^(espn|staff|editor|admin|noreply|http|www\.|nbastuffer|basketball immersion|the athletic|reuters|ap news)/i.test(
      n
    )
  ) {
    return false;
  }
  if (/@/.test(n) && !/\([A-Z]/.test(n)) return false;
  return /[A-Za-z]/.test(n);
}

function cleanAuthor(raw: string): string | undefined {
  let n = raw.trim();
  const paren = n.match(/\(([^)]+)\)\s*$/);
  if (paren && looksLikePersonName(paren[1]!)) n = paren[1]!;
  n = n.replace(/^by\s+/i, "").replace(/\s+/g, " ").trim();
  if (!looksLikePersonName(n)) return undefined;
  const parts = n.split(/\s+/);
  if (parts.length === 1 && parts[0]!.length < 5) return undefined;
  return n;
}

function matchesKeywords(title: string, keywords?: string[]): boolean {
  if (!keywords?.length) return true;
  const t = title.toLowerCase();
  return keywords.some((k) => t.includes(k.toLowerCase()));
}

function analyticsScore(
  title: string,
  summary: string | undefined,
  publication: string,
  analyticsNative?: boolean
): number {
  const text = `${title} ${summary ?? ""}`;
  let score = analyticsNative ? 2 : 0;
  for (const { re, weight } of ANALYTICS_SIGNALS) {
    if (re.test(text)) score += weight;
  }
  // Coach Darko / team Raptors are not the metrics.
  if (/rajakovic/i.test(text)) {
    score -= 5;
  }
  if (/\braptors\b/i.test(text) && !/\braptor\s+(rating|metric|score)\b/i.test(text) && !/\bRAPTOR\b/.test(text)) {
    // no-op: RAPTOR metric already requires careful patterns
  }
  for (const { re, weight } of NON_ANALYTICS_PENALTIES) {
    if (re.test(text)) score -= weight;
  }
  if (NATIVE_OUTLETS.test(publication)) score += 1;
  return score;
}

function ageDays(ms: number | null, now: number): number | null {
  if (ms == null) return null;
  return (now - ms) / (1000 * 60 * 60 * 24);
}

function isNativeOutlet(publication: string): boolean {
  return NATIVE_OUTLETS.test(publication);
}

/** Recent + analytical enough to showcase. */
function passesDeskBar(
  article: InternalArticle,
  now: number,
  tier: "strict" | "fill" = "strict"
): boolean {
  const age = ageDays(article.publishedMs, now);
  const native = isNativeOutlet(article.publication);

  if (age != null && age < 0) return false;
  // Hard reject junk even on fill pass.
  if (article.analyticsScore < 2) return false;

  if (tier === "fill") {
    if (age == null) return native && article.analyticsScore >= 4;
    if (native) {
      return age <= MAX_AGE_DAYS_NATIVE && article.analyticsScore >= 2;
    }
    return age <= MAX_AGE_DAYS_FILL && article.analyticsScore >= 4;
  }

  const maxAge = native ? MAX_AGE_DAYS_NATIVE : MAX_AGE_DAYS_GENERAL;
  if (age == null) return native && article.analyticsScore >= 5;
  if (age > maxAge) return false;

  if (native) {
    if (age <= PREFER_AGE_DAYS) return article.analyticsScore >= 2;
    return article.analyticsScore >= 3;
  }

  return article.analyticsScore >= 6;
}

function pickDeskArticles(
  ranked: InternalArticle[],
  limit: number,
  now: number
): InternalArticle[] {
  const picked: InternalArticle[] = [];
  const pubCounts = new Map<string, number>();

  const take = (article: InternalArticle, maxPerOutlet: number) => {
    if (picked.length >= limit) return false;
    const pubKey = article.publication.trim().toLowerCase();
    const count = pubCounts.get(pubKey) ?? 0;
    if (count >= maxPerOutlet) return false;
    if (
      picked.some(
        (p) =>
          p.id === article.id || titlesOverlap(p.title, article.title)
      )
    ) {
      return false;
    }
    pubCounts.set(pubKey, count + 1);
    picked.push(article);
    return true;
  };

  // 1) This week first — allow a second piece from the same outlet.
  for (const article of ranked) {
    const age = ageDays(article.publishedMs, now);
    if (age == null || age > FRESH_WEEK_DAYS) continue;
    take(article, MAX_PER_OUTLET_FRESH);
  }

  // 2) Last fortnight — still prefer freshness.
  for (const article of ranked) {
    if (picked.length >= limit) break;
    const age = ageDays(article.publishedMs, now);
    if (age == null || age > FRESH_FORTNIGHT_DAYS) continue;
    take(article, MAX_PER_OUTLET_DEFAULT);
  }

  // 3) Fill remaining slots uniquely.
  for (const article of ranked) {
    if (picked.length >= limit) break;
    take(article, MAX_PER_OUTLET_DEFAULT);
  }

  return picked;
}

function pickUniqueOutlets(
  ranked: InternalArticle[],
  limit: number,
  seenPubs: Set<string>
): InternalArticle[] {
  const picked: InternalArticle[] = [];
  for (const article of ranked) {
    const pubKey = article.publication.trim().toLowerCase();
    if (seenPubs.has(pubKey)) continue;
    seenPubs.add(pubKey);
    picked.push(article);
    if (picked.length >= limit) break;
  }
  return picked;
}

function compareDeskArticles(a: InternalArticle, b: InternalArticle): number {
  const now = Date.now();
  const ageA = ageDays(a.publishedMs, now) ?? 999;
  const ageB = ageDays(b.publishedMs, now) ?? 999;
  // Prefer fresher first, then stronger analytics, then byline.
  if (ageA !== ageB) return ageA - ageB;
  if (b.analyticsScore !== a.analyticsScore) {
    return b.analyticsScore - a.analyticsScore;
  }
  const authorA = a.author ? 1 : 0;
  const authorB = b.author ? 1 : 0;
  return authorB - authorA;
}

function parseXmlItems(xml: string): string[] {
  const blocks: string[] = [];
  const re = /<(?:item|entry)>([\s\S]*?)<\/(?:item|entry)>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null && blocks.length < 20) {
    blocks.push(m[1] ?? "");
  }
  return blocks;
}

function parsePublisherItem(
  block: string,
  feed: FeedDef
): InternalArticle | null {
  const title = tagContent(block, "title");
  const link =
    stripTags(block.match(/<link>([\s\S]*?)<\/link>/i)?.[1] ?? "") ||
    block.match(/<link[^>]*href="([^"]+)"/i)?.[1] ||
    "";
  if (!title || !link) return null;

  const creator =
    tagContent(block, "dc:creator") ||
    tagContent(block, "creator") ||
    (() => {
      const authorBlock = block.match(/<author>([\s\S]*?)<\/author>/i)?.[1] ?? "";
      return tagContent(authorBlock, "name") || stripTags(authorBlock);
    })();

  const author = creator ? cleanAuthor(creator) : undefined;
  const pubRaw =
    tagContent(block, "pubDate") ||
    tagContent(block, "published") ||
    tagContent(block, "updated");
  const publishedMs = parsePublishedMs(pubRaw);
  const desc = tagContent(block, "description") || tagContent(block, "summary");
  const summary = desc ? desc.slice(0, 220) : undefined;

  return {
    id: `${feed.publication}-${link.slice(-48)}`,
    title,
    url: link.replace(/&amp;/g, "&"),
    publication: canonicalPublication(feed.publication),
    author,
    publishedAt: formatPubDate(publishedMs, pubRaw),
    summary,
    publishedMs,
    analyticsScore: analyticsScore(
      title,
      summary,
      feed.publication,
      feed.analyticsNative
    ),
  };
}

function parseGoogleItem(block: string): InternalArticle | null {
  const rawTitle = tagContent(block, "title");
  const link = stripTags(block.match(/<link>([\s\S]*?)<\/link>/i)?.[1] ?? "");
  const source = tagContent(block, "source");
  const pubRaw = tagContent(block, "pubDate");
  if (!rawTitle || !link) return null;

  let title = rawTitle;
  let publication = source || "News";
  if (source) {
    title = rawTitle
      .replace(new RegExp(`\\s+[-|/]\\s*${escapeReg(source)}\\s*$`, "i"), "")
      .trim();
  } else {
    const parts = rawTitle.split(/\s+[-|/]\s+/);
    if (parts.length >= 2) {
      publication = parts[parts.length - 1]!.trim();
      title = parts.slice(0, -1).join(" - ").trim();
    }
  }

  const publishedMs = parsePublishedMs(pubRaw);
  const finalTitle = title || rawTitle;
  const publicationCanon = canonicalPublication(publication);

  return {
    id: `gnews-${link.slice(-40)}`,
    title: finalTitle,
    url: link,
    publication: publicationCanon,
    publishedAt: formatPubDate(publishedMs, pubRaw),
    publishedMs,
    analyticsScore: analyticsScore(
      finalTitle,
      undefined,
      publicationCanon,
      isNativeOutlet(publicationCanon)
    ),
  };
}

function escapeReg(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function fetchText(
  url: string,
  signal?: AbortSignal,
  timeoutMs = 4500,
  fresh = false
): Promise<string | null> {
  const local = new AbortController();
  const onAbort = () => local.abort();
  signal?.addEventListener("abort", onAbort);
  const kill = setTimeout(() => local.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: local.signal,
      headers: {
        Accept:
          "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html, */*",
        "User-Agent":
          "Mozilla/5.0 (compatible; BasketballAnalytics/0.1; +educational news aggregation)",
      },
      ...(fresh
        ? { cache: "no-store" as RequestCache }
        : { next: { revalidate: 60 * 15 } }),
    } as RequestInit);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(kill);
    signal?.removeEventListener("abort", onAbort);
  }
}

/** Pull author from article HTML (JSON-LD / meta) when RSS omitted it. */
async function enrichAuthorFromPage(
  article: InternalArticle,
  signal: AbortSignal
): Promise<InternalArticle> {
  if (article.author) return article;
  if (/news\.google\.com/i.test(article.url)) return article;

  const html = await fetchText(article.url, signal);
  if (!html) return article;

  const candidates: string[] = [];
  for (const re of [
    /property=["']article:author["'][^>]*content=["']([^"']+)["']/i,
    /content=["']([^"']+)["'][^>]*property=["']article:author["']/i,
    /name=["']author["'][^>]*content=["']([^"']+)["']/i,
    /content=["']([^"']+)["'][^>]*name=["']author["']/i,
    /"author"\s*:\s*\{\s*"@type"\s*:\s*"Person"[^}]*"name"\s*:\s*"([^"]+)"/i,
    /"@type"\s*:\s*"Person"[^}]*"name"\s*:\s*"([^"]+)"[^}]*"@type"\s*:\s*"Person"|\"author\"\s*:\s*\"([^"]+)\"/i,
    /itemprop=["']author["'][^>]*>\s*(?:<[^>]+>)*\s*([A-Z][^<]{2,60})/i,
    /class=["'][^"']*byline[^"']*["'][^>]*>\s*(?:By\s+)?([A-Z][^<]{2,60})/i,
  ]) {
    const m = html.match(re);
    const hit = (m?.[1] || m?.[2] || "").trim();
    if (hit) candidates.push(hit);
  }

  for (const c of candidates) {
    const author = cleanAuthor(stripTags(c));
    if (author) return { ...article, author };
  }
  return article;
}

function normalizeTitle(t: string): string {
  return t
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titlesOverlap(a: string, b: string): boolean {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const wa = new Set(na.split(" ").filter((w) => w.length > 3));
  const wb = nb.split(" ").filter((w) => w.length > 3);
  if (wa.size === 0 || wb.length === 0) return false;
  const hit = wb.filter((w) => wa.has(w)).length;
  return hit >= Math.min(4, Math.ceil(wb.length * 0.6));
}

function toPublic(article: InternalArticle): AnalyticsArticle {
  return {
    id: article.id,
    title: article.title,
    url: article.url,
    publication: article.publication,
    author: article.author,
    publishedAt: article.publishedAt,
    summary: article.summary,
  };
}

export async function fetchAnalyticsNews(
  options: {
    signal?: AbortSignal;
    limit?: number;
    /** Bypass Next data cache and re-pull RSS (homepage Refresh). */
    fresh?: boolean;
    /** Fetch article HTML for missing bylines (slow; refresh-only by default). */
    enrichAuthors?: boolean;
  } = {}
): Promise<AnalyticsArticle[]> {
  const limit = options.limit ?? DESK_DEFAULT_LIMIT;
  const fresh = options.fresh === true;
  const enrichAuthors = options.enrichAuthors === true || fresh;
  const external = options.signal;
  const now = Date.now();
  // Keep SSR / default loads snappy; Refresh can wait longer for a full pull.
  const publisherTimeout = fresh ? 5000 : 2200;
  const googleTimeout = fresh ? 3500 : 1800;

  const budget = new AbortController();
  const onExternalAbort = () => budget.abort();
  external?.addEventListener("abort", onExternalAbort);
  const budgetKill = setTimeout(() => budget.abort(), fresh ? 8000 : 2800);

  try {
    // Per-feed timeouts - one slow publisher must not wipe Google results.
    const batches = await Promise.all([
      ...PUBLISHER_FEEDS.map(async (feed) => {
        const xml = await fetchText(
          feed.url,
          budget.signal,
          publisherTimeout,
          fresh
        );
        if (!xml) return [] as InternalArticle[];
        const items: InternalArticle[] = [];
        for (const block of parseXmlItems(xml)) {
          const item = parsePublisherItem(block, feed);
          if (!item) continue;
          if (!matchesKeywords(item.title, feed.keywords)) continue;
          items.push(item);
        }
        return items;
      }),
      ...GOOGLE_FEEDS.map(async (url) => {
        const xml = await fetchText(
          url,
          budget.signal,
          googleTimeout,
          fresh
        );
        if (!xml) return [] as InternalArticle[];
        const items: InternalArticle[] = [];
        for (const block of parseXmlItems(xml)) {
          const item = parseGoogleItem(block);
          if (!item) continue;
          items.push(item);
        }
        return items;
      }),
    ]);

    const collected = batches.flat();
    const deduped: InternalArticle[] = [];
    const seenKeys = new Set<string>();
    const seenTitles: string[] = [];

    for (const article of [...collected].sort(compareDeskArticles)) {
      const key = `${article.publication}|${normalizeTitle(article.title)}`;
      if (seenKeys.has(key)) continue;
      if (seenTitles.some((t) => titlesOverlap(t, article.title))) continue;
      seenKeys.add(key);
      seenTitles.push(article.title);
      deduped.push(article);
    }

    const strict = deduped
      .filter((a) => passesDeskBar(a, now, "strict"))
      .sort(compareDeskArticles);
    let shortlist = pickDeskArticles(strict, limit, now);

    if (shortlist.length < limit) {
      const fill = deduped
        .filter((a) => passesDeskBar(a, now, "fill"))
        .sort(compareDeskArticles);
      const seenPubs = new Set(
        shortlist.map((a) => a.publication.trim().toLowerCase())
      );
      shortlist = [
        ...shortlist,
        ...pickUniqueOutlets(fill, limit - shortlist.length, seenPubs),
      ];
    }

    // Light weekly shuffle among near-tied fresh pieces so the desk rotates.
    if (fresh && shortlist.length > 2) {
      const week = shortlist.filter((a) => {
        const age = ageDays(a.publishedMs, now);
        return age != null && age <= FRESH_WEEK_DAYS;
      });
      if (week.length >= 2) {
        const seed = Math.floor(now / (1000 * 60 * 60 * 6)); // changes ~4×/day
        const rotated = [...week].sort((a, b) => {
          const ha = hashString(`${seed}:${a.id}`);
          const hb = hashString(`${seed}:${b.id}`);
          return ha - hb;
        });
        const older = shortlist.filter((a) => !week.includes(a));
        shortlist = [...rotated, ...older].slice(0, limit);
      }
    }

    if (enrichAuthors) {
      const enrichController = new AbortController();
      const enrichKill = setTimeout(() => enrichController.abort(), 1800);
      try {
        await Promise.all(
          shortlist.map(async (article, idx) => {
            if (article.author) return;
            const enriched = await enrichAuthorFromPage(
              article,
              enrichController.signal
            );
            if (enriched.author) shortlist[idx] = enriched;
          })
        );
      } finally {
        clearTimeout(enrichKill);
      }
    }

    return shortlist.slice(0, limit).map(toPublic);
  } finally {
    clearTimeout(budgetKill);
    external?.removeEventListener("abort", onExternalAbort);
  }
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return h;
}
