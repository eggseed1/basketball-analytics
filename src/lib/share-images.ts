import type { Metadata } from "next";

import manifest from "@/data/runtime/share-images.json";
import { SITE_NAME } from "@/lib/site-url";

type ShareKind = "players" | "teams" | "games";

const data = manifest as { version: string | null } & Record<ShareKind, string[]>;
const sets: Record<ShareKind, Set<string>> = {
  players: new Set(data.players),
  teams: new Set(data.teams),
  games: new Set(data.games),
};

/**
 * Open Graph and Twitter image for a page whose share image the nightly run
 * rendered. A page's openGraph replaces the layout's, so the site fields ride along.
 */
export function shareImageMetadata(
  kind: ShareKind,
  id: string | null | undefined,
  alt: string
): Pick<Metadata, "openGraph" | "twitter"> {
  if (!id || !sets[kind].has(id)) return {};
  const url = `/og/${kind}/${encodeURIComponent(id)}.png${data.version ? `?v=${data.version}` : ""}`;
  const image = { url, width: 1200, height: 630, alt };
  return {
    openGraph: { type: "website", siteName: SITE_NAME, locale: "en_US", images: [image] },
    twitter: { card: "summary_large_image", images: [image] },
  };
}
