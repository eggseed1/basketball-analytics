import "server-only";

import { resolvePlayerIdentityCached } from "@/data/identity/player-identity-cache";
import { resolveCanonicalTeam } from "@/data/identity/team-map";
import { getUniverseSeasonsForPlayer } from "@/data/history/player-universe";
import { getDataProvider } from "@/data/providers";
import {
  effectiveFieldGoalPct,
  freeThrowRate,
  threePointAttemptRate,
  trueShootingPct,
  turnoverPct,
  twoPointPct,
} from "@/data/providers/nba/compute-advanced";
import { isPreseasonRosterSeason } from "@/data/providers/nba/espn-roster-client";
import {
  isVercelRuntime,
  runtimeTimeoutMs,
} from "@/data/providers/nba/runtime-policy";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { withPlayerSeasonDefaults } from "@/data/transformers/player-season-defaults";
import type { Player, PlayerSeason } from "@/data/types";
import {
  firstUsablePlayerDisplayName,
  isSyntheticPlayerDisplayName,
} from "@/lib/player-display-name";

function historyNumber(value: number | null | undefined): number {
  return value == null ? Number.NaN : value;
}

function uniquePlayerIds(
  ...ids: Array<string | null | undefined>
): string[] {
  return [
    ...new Set(
      ids
        .map((id) => String(id ?? "").trim())
        .filter(Boolean)
    ),
  ];
}

/**
 * Disk history is keyed by NBA PERSON_ID while public player links commonly use
 * ESPN athlete ids. Resolve the first factual history row across both namespaces
 * and normalize it back to the requested route id for stable links/components.
 */
function historyCareerFallback(
  routePlayerId: string,
  lookupIds: string[]
): PlayerSeason[] {
  let historyRows: ReturnType<typeof getUniverseSeasonsForPlayer> = [];
  for (const lookupId of lookupIds) {
    historyRows = getUniverseSeasonsForPlayer(lookupId);
    if (historyRows.length > 0) break;
  }

  return historyRows.map((row) => {
    const fgm = historyNumber(row.fgm);
    const fga = historyNumber(row.fga);
    const threePm = historyNumber(row.threePm);
    const threePa = historyNumber(row.threePa);
    const ftm = historyNumber(row.ftm);
    const fta = historyNumber(row.fta);
    const points = historyNumber(row.points);
    const turnovers = historyNumber(row.turnovers);
    const multi = (row.teamIds ?? []).length > 1;
    const efg = effectiveFieldGoalPct(fgm, threePm, fga);
    const ts = trueShootingPct(points, fga, fta);

    return withPlayerSeasonDefaults({
      playerId: routePlayerId,
      playerName: row.playerName,
      teamId: multi ? "TOT" : row.primaryTeamId,
      teamName: multi ? "Multiple Teams" : row.primaryTeamId,
      providerTeamId: row.primaryTeamId,
      teamIdProvider: "nba",
      nbaTeamId: row.primaryTeamId,
      season: row.season,
      gamesPlayed: row.gp,
      gamesStarted: historyNumber(row.gs),
      minutes: historyNumber(row.minutes),
      fieldGoalsMade: fgm,
      fieldGoalsAttempted: fga,
      threePointersMade: threePm,
      threePointersAttempted: threePa,
      freeThrowsMade: ftm,
      freeThrowsAttempted: fta,
      rebounds: historyNumber(row.rebounds),
      assists: historyNumber(row.assists),
      steals: historyNumber(row.steals),
      blocks: historyNumber(row.blocks),
      turnovers,
      points,
      fieldGoalPct:
        Number.isFinite(fgm) && Number.isFinite(fga) && fga > 0
          ? fgm / fga
          : Number.NaN,
      twoPointPct: twoPointPct(fgm, threePm, fga, threePa),
      threePointPct:
        Number.isFinite(threePm) && Number.isFinite(threePa) && threePa > 0
          ? threePm / threePa
          : Number.NaN,
      freeThrowPct:
        Number.isFinite(ftm) && Number.isFinite(fta) && fta > 0
          ? ftm / fta
          : Number.NaN,
      threePointAttemptRate: threePointAttemptRate(threePa, fga),
      freeThrowRate: freeThrowRate(fta, fga),
      turnoverPct: turnoverPct(turnovers, fga, fta) ?? Number.NaN,
      ...(efg != null ? { effectiveFieldGoalPct: efg } : {}),
      ...(ts != null ? { trueShootingPct: ts } : {}),
      r1Points: null,
      r1WinEquivalents: null,
    });
  });
}

/**
 * Preserve current franchise identity during the offseason without a 30-team
 * roster crawl. ESPN's athlete profile already carries the current team id;
 * synthesize only the explicit zero-GP preseason shell from that profile.
 */
