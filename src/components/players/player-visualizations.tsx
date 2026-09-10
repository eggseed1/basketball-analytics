import { GlassSurface } from "@/components/brand/glass-surface";
import {
  PlayerAvailabilityLazy,
  PlayerCreationLazy,
  PlayerRollingFormLazy,
  PlayerShotDietLazy,
  PlayerUsageEfficiencyLazy,
} from "@/components/charts/recharts-lazy";
import { PlayerShotMapView } from "@/components/players/player-shot-map";
import { type } from "@/lib/design-system";
import { brandAtmosphereColors } from "@/lib/game-matchup-theme";
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

const PLANNED = [
  {
    title: "Play types",
    detail:
      "Isolation, pick-and-roll, spot-up, putbacks, and transition frequency plus efficiency when the tracking feed covers the season.",
  },
  {
    title: "On/off",
    detail:
      "Team scoring and allowed points with the player on the floor vs off, with lineup size disclosed so tiny samples stay honest.",
  },
] as const;

export function PlayerPlannedVisualizations({
  teamKey,
}: {
  teamKey?: string | null;
}) {
  const wash = brandAtmosphereColors(
    resolveTeamBrand(teamKey)?.primary,
    resolveTeamBrand(teamKey)?.secondary
  );
  return (
    <GlassSurface
      effect="css"
      accentColor={wash?.colorA}
      accentColorB={wash?.colorB}
      className="flex flex-col gap-3 p-4 sm:p-5"
    >
      <div>
        <h2 className={type.heading}>Planned visualizations</h2>
        <p className={cn(type.bodySm, "mt-1 text-muted-foreground")}>
          Shot maps, usage, diet, creation, rolling form, and availability ship
          here. Play types and on/off wait on tracking feeds.
        </p>
      </div>
      <ul className="flex flex-col gap-3">
        {PLANNED.map((item) => (
          <li key={item.title}>
            <p className={cn(type.bodySm, "font-semibold")}>{item.title}</p>
            <p className={cn(type.caption, "mt-0.5 text-muted-foreground")}>
              {item.detail}
            </p>
          </li>
        ))}
      </ul>
    </GlassSurface>
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
      seasons={seasons}
    />
  );
}

async function ShotDietBlock({
  playerId,
  season,
}: {
  playerId: string;
  season: string;
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
  return <PlayerShotDietLazy slices={slices} />;
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
  const shotDiet = <ShotDietBlock playerId={playerId} season={season} />;
  const creation = (
    <CreationBlock playerId={playerId} season={season} teamKey={teamKey} />
  );
  const availability = (
    <AvailabilityBlock playerId={playerId} teamKey={teamKey} />
  );

  const extras = (
    <>
      {shotDiet}
      {creation}
      {rolling}
      {availability}
      <PlayerPlannedVisualizations teamKey={teamKey} />
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
      index && index.coordinateShots > 0
        ? `Coordinate-covered FGA: ${index.coordinateShots} of ${index.boxFga} box FGA (${(
            index.coverage * 100
          ).toFixed(1)}%)`
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
        <PlayerShotMapView map={map} seasons={seasons} />
        <UsageEfficiencyBlock
          playerId={playerId}
          season={season}
          seasons={seasons}
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
