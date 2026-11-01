import { careerProductionIndex, dedupeCareerSeasons } from "@/analytics/career-resume";
import {
  PlayerCareerBoard,
  type CareerBoardRow,
} from "@/components/players/player-career-board";
import { getPlayerPlayoffCareerSeasons } from "@/data/queries";
import { enrichPlayerCareerAdvancedCached } from "@/data/queries/request-cache";
import { hasValidDrblEstimate } from "@/data/queries/percentiles";
import type { PlayerSeason } from "@/data/types";
import { type PlayerSeasonKind } from "@/lib/player-destination";
import {
  isMultiTeamSeasonRow,
  multiTeamSeasonLabel,
} from "@/lib/player-team-context";
import {
  darkoDefense,
  darkoOffense,
  darkoTotal,
  finiteNum,
  publishedAdvanced,
} from "@/lib/player-stat-sheet-registry";
import type { ThemeMode } from "@/themes/era-theme";

function perGame(total: number, games: number) {
  return games > 0 ? total / games : 0;
}

function rate(n: number | null | undefined): number | null {
  return n != null && Number.isFinite(n) && n > 0 ? n : null;
}

export function toCareerBoardRows(career: PlayerSeason[]): CareerBoardRow[] {
  return dedupeCareerSeasons(career).map((row) => {
    const gp = row.gamesPlayed;
    const apg = perGame(row.assists, gp);
    const tpg = perGame(row.turnovers, gp);
    const drbl = hasValidDrblEstimate(row);
    return {
      season: row.season,
      teamId: row.teamId,
      teamAbbr: isMultiTeamSeasonRow(row)
        ? multiTeamSeasonLabel(row, career)
        : (row.teamAbbreviation ?? ""),
      gamesPlayed: gp,
      mpg: gp > 0 ? perGame(row.minutes, gp) : null,
      ppg: perGame(row.points, gp),
      apg,
      rpg: perGame(row.rebounds, gp),
      orpg: finiteNum(perGame(row.offensiveRebounds, gp)),
      drpg: finiteNum(perGame(row.defensiveRebounds, gp)),
      spg: finiteNum(perGame(row.steals, gp)),
      bpg: finiteNum(perGame(row.blocks, gp)),
      tov: finiteNum(tpg),
      pf: finiteNum(perGame(row.personalFouls, gp)),
      atr: tpg > 0 ? apg / tpg : null,
      fgPct: rate(row.fieldGoalPct),
      twoPct: rate(row.twoPointPct),
      threePct: rate(row.threePointPct),
      ftPct: rate(row.freeThrowPct),
      efg: rate(row.effectiveFieldGoalPct),
      ts: rate(row.trueShootingPct),
      usg: rate(row.usagePct),
      threePar: rate(row.threePointAttemptRate),
      ftr: rate(row.freeThrowRate),
      ortg: rate(row.offensiveRating),
      drtg:
        rate(row.offensiveRating) != null &&
        row.defensiveRating != null &&
        row.defensiveRating > 0
          ? finiteNum(row.defensiveRating)
          : null,
      net:
        rate(row.offensiveRating) != null &&
        row.defensiveRating != null &&
        row.defensiveRating > 0
          ? finiteNum(row.netRating)
          : null,
      // Career totals zero-fill BRef/Advanced until overlay — never show fake 0.0
      per: publishedAdvanced(row.per),
      bpm: publishedAdvanced(row.bpm),
      vorp: publishedAdvanced(row.vorp),
      ws: publishedAdvanced(row.winShares),
      cpi: careerProductionIndex(row),
      darko: darkoTotal(row),
      darkoOff: darkoOffense(row),
      darkoDef: darkoDefense(row),
      raptor: finiteNum(row.raptor),
      oRaptor: finiteNum(row.oRaptor),
      dRaptor: finiteNum(row.dRaptor),
      winsAdded: finiteNum(row.winsAdded),
      war1: finiteNum(row.r1WinEquivalents),
      drbl100: drbl ? finiteNum(row.drbl100) : null,
      drblO: drbl ? finiteNum(row.drblO) : null,
      drblD: drbl ? finiteNum(row.drblD) : null,
    };
  });
}

function pickCompare(seasons: string[], season: string, requested?: string) {
  if (requested && requested !== season && seasons.includes(requested)) {
    return requested;
  }
  return seasons.find((option) => option !== season) ?? season;
}

