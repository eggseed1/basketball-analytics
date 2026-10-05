import { GlassSurface } from "@/components/brand/glass-surface";
import {
  PlayerAvailabilityLazy,
  PlayerCreationLazy,
  PlayerRollingFormLazy,
  PlayerShotDietLazy,
  PlayerUsageEfficiencyLazy,
} from "@/components/charts/recharts-lazy";
import { PlayerOnOffCard } from "@/components/players/player-on-off";
import { PlayerPlayTypesCard } from "@/components/players/player-play-types";
import { PlayerShotMapView } from "@/components/players/player-shot-map";
import { getPlayerOnOff } from "@/data/runtime/on-off-snapshot";
import {
  getLeagueShotZones,
  getPlayerPlayTypes,
} from "@/data/runtime/play-type-snapshot";
import { type } from "@/lib/design-system";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { resolvePlayerSeasonShotIndex } from "@/data/runtime/player-shots-store";
import { getPlayerSeasonShotMap } from "@/data/queries/player-shots";
import { slimEdgeProductEnabled } from "@/data/providers/nba/runtime-policy";
import { playerSeasonShotIndexToMap } from "@/lib/player-season-shot-map-adapter";
import type { PlayerShotMap } from "@/lib/player-shot-map";
import type { PlayerSeasonKind } from "@/lib/player-destination";
import { buildUsageEfficiencyPoints } from "@/lib/player-usage-efficiency";
import { buildShotDiet } from "@/lib/player-stat-views";
import {
  buildAvailabilitySeries,
  buildCreationProfile,
} from "@/lib/player-availability";
import {
  getFilteredPlayerSeasonsCached,
  getPlayerCareerSeasonsCached,
} from "@/data/queries/request-cache";
import { resolvePlayerIdentityCached } from "@/data/identity/player-identity-cache";
import { getCompactPlayerGameLogAsync } from "@/data/history/player-game-log";
import { cn } from "@/lib/utils";

async function PlayTypesBlock({
  playerId,
  nbaId,
  season,
  teamKey,
}: {
  playerId: string;
  nbaId?: string | null;
  season: string;
  teamKey?: string | null;
}) {
  const identity = await resolvePlayerIdentityCached(playerId).catch(() => null);
  const data = getPlayerPlayTypes(season, [identity?.nbaId, nbaId, playerId]);
  if (!data) return null;
  return (
    <PlayerPlayTypesCard
      data={data}
      playerName={identity?.displayName ?? "This player"}
      teamKey={teamKey}
    />
  );
}

async function OnOffBlock({
  playerId,
  nbaId,
  season,
  teamKey,
}: {
  playerId: string;
  nbaId?: string | null;
  season: string;
  teamKey?: string | null;
}) {
  const identity = await resolvePlayerIdentityCached(playerId).catch(() => null);
  const stints = getPlayerOnOff(season, [identity?.nbaId, nbaId, playerId]);
  if (!stints.length) return null;
  return (
    <PlayerOnOffCard
      stints={stints}
      playerName={identity?.displayName ?? "this player"}
      teamKey={teamKey}
    />
  );
}

async function UsageEfficiencyBlock({
  playerId,
  season,
  seasons,
  teamKey,
}: {
  playerId: string;
  season: string;
  seasons: string[];
  teamKey?: string | null;
}) {
  const [peers, identity] = await Promise.all([
    getFilteredPlayerSeasonsCached(season, 15).catch(() => []),
    resolvePlayerIdentityCached(playerId).catch(() => null),
  ]);
  const focalIds = new Set<string>([playerId]);
  if (identity?.espnId) focalIds.add(identity.espnId);
  if (identity?.nbaId) focalIds.add(identity.nbaId);

  const points = buildUsageEfficiencyPoints(peers, focalIds);
  const self = points.find((p) => p.isSelf);
  const brand = resolveTeamBrand(teamKey);
  const playerName = self?.playerName ?? identity?.displayName ?? "Player";

  return (
    <PlayerUsageEfficiencyLazy
      points={points}
      playerName={playerName}
      season={season}
      accentColor={brand?.primary}
      teamKey={teamKey}
      seasons={seasons}
    />
  );
}

