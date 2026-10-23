import { AWARD_DEFINITIONS } from "@/content/awards/catalog";
import { listDiscoverableLearnSlugs } from "@/content/learn/resolve";
import { absoluteUrl } from "@/lib/site-url";

export const SITEMAP_KINDS = ["pages", "players", "games"] as const;
export type SitemapKind = (typeof SITEMAP_KINDS)[number];

export type SitemapUrl = {
  loc: string;
  lastmod?: string;
};

const SECTION_PATHS = [
  "/",
  "/scores",
  "/explore/games",
  "/explore/players",
  "/explore/players/hot-cold",
  "/explore/players/styles",
  "/explore/players/visualizations",
  "/explore/players/race",
  "/explore/teams/trade",
  "/standings",
  "/standings/visualizations",
  "/compare",
  "/sentiment",
  "/offseason",
  "/movement",
  "/acquisitions",
  "/learn",
  "/ask",
  "/history",
  "/franchises",
  "/awards",
  "/about",
  "/injuries",
  "/arcade",
  "/arcade/daily",
  "/findings",
  "/arcade/higher-or-lower",
  "/arcade/zero-82",
  "/arcade/teammate-chain",
  "/arcade/one-shot",
  "/gm",
  "/sources",
  "/privacy",
  "/terms",
];

function playerLoc(id: string): string {
  return absoluteUrl(`/players/${encodeURIComponent(id)}`);
}

function lastmodDate(value: string): string | undefined {
  const day = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : undefined;
}

export async function sitemapUrls(kind: SitemapKind): Promise<SitemapUrl[]> {
  if (kind === "pages") {
    const { ensureCurrentRoster, getBundledCurrentRosterPlayers } = await import(
      "@/data/runtime/current-roster-snapshot"
    );
    await ensureCurrentRoster();
    const rosterPlayers = getBundledCurrentRosterPlayers();
    const teamIds = [
      ...new Set(
        Object.values(rosterPlayers)
          .map((p) => p.teamId)
          .filter(Boolean)
      ),
    ] as string[];
    teamIds.sort((a, b) => Number(a) - Number(b));
    return [
      ...SECTION_PATHS.map((path) => ({ loc: absoluteUrl(path) })),
      ...teamIds.map((id) => ({ loc: absoluteUrl(`/teams/${id}`) })),
      ...listDiscoverableLearnSlugs().map((slug) => ({ loc: absoluteUrl(`/learn/${slug}`) })),
      ...AWARD_DEFINITIONS.map((a) => ({ loc: absoluteUrl(`/awards/${a.slug}`) })),
    ];
  }

  if (kind === "players") {
    const [
      { ensureCurrentRoster, getBundledCurrentRosterPlayers },
      { ensurePlayerSearch, getPlayerSearchIndex },
    ] = await Promise.all([
      import("@/data/runtime/current-roster-snapshot"),
      import("@/data/runtime/player-search-snapshot"),
    ]);
    await Promise.all([ensureCurrentRoster(), ensurePlayerSearch()]);
    const rosterPlayers = getBundledCurrentRosterPlayers();
    const currentIds = Object.keys(rosterPlayers);
    const currentSet = new Set(currentIds);
    const formerIds = getPlayerSearchIndex()
      .map((row) => row.id)
      .filter((id) => id && !currentSet.has(id));
    return [
      ...currentIds.map((id) => ({ loc: playerLoc(id) })),
      ...formerIds.map((id) => ({ loc: playerLoc(id) })),
    ];
  }

  const { ensureGameSnapshotLite, getRuntimeSnapshotGames } = await import(
    "@/data/runtime/game-snapshot"
  );
  await ensureGameSnapshotLite();
  const finishedGames = getRuntimeSnapshotGames().filter(
    (g) => g.id && /^Final/.test(String(g.statusDetail ?? ""))
  );
  return finishedGames.map((g) => ({
    loc: absoluteUrl(`/games/${g.id}`),
    lastmod: g.gameDate ? lastmodDate(g.gameDate) : undefined,
  }));
}

export function isSitemapKind(value: string): value is SitemapKind {
  return (SITEMAP_KINDS as readonly string[]).includes(value);
}