function overlayProfileTeamForPreseason(
  routePlayerId: string,
  rows: PlayerSeason[],
  player: Player | null
): PlayerSeason[] {
  const season = canonicalSeasonFromStartYear(currentNbaStartYear());
  if (!isPreseasonRosterSeason(season) || !player?.currentTeamId) return rows;

  const teamId = String(player.currentTeamId).trim();
  if (!teamId) return rows;
  const canonical = resolveCanonicalTeam(teamId);
  const teamName =
    canonical.status === "resolved"
      ? canonical.team.displayName
      : teamId;
  const teamAbbreviation =
    canonical.status === "resolved" ? canonical.team.abbr : undefined;
  const existingIndex = rows.findIndex((row) => row.season === season);
  const existing = existingIndex >= 0 ? rows[existingIndex]! : null;

  // Never overwrite a season that has actual games.
  if (existing && Number.isFinite(existing.gamesPlayed) && existing.gamesPlayed > 0) {
    return rows;
  }

  const playerName =
    firstUsablePlayerDisplayName(
      player.fullName,
      existing?.playerName,
      rows[0]?.playerName
    ) ?? routePlayerId;
  const row = existing
    ? {
        ...existing,
        playerName,
        teamId,
        teamName,
        teamAbbreviation,
        teamIdProvider: "espn" as const,
        providerTeamId: teamId,
        position: player.position ?? existing.position,
        age: player.age ?? existing.age,
        gamesPlayed: 0,
        gamesStarted: 0,
        minutes: 0,
      }
    : withPlayerSeasonDefaults({
        playerId: routePlayerId,
        playerName,
        teamId,
        teamName,
        teamAbbreviation,
        teamIdProvider: "espn",
        providerTeamId: teamId,
        season,
        position: player.position,
        age: player.age,
        gamesPlayed: 0,
        gamesStarted: 0,
        minutes: 0,
      });

  if (existingIndex >= 0) {
    const next = [...rows];
    next[existingIndex] = row;
    return next;
  }
  return [row, ...rows];
}

/**
 * First-paint career loader for `/players/[playerId]`.
 *
 * On Vercel: prefer in-repo history immediately when present, and only wait a
 * short budget for live ESPN so cold TTFB stays bounded.
 */
export async function getPlayerCriticalCareerSeasons(
  playerId: string
): Promise<PlayerSeason[]> {
  const identity = await resolvePlayerIdentityCached(playerId).catch(() => null);
  const provider = getDataProvider();
  const statsId = identity?.nbaId ?? playerId;
  const lookupIds = uniquePlayerIds(
    identity?.nbaId,
    playerId,
    identity?.espnId
  );
  const history = historyCareerFallback(playerId, lookupIds);

  const loadCareer = async (id: string): Promise<PlayerSeason[]> =>
    typeof provider.getPlayerCareerSeasons === "function"
      ? provider.getPlayerCareerSeasons(id).catch(() => [])
      : [];

  const loadLive = async (): Promise<{
    rows: PlayerSeason[];
    player: Player | null;
  }> => {
    let [rows, player] = await Promise.all([
      loadCareer(statsId),
      provider.getPlayer(statsId).catch(() => null),
    ]);

    if (rows.length === 0 && statsId !== playerId) {
      const [fallbackRows, fallbackPlayer] = await Promise.all([
        loadCareer(playerId),
        player
          ? Promise.resolve(null)
          : provider.getPlayer(playerId).catch(() => null),
      ]);
      rows = fallbackRows;
      player = player ?? fallbackPlayer;
    }
    return { rows, player };
  };

  const finalize = (
    rowsIn: PlayerSeason[],
    player: Player | null
  ): PlayerSeason[] => {
    let rows = overlayProfileTeamForPreseason(playerId, rowsIn, player);
    const resolvedName = firstUsablePlayerDisplayName(
      identity?.displayName,
      player?.fullName
    );
    if (resolvedName) {
      rows = rows.map((row) =>
        isSyntheticPlayerDisplayName(row.playerName)
          ? { ...row, playerName: resolvedName }
          : row
      );
    }
    return rows.sort((a, b) =>
      a.season === b.season
        ? (a.teamAbbreviation ?? a.teamId).localeCompare(
            b.teamAbbreviation ?? b.teamId
          )
        : b.season.localeCompare(a.season)
    );
  };

  if (isVercelRuntime() && history.length > 0) {
    const budgetMs = runtimeTimeoutMs(6_000, 2_000);
    try {
      const live = await Promise.race([
        loadLive(),
        new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), budgetMs)
        ),
      ]);
      if (live && live.rows.length > 0) {
        return finalize(live.rows, live.player);
      }
    } catch {
      // fall through to history
    }
    return finalize(history, null);
  }

  const live = await loadLive();
  const rows =
    live.rows.length > 0 ? live.rows : history.length > 0 ? history : [];
  return finalize(rows, live.player);
}