async function ShotDietBlock({
  playerId,
  season,
  teamKey,
}: {
  playerId: string;
  season: string;
  teamKey?: string | null;
}) {
  const [peers, identity] = await Promise.all([
    getFilteredPlayerSeasonsCached(season, 1).catch(() => []),
    resolvePlayerIdentityCached(playerId).catch(() => null),
  ]);
  const ids = new Set<string>([playerId]);
  if (identity?.espnId) ids.add(identity.espnId);
  if (identity?.nbaId) ids.add(identity.nbaId);
  const row = peers.find((p) => ids.has(p.playerId));
  if (!row) return null;
  const slices = buildShotDiet(row);
  if (!slices.some((s) => s.attempts > 0)) return null;
  const league = peers.reduce(
    (acc, p) => {
      acc["2pa"] += Math.max(0, p.fieldGoalsAttempted - p.threePointersAttempted);
      acc["3pa"] += Math.max(0, p.threePointersAttempted);
      acc.fta += Math.max(0, p.freeThrowsAttempted);
      return acc;
    },
    { "2pa": 0, "3pa": 0, fta: 0 } as Record<string, number>
  );
  const leagueTotal = league["2pa"]! + league["3pa"]! + league.fta!;
  const leagueShares =
    peers.length >= 100 && leagueTotal > 0
      ? Object.fromEntries(Object.entries(league).map(([k, v]) => [k, v / leagueTotal]))
      : null;
  return (
    <PlayerShotDietLazy
      slices={slices}
      teamKey={teamKey}
      season={season}
      leagueShares={leagueShares}
    />
  );
}

async function CreationBlock({
  playerId,
  season,
  teamKey,
}: {
  playerId: string;
  season: string;
  teamKey?: string | null;
}) {
  const [peers, identity] = await Promise.all([
    getFilteredPlayerSeasonsCached(season, 1).catch(() => []),
    resolvePlayerIdentityCached(playerId).catch(() => null),
  ]);
  const ids = new Set<string>([playerId]);
  if (identity?.espnId) ids.add(identity.espnId);
  if (identity?.nbaId) ids.add(identity.nbaId);
  const row = peers.find((p) => ids.has(p.playerId));
  if (!row) return null;
  const profile = buildCreationProfile(row);
  if (!profile) return null;
  return (
    <PlayerCreationLazy
      profile={profile}
      season={season}
      accentColor={resolveTeamBrand(teamKey)?.primary}
    />
  );
}

async function AvailabilityBlock({
  playerId,
  teamKey,
}: {
  playerId: string;
  teamKey?: string | null;
}) {
  const career = await getPlayerCareerSeasonsCached(playerId).catch(() => []);
  const points = buildAvailabilitySeries(career);
  if (points.length < 2) return null;
  return (
    <PlayerAvailabilityLazy
      points={points}
      accentColor={resolveTeamBrand(teamKey)?.primary}
    />
  );
}

async function RollingFormBlock({
  playerId,
  season,
  teamKey,
}: {
  playerId: string;
  season: string;
  teamKey?: string | null;
}) {
  const log = await getCompactPlayerGameLogAsync({
    playerId,
    season,
    pageSize: 500,
    filter: "ALL",
  }).catch(() => null);

  const games = [...(log?.allFiltered ?? [])]
    .filter(
      (g) =>
        (g.minutesNum ?? 0) > 0 ||
        (g.points ?? 0) > 0 ||
        (g.fga ?? 0) > 0 ||
        (g.fta ?? 0) > 0
    )
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((g) => ({
      gameId: g.gameId,
      gameDate: g.date,
      opponentTeamId: g.opponentNbaId || g.opponentAbbr || "OPP",
      points: g.points,
      fieldGoalsAttempted: g.fga,
      freeThrowsAttempted: g.fta,
    }));

  const brand = resolveTeamBrand(teamKey);

  return (
    <PlayerRollingFormLazy
      games={games}
      season={season}
      accentColor={brand?.primary}
    />
  );
}

/**
 * Visualizations island — shot map + usage × efficiency + rolling form,
 * then planned list.
 */
