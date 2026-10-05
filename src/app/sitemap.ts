import type { MetadataRoute } from "next";

import { AWARD_DEFINITIONS } from "@/content/awards/catalog";
import { listDiscoverableLearnSlugs } from "@/content/learn/resolve";
import rosterSnapshot from "@/data/runtime/current-roster-snapshot.json";
import { absoluteUrl } from "@/lib/site-url";

type RosterFile = {
  players?: Record<string, { teamId?: string }>;
};

const SECTION_PATHS: Array<{ path: string; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }> = [
  { path: "/", changeFrequency: "hourly" },
  { path: "/scores", changeFrequency: "hourly" },
  { path: "/explore/games", changeFrequency: "daily" },
  { path: "/explore/players", changeFrequency: "daily" },
  { path: "/explore/players/hot-cold", changeFrequency: "daily" },
  { path: "/explore/players/visualizations", changeFrequency: "daily" },
  { path: "/explore/players/race", changeFrequency: "daily" },
  { path: "/explore/teams", changeFrequency: "daily" },
  { path: "/explore/teams/trade", changeFrequency: "weekly" },
  { path: "/explore/bracket", changeFrequency: "daily" },
  { path: "/standings", changeFrequency: "daily" },
  { path: "/standings/tracker", changeFrequency: "daily" },
  { path: "/compare", changeFrequency: "weekly" },
  { path: "/sentiment", changeFrequency: "daily" },
  { path: "/offseason", changeFrequency: "daily" },
  { path: "/movement", changeFrequency: "daily" },
  { path: "/acquisitions", changeFrequency: "weekly" },
  { path: "/learn", changeFrequency: "monthly" },
  { path: "/ask", changeFrequency: "monthly" },
  { path: "/history", changeFrequency: "monthly" },
  { path: "/awards", changeFrequency: "monthly" },
  { path: "/arcade", changeFrequency: "monthly" },
  { path: "/arcade/higher-or-lower", changeFrequency: "monthly" },
  { path: "/arcade/zero-82", changeFrequency: "monthly" },
  { path: "/arcade/teammate-chain", changeFrequency: "monthly" },
  { path: "/gm", changeFrequency: "monthly" },
  { path: "/privacy", changeFrequency: "yearly" },
  { path: "/terms", changeFrequency: "yearly" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const roster = rosterSnapshot as unknown as RosterFile;
  const rosterPlayers = roster.players ?? {};

  const teamIds = [...new Set(Object.values(rosterPlayers).map((p) => p.teamId).filter(Boolean))] as string[];
  teamIds.sort((a, b) => Number(a) - Number(b));

  return [
    ...SECTION_PATHS.map(({ path, changeFrequency }) => ({ url: absoluteUrl(path), changeFrequency })),
    ...teamIds.map((id) => ({ url: absoluteUrl(`/teams/${id}`), changeFrequency: "daily" as const })),
    ...Object.keys(rosterPlayers).map((id) => ({ url: absoluteUrl(`/players/${id}`), changeFrequency: "daily" as const })),
    ...listDiscoverableLearnSlugs().map((slug) => ({ url: absoluteUrl(`/learn/${slug}`), changeFrequency: "monthly" as const })),
    ...AWARD_DEFINITIONS.map((a) => ({ url: absoluteUrl(`/awards/${a.slug}`), changeFrequency: "yearly" as const })),
  ];
}
