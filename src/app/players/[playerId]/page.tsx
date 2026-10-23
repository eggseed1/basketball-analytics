import { Suspense, type ComponentProps } from "react";
import { getTranslations } from "next-intl/server";

import { PageAtmosphere } from "@/components/brand/page-atmosphere";
import { GlassTintScaleProvider } from "@/components/brand/glass-surface";
import { DestinationClientShell } from "@/components/continuity/destination-client-shell";
import { MotionReveal } from "@/components/continuity/motion-reveal";
import {
  PlayerBoardSkeleton,
  PlayerPercentileSkeleton,
} from "@/components/players/player-page-skeletons";
import { JsonLd } from "@/components/seo/json-ld";
import { resolvePlayerIdentityCached } from "@/data/identity/player-identity-cache";
import { getPlayerPortraitUrl } from "@/data/media/get-player-media";
import { getPlayerCached } from "@/data/queries/request-cache";
import { lookupEspnIdByPlayerName } from "@/data/runtime/espn-name-index";
import {
  remapLegendNbaIdToBref,
  resolveLegacyNbaPersonId,
} from "@/data/runtime/legend-nba-to-bref";
import { awardWinnerIdForQuery } from "@/data/runtime/awards-search-boost";
import { parseBrefPlayerSlug } from "@/data/providers/nba/bref-career-from-page";
import {
  findPlayerSearchRowByName,
  getPlayerSearchIndex,
} from "@/data/runtime/player-search-snapshot";
import {
  getBundledCurrentRosterEntry,
  resolveBundledCurrentTeamId,
} from "@/data/runtime/current-roster-snapshot";
import { unplayedDrafteeFor } from "@/data/runtime/draftee-search";
import { brandAtmosphereColors } from "@/lib/game-matchup-theme";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { firstUsablePlayerDisplayName } from "@/lib/player-display-name";
import { brandableTeamKey } from "@/lib/player-team-context";
import { shareImageMetadata } from "@/lib/share-images";
import { absoluteUrl } from "@/lib/site-url";
import { yieldForStreaming } from "@/lib/stream-yield";

/** Team color stays a hint on player cards, close to the neutral home page cards. */
const PLAYER_CARD_TINT_SCALE = 0.3;

