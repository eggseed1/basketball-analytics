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

/** Drop null metric fields — RSC still ships `"raptor":null` otherwise. */
function omitNullMetrics(row: CareerBoardRow): CareerBoardRow {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value !== null) out[key] = value;
  }
  return out as CareerBoardRow;
}

export function toCareerBoardRows(career: PlayerSeason[]): CareerBoardRow[] {
  return dedupeCareerSeasons(career).map((row) => {
    const gp = row.gamesPlayed;
    const apg = perGame(row.assists, gp);
    const tpg = perGame(row.turnovers, gp);
    const drbl = hasValidDrblEstimate(row);
    return omitNullMetrics({
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
    });
  });
}

function pickCompare(seasons: string[], season: string, requested?: string) {
  if (requested && requested !== season && seasons.includes(requested)) {
    return requested;
  }
  return seasons.find((option) => option !== season) ?? season;
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
  chart = "games",
  hideTitle = false,
  initialMetric,
  showFilters = true,
  /**
   * Overview critical path: skip the ~4s advanced enrich. Bundled career
   * already carries DARKO/basic cols for the chart; Career tab keeps `"full"`.
   */
  enrich = "full",
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
  enrich?: "full" | "fast";
}) {
  try {
    const source =
      seasonType === "playoffs"
        ? await getPlayerPlayoffCareerSeasons(playerId).catch(() => career)
        : enrich === "fast"
          ? career
          : await enrichPlayerCareerAdvancedCached(playerId, career).catch(
              () => career
            );
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
    const preferDarko =
      initialMetric ??
      (rows.some((row) => row.darko != null) ? "darko" : undefined);

    // Game dots hydrate on the client — embedding full career logs here used to
    // add ~200–300KB to the player-page RSC payload (500+ games for long careers).
    return (
      <PlayerCareerBoard
        playerId={playerId}
        season={season}
        seasonType={seasonType}
        rows={rows}
        compareSeason={compare}
        teamKey={teamKey}
        fromHistory={fromHistory}
        themeMode={themeMode}
        chart={chart}
        hideTitle={hideTitle}
        initialMetric={preferDarko}
        showFilters={showFilters}
      />
    );
  } catch {
    const rows = toCareerBoardRows(career);
    return (
      <PlayerCareerBoard
        playerId={playerId}
        season={season}
        seasonType={seasonType}
        rows={rows}
        compareSeason={season}
        teamKey={teamKey}
        fromHistory={fromHistory}
        themeMode={themeMode}
        chart={chart}
        hideTitle={hideTitle}
        showFilters={showFilters}
      />
    );
  }
}

