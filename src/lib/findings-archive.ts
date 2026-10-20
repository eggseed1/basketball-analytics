import { formatAppDateTime } from "@/i18n/format-date";
import type { RecentInsight } from "@/lib/recent-insights";

export type ArchivedFinding = RecentInsight & {
  season: string;
  preseason: boolean;
  /** When the nightly run first saw this card. */
  addedAt: string;
};

export type FindingsArchive = {
  updatedAt: string | null;
  findings: ArchivedFinding[];
};

/** About forty nights of six cards; the archive ships inside the Worker bundle. */
export const FINDINGS_ARCHIVE_MAX = 240;

function newestFirst(a: ArchivedFinding, b: ArchivedFinding): number {
  return (
    b.gameDate.localeCompare(a.gameDate) ||
    b.priority - a.priority ||
    a.id.localeCompare(b.id)
  );
}

/**
 * Adds tonight's cards to the archive. A card already archived keeps its
 * first-seen time but takes the newer text, since a box score can be corrected.
 */
export function mergeFindings(
  existing: ArchivedFinding[],
  incoming: RecentInsight[],
  meta: { season: string; preseason: boolean; now: string },
  max = FINDINGS_ARCHIVE_MAX
): ArchivedFinding[] {
  const byId = new Map(existing.map((f) => [f.id, f]));
  for (const insight of incoming) {
    if (insight.focus === "surprise") continue;
    const prior = byId.get(insight.id);
    byId.set(insight.id, {
      ...insight,
      season: meta.season,
      preseason: meta.preseason,
      addedAt: prior?.addedAt ?? meta.now,
    });
  }
  return [...byId.values()].sort(newestFirst).slice(0, max);
}

export function groupFindingsByDate(
  findings: ArchivedFinding[]
): { date: string; findings: ArchivedFinding[] }[] {
  const groups = new Map<string, ArchivedFinding[]>();
  for (const f of [...findings].sort(newestFirst)) {
    const list = groups.get(f.gameDate);
    if (list) list.push(f);
    else groups.set(f.gameDate, [f]);
  }
  return [...groups].map(([date, list]) => ({ date, findings: list }));
}

export function findingsDateHeading(iso: string, locale?: string | null): string {
  const d = new Date(`${iso}T12:00:00Z`);
  if (!Number.isFinite(d.getTime())) return iso;
  return formatAppDateTime(d, locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Where a card points: the game, then the player, then the team. */
export function findingPath(f: Pick<RecentInsight, "gameId" | "playerId" | "teamId">): string {
  if (f.gameId) return `/games/${encodeURIComponent(f.gameId)}`;
  if (f.playerId) return `/players/${encodeURIComponent(f.playerId)}`;
  if (f.teamId) return `/teams/${encodeURIComponent(f.teamId)}`;
  return "/findings";
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** RSS 2.0 feed of archived findings, newest first. */
export function findingsRss(
  findings: ArchivedFinding[],
  opts: {
    siteUrl: string;
    title: string;
    limit?: number;
    /** Channel description; defaults to English. */
    description?: string;
    /** RSS `<language>` tag; defaults to en-us. */
    language?: string;
    /** `<category>` text for preseason cards; defaults to "{season} preseason". */
    preseasonLabel?: (season: string) => string;
  }
): string {
  const items = [...findings]
    .sort(newestFirst)
    .slice(0, opts.limit ?? 50)
    .map((f) => {
      const link = `${opts.siteUrl}${findingPath(f)}`;
      const kind = f.preseason ? (opts.preseasonLabel?.(f.season) ?? `${f.season} preseason`) : f.season;
      const pubDate = new Date(f.addedAt);
      return [
        "    <item>",
        `      <title>${escapeXml(f.headline)}</title>`,
        `      <link>${escapeXml(link)}</link>`,
        `      <guid isPermaLink="false">drbl-finding:${escapeXml(f.id)}</guid>`,
        Number.isFinite(pubDate.getTime()) ? `      <pubDate>${pubDate.toUTCString()}</pubDate>` : null,
        `      <category>${escapeXml(kind)}</category>`,
        `      <description>${escapeXml(`${f.description} (${f.context})`)}</description>`,
        "    </item>",
      ]
        .filter(Boolean)
        .join("\n");
    });
  const newest = findings.reduce<string | null>(
    (max, f) => (max == null || f.addedAt > max ? f.addedAt : max),
    null
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${escapeXml(opts.title)}</title>`,
    `    <link>${escapeXml(`${opts.siteUrl}/findings`)}</link>`,
    `    <atom:link href="${escapeXml(`${opts.siteUrl}/findings/feed.xml`)}" rel="self" type="application/rss+xml"/>`,
    `    <description>${escapeXml(
      opts.description ?? "What stood out in each night of NBA games, from box scores and play-by-play."
    )}</description>`,
    `    <language>${escapeXml(opts.language ?? "en-us")}</language>`,
    newest ? `    <lastBuildDate>${new Date(newest).toUTCString()}</lastBuildDate>` : null,
    ...items,
    "  </channel>",
    "</rss>",
    "",
  ]
    .filter((line) => line != null)
    .join("\n");
}