function hasDarko(rows: PlayerSeason[]) {
  return rows.some(
    (row) => row.darkoDpm != null && Number.isFinite(row.darkoDpm)
  );
}

function hasWar1(rows: PlayerSeason[]) {
  return rows.some(
    (row) =>
      row.r1WinEquivalents != null && Number.isFinite(row.r1WinEquivalents)
  );
}

export async function PlayerCareerIsland({
  playerId,
  season,
  seasonType,
  career,
  compareSeason,
  teamKey,
  fromHistory = false,
  themeMode = "historical",
  chart = "seasons",
  hideTitle = false,
  initialMetric,
  showFilters = true,
}: {
  playerId: string;
  season: string;
  seasonType: PlayerSeasonKind;
  career: PlayerSeason[];
  compareSeason?: string;
  teamKey?: string | null;
  fromHistory?: boolean;
  themeMode?: ThemeMode;
  chart?: "seasons" | "games";
  hideTitle?: boolean;
  initialMetric?: "darko" | "war1" | "ppg" | "apg" | "rpg" | "ts" | "usg";
  showFilters?: boolean;
}) {
  // Keep enrich off the outer try/catch. Prod was falling through to raw career
  // (PTS only, no DARKO/WAR1 chips) when later game-log fan-out tripped CF limits.
  let source = career;
  try {
    source =
      seasonType === "playoffs"
        ? await getPlayerPlayoffCareerSeasons(playerId).catch(() => career)
        : await enrichPlayerCareerAdvancedCached(playerId, career).catch(
            () => career
          );
  } catch {
    source = career;
  }

  // Full enrich can soft-fail on Workers and still return box scores. Patch
  // impact from local bundles when DARKO/WAR1 never landed.
  if (
    seasonType !== "playoffs" &&
    (!hasDarko(source) || !hasWar1(source))
  ) {
    try {
      const { attachBundledBrefDarkoRaptor, attachDrblToPlayerSeasons } =
        await import("@/data/queries/players");
      if (!hasDarko(source)) {
        source = await attachBundledBrefDarkoRaptor(playerId, source);
      }
      if (!hasWar1(source)) {
        source = await attachDrblToPlayerSeasons(playerId, source).catch(
          () => source
        );
      }
    } catch {
      /* keep source */
    }
  }

  const filtered = source.filter((row) => {
    if (row.gamesPlayed > 0) return true;
    return Boolean(
      row.per ||
        row.vorp ||
        row.winShares ||
        row.points ||
        row.offensiveRating
    );
  });
  const rows = toCareerBoardRows(filtered);
  const seasons = rows.map((row) => row.season);
  const compare = pickCompare(seasons, season, compareSeason);
  const recent = [...rows].sort((a, b) => b.season.localeCompare(a.season));
  // Game-dot mode needs the bake. Skip on seasons default so Workers do not
  // fan out empty ASSETS/R2 lookups for every career season.
  const gameLogs =
    chart === "games"
      ? await loadCareerGameLogs(
          playerId,
          recent.map((row) => row.season)
        ).catch(() => [])
      : [];
  const preferDarko =
    initialMetric ??
    (rows.some((row) => row.darko != null) ? "darko" : undefined);

  return (
    <PlayerCareerBoard
      key={`${playerId}:${seasonType}`}
      playerId={playerId}
      season={season}
      seasonType={seasonType}
      rows={rows}
      compareSeason={compare}
      teamKey={teamKey}
      fromHistory={fromHistory}
      themeMode={themeMode}
      gameLogs={gameLogs}
      chart={chart}
      hideTitle={hideTitle}
      initialMetric={preferDarko}
      showFilters={showFilters}
    />
  );
}

async function loadCareerGameLogs(playerId: string, seasons: string[]) {
  const [{ resolvePlayerSeasonGameLog }, { resolveNbaIdForDrbl }] =
    await Promise.all([
      import("@/data/runtime/player-game-logs-store"),
      import("@/data/identity/player-identity"),
    ]);
  const nbaId = await resolveNbaIdForDrbl(playerId).catch(() => null);
  const logs = await Promise.all(
    seasons.map((season) =>
      resolvePlayerSeasonGameLog({
        season,
        playerId,
        nbaId,
      }).catch(() => [])
    )
  );
  return logs.flat();
}