interface PlayerPageProps {
  params: Promise<{ playerId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Legacy Cloudflare BRef peer-board ids → ESPN athlete id when known. */
function resolvePublicPlayerId(raw: string): string {
  let id = String(raw ?? "").trim();
  try {
    id = decodeURIComponent(id);
  } catch {
    // keep raw
  }
  if (/^\d+$/.test(id)) {
    id = resolveLegacyNbaPersonId(id) ?? id;
  }
  const remapped = remapLegendNbaIdToBref(id);
  if (remapped) return remapped;

  if (/^\d+$/.test(id)) {
    const row = getPlayerSearchIndex().find((r) => r.id === id);
    if (row && (row.firstSeason ?? row.season) < "1996-97") {
      const legend = awardWinnerIdForQuery(row.name);
      if (legend?.startsWith("bref:")) return legend;
    }
  }

  if (!id.toLowerCase().startsWith("bref:")) return id;
  if (parseBrefPlayerSlug(id)) return id;
  const inner = id.slice(id.indexOf(":") + 1);
  const namePart = inner.split("|")[0] ?? "";
  const season = /(\d{4}-\d{2})$/.exec(inner)?.[1] ?? null;
  const fromEspn = lookupEspnIdByPlayerName(namePart);
  if (fromEspn) return fromEspn;
  const row = findPlayerSearchRowByName(namePart, season);
  return row?.id && row.id !== id ? row.id : id;
}

function uniqueEspnIdForBrefName(
  playerId: string,
  displayName: string | null | undefined
): string | null {
  if (!playerId.toLowerCase().startsWith("bref:") || !displayName) return null;
  const espnId = lookupEspnIdByPlayerName(displayName);
  if (!espnId) return null;
  const nameLower = displayName.toLowerCase();
  const sameName = getPlayerSearchIndex().filter((r) => r.nameLower === nameLower);
  return sameName.length === 1 && sameName[0]!.id === espnId ? espnId : null;
}

export async function generateMetadata({ params }: PlayerPageProps) {
  await yieldForStreaming();
  const t = await getTranslations("PlayerDetail");
  const { playerId: rawId } = await params;
  const playerId = resolvePublicPlayerId(rawId);
  const [player, identity] = await Promise.all([
    getPlayerCached(playerId),
    resolvePlayerIdentityCached(playerId).catch(() => null),
  ]);
  const displayName = firstUsablePlayerDisplayName(
    identity?.displayName,
    player?.fullName
  );
  const canonicalId =
    identity?.espnId ?? uniqueEspnIdForBrefName(playerId, displayName) ?? playerId;
  return {
    title: displayName
      ? t("metaStatsTitle", { name: displayName })
      : t("metaPlayerFallback"),
    alternates: { canonical: `/players/${encodeURIComponent(canonicalId)}` },
    description: displayName
      ? `${displayName} stats by season, game log, shot chart, on/off splits, DRBL impact rating and contract.`
      : undefined,
    ...shareImageMetadata(
      "players",
      canonicalId,
      displayName ?? t("metaPlayerFallback")
    ),
  };
}

async function PlayerPageWithCareerLazy(
  props: ComponentProps<
    typeof import("./player-page-with-career").PlayerPageWithCareer
  >
) {
  const { PlayerPageWithCareer } = await import("./player-page-with-career");
  return <PlayerPageWithCareer {...props} />;
}

/**
 * Sync identity shell only (search + roster snapshots). Never await career or
 * live player/identity fetches here — those stay inside Suspense with the
 * career body (same idea as team brand → board).
 */
export default async function PlayerPage({
  params,
  searchParams,
}: PlayerPageProps) {
  await yieldForStreaming();
  const t = await getTranslations("PlayerDetail");
  const { playerId: rawId } = await params;
  const playerId = resolvePublicPlayerId(rawId);

  // Sync lookups only. Career body owns notFound after live/career resolves.
  const searchHit = getPlayerSearchIndex().find((r) => r.id === playerId);
  const draftee = unplayedDrafteeFor(playerId);
  const displayName =
    firstUsablePlayerDisplayName(searchHit?.name, draftee?.name) ?? playerId;
  const rosterTeamId = resolveBundledCurrentTeamId(playerId);
  const teamKey =
    brandableTeamKey(rosterTeamId) ??
    brandableTeamKey(getBundledCurrentRosterEntry(playerId)?.teamId);
  const brand = resolveTeamBrand(teamKey);
  const atmosphere = brandAtmosphereColors(brand?.primary, brand?.secondary);
  const canonicalId =
    uniqueEspnIdForBrefName(playerId, displayName) ?? playerId;
  const portraitUrl =
    getPlayerPortraitUrl(rawId) ?? getPlayerPortraitUrl(playerId);

  const shellFallback = (
    <>
      <MotionReveal />
      <GlassTintScaleProvider scale={PLAYER_CARD_TINT_SCALE}>
        <div className="flex flex-col gap-4 sm:gap-5" aria-busy="true">
          <section className="sports-card flex flex-col gap-3 p-4 sm:p-5">
            <div className="flex items-start gap-4">
              {portraitUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={portraitUrl}
                  alt=""
                  className="h-16 w-16 rounded-md object-cover"
                />
              ) : (
                <div
                  className="h-16 w-16 rounded-md bg-secondary/60"
                  aria-hidden
                />
              )}
              <div className="min-w-0 flex flex-col gap-1">
                <h1 className="truncate text-[22px] font-bold tracking-tight">
                  {displayName}
                </h1>
                <p className="text-[13px] text-muted-foreground">
                  {t("loadingCareer")}
                </p>
              </div>
            </div>
          </section>
          <PlayerPercentileSkeleton label={t("loadingCareer")} />
          <PlayerBoardSkeleton label={t("loadingCareer")} />
        </div>
      </GlassTintScaleProvider>
    </>
  );

  return (
    <DestinationClientShell className="site-shell flex flex-1 flex-col gap-4 pb-5 sm:gap-5 sm:pb-7">
      <PageAtmosphere
        colorA={atmosphere?.colorA}
        colorB={atmosphere?.colorB}
      />
      <main
        data-motion-page
        className="relative z-[1] flex flex-1 flex-col gap-4 sm:gap-5"
      >
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "ProfilePage",
            mainEntity: {
              "@type": "Person",
              name: displayName,
              url: absoluteUrl(`/players/${encodeURIComponent(canonicalId)}`),
            },
          }}
        />
        <Suspense fallback={shellFallback}>
          <PlayerPageWithCareerLazy
            params={params}
            searchParams={searchParams}
          />
        </Suspense>
      </main>
    </DestinationClientShell>
  );
}
