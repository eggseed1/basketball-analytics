import { resolvePlayerIdentityCached } from "@/data/identity/player-identity-cache";
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
import { withPlayerSeasonDefaults } from "@/data/transformers/player-season-defaults";
import type { PlayerSeason } from "@/data/types";
import {
  firstUsablePlayerDisplayName,
  isSyntheticPlayerDisplayName,
} from "@/lib/player-display-name";

function historyNumber(value: number | null | undefined): number {
  return value == null ? Number.NaN : value;
}

function historyCareerFallback(playerId: string): PlayerSeason[] {
  return getUniverseSeasonsForPlayer(playerId).map((row) => {
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
      playerId: row.playerId,
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
 * First-paint career loader for `/players/[playerId]`.
 *
 * It intentionally excludes live DARKO, league-wide roster discovery, and
 * other optional overlays. Those belong in Suspense islands; the identity
 * shell only needs factual career counting rows and team/season context.
 */
export async function getPlayerCriticalCareerSeasons(
  playerId: string
): Promise<PlayerSeason[]> {
  const identity = await resolvePlayerIdentityCached(playerId).catch(() => null);
  const provider = getDataProvider();
  const statsId = identity?.nbaId ?? playerId;

  let rows =
    typeof provider.getPlayerCareerSeasons === "function"
      ? await provider.getPlayerCareerSeasons(statsId).catch(() => [])
      : [];

  if (
    rows.length === 0 &&
    statsId !== playerId &&
    typeof provider.getPlayerCareerSeasons === "function"
  ) {
    rows = await provider.getPlayerCareerSeasons(playerId).catch(() => []);
  }

  if (rows.length === 0) {
    rows = historyCareerFallback(playerId);
  }

  const resolvedName = firstUsablePlayerDisplayName(identity?.displayName);
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
}