export async function PlayerVisualizationsIsland({
  playerId,
  nbaId,
  season,
  seasons,
  seasonType,
  teamKey,
  teamLabel,
  teamAbbr,
}: {
  playerId: string;
  nbaId?: string | null;
  season: string;
  seasons: string[];
  seasonType: PlayerSeasonKind;
  teamKey?: string | null;
  teamLabel?: string | null;
  teamAbbr?: string | null;
}) {
  const rolling = (
    <RollingFormBlock
      playerId={playerId}
      season={season}
      teamKey={teamKey}
    />
  );
  const creation = (
    <CreationBlock playerId={playerId} season={season} teamKey={teamKey} />
  );
  const availability = (
    <AvailabilityBlock playerId={playerId} teamKey={teamKey} />
  );

  const extras = (
    <>
      <div className="grid gap-4 lg:grid-cols-2 [&>*:only-child]:lg:col-span-2">
        <ShotDietBlock playerId={playerId} season={season} teamKey={teamKey} />
        <OnOffBlock playerId={playerId} nbaId={nbaId} season={season} teamKey={teamKey} />
      </div>
      <PlayTypesBlock playerId={playerId} nbaId={nbaId} season={season} teamKey={teamKey} />
      {creation}
      {rolling}
      {availability}
    </>
  );

  try {
    // Slim edge only (SLIM_EDGE_PRODUCT=1). Paid Workers load shot charts.
    if (slimEdgeProductEnabled()) {
      return (
        <section
          id="shooting"
          className="scroll-mt-16 flex flex-col gap-4"
          aria-label="Shooting"
        >
          <GlassSurface effect="css" className="px-3 py-2">
            <p className={cn(type.caption, "font-semibold text-foreground")}>
              Season shot chart · {season}
            </p>
            <p className={cn(type.caption, "text-muted-foreground")}>
              Shot chart detail is temporarily limited on this edge. Overview
              and career stats remain available.
            </p>
          </GlassSurface>
          <UsageEfficiencyBlock
            playerId={playerId}
            season={season}
            seasons={seasons}
            teamKey={teamKey}
          />
          {extras}
        </section>
      );
    }

    const index = await resolvePlayerSeasonShotIndex({
      playerId,
      nbaId,
      season,
    });
    const label = teamLabel || teamKey || "NBA";
    const coverageLabel =
      index && index.coordinateShots > 0 && index.coverage < 0.99
        ? `The map shows ${index.coordinateShots.toLocaleString("en-US")} of ${index.boxFga.toLocaleString(
            "en-US"
          )} field goal attempts (${(index.coverage * 100).toFixed(0)}%). The rest have no court location.`
        : null;

    let map: PlayerShotMap;
    if (index && index.coordinateShots > 0) {
      map = playerSeasonShotIndexToMap({
        index,
        season,
        teamLabel: label,
        seasonType,
      });
    } else {
      map = await getPlayerSeasonShotMap({
        playerId,
        nbaId,
        season,
        seasonType,
        teamAbbr: teamAbbr ?? "TOT",
        teamLabel: label,
      });
    }

    return (
      <section
        id="shooting"
        className="scroll-mt-16 flex flex-col gap-4"
        aria-label="Shooting"
      >
        {coverageLabel ? (
          <GlassSurface effect="css" className="px-3 py-2">
            <p className={cn(type.caption, "font-semibold text-foreground")}>
              Season shot chart · {season}
            </p>
            <p className={cn(type.caption, "text-muted-foreground")}>
              {coverageLabel}
            </p>
          </GlassSurface>
        ) : null}
        <PlayerShotMapView
          map={map}
          seasons={seasons}
          leagueZones={getLeagueShotZones(map.season)}
        />
        <UsageEfficiencyBlock
          playerId={playerId}
          season={season}
          seasons={[]}
          teamKey={teamKey}
        />
        {extras}
      </section>
    );
  } catch {
    return (
      <section id="shooting" className="scroll-mt-16 flex flex-col gap-4">
        <UsageEfficiencyBlock
          playerId={playerId}
          season={season}
          seasons={seasons}
          teamKey={teamKey}
        />
        {extras}
        <p className={cn(type.bodySm, "text-muted-foreground")}>
          Shooting visuals temporarily unavailable.
        </p>
      </section>
    );
  }
}
