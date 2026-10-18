/**
 * Next-season WAR1 for the current roster.
 * Same projection as the player-page contract model (weights, shrinkage, aging,
 * minutes), stopped before the replacement shift. Zero stays an average player,
 * so the roster sum can sit on the 40.2 + 1.31 line.
 */
import { P1_POINTS_PER_WIN } from "@/lib/drbl-public-labels";
import { normalizePlayerName } from "@/lib/player-name";
import {
  baseRate,
  projectSeasons,
  seasonStartYear,
  type ProjectionParams,
  type SeasonLine,
} from "@/contracts/value-model";
import { isProductionApprovedPlayerAlias, type PlayerIdAliasIndex } from "@/data/providers/impact/player-id-aliases";
import { bundledContractTeamIds, bundledTeamContracts } from "@/data/runtime/bref-team-contracts";
import { contractValueModel } from "@/data/runtime/contract-value";
import { bundledDrblOverlayMeta, getBundledDrblSeason } from "@/data/runtime/drbl-overlay-snapshot";
import type { RosterWarSourceRow } from "@/lib/team-roster-war1";

/** Matches the contract bake: a thinner recent sample is left unprojected. */
const MIN_RECENT_POSSESSIONS = 500;
/** 2020-21 is put on an 82-game basis so the short season is not lost minutes. */
const SEASON_GAMES: Record<string, number> = { "2020-21": 72 };

type BakedModel = {
  lastSeason: string;
  capSeason: string;
  capSeasonCap: number;
  weights: number[];
  regressionPossessions: number;
  priorByShare?: { intercept: number; slope: number; maxShare: number } | null;
  leaguePer1000: number;
  replacementPer1000: number;
  projectionBasis?: { drblShare: number; intercept: number; slope: number } | null;
  aging: ProjectionParams["aging"];
  possessions: ProjectionParams["possessions"];
  errorByHorizon: ProjectionParams["errorByHorizon"];
};

export type ProjectedRosterWar1 = {
  war1: number;
  possessions: number;
  /** The contract card's wins, above a minimum-salary player. */
  winsAboveReplacement: number;
};

export function projectionParamsFromModel(model: BakedModel): ProjectionParams {
  const basis = model.projectionBasis;
  return {
    weights: model.weights,
    regressionPossessions: model.regressionPossessions,
    leagueRate: model.leaguePer1000 / 1000,
    priorByShare: model.priorByShare ?? undefined,
    drblBasis: basis
      ? { intercept: basis.intercept, slope: basis.slope, share: basis.drblShare }
      : undefined,
    replacementRate: model.replacementPer1000 / 1000,
    aging: model.aging,
    possessions: model.possessions,
    errorByHorizon: model.errorByHorizon,
  };
}

/** WAR1 for one future season. Null when the history window is empty. */
export function projectedWar1AboveAverage(
  history: SeasonLine[],
  lastObservedStartYear: number,
  ageAtLastObserved: number,
  targetStartYear: number,
  salaryShare: number,
  params: ProjectionParams
): ProjectedRosterWar1 | null {
  const base = baseRate(history, lastObservedStartYear, params, salaryShare);
  if (!base || base.recentPossessions < MIN_RECENT_POSSESSIONS) return null;
  const projected = projectSeasons(
    history,
    lastObservedStartYear,
    ageAtLastObserved,
    [targetStartYear],
    new Map([[targetStartYear, salaryShare]]),
    params
  )?.[0];
  if (!projected) return null;
  return {
    war1: projected.wins + params.replacementRate * projected.possessions,
    possessions: projected.possessions,
    winsAboveReplacement: projected.wins,
  };
}

export function seasonLineOn82Games(
  season: string,
  possessions: number,
  war1: number,
  drbl100: number | null
): SeasonLine {
  const scale = 82 / (SEASON_GAMES[season] ?? 82);
  const scaledPossessions = possessions * scale;
  const scaledWar1 = war1 * scale;
  return {
    season,
    possessions: scaledPossessions,
    war1: scaledWar1,
    drblWins:
      drbl100 != null && Number.isFinite(drbl100)
        ? (drbl100 * scaledPossessions) / 100 / P1_POINTS_PER_WIN
        : null,
    age: null,
  };
}

type Deal = {
  age: number;
  capSeason: string;
  salaryBySeason: Map<string, number>;
  waived: boolean;
};

let historyCache: Map<string, SeasonLine[]> | null = null;
let dealCache: { byBref: Map<string, Deal>; byName: Map<string, Deal[]> } | null = null;

function warHistories(): Map<string, SeasonLine[]> {
  if (historyCache) return historyCache;
  const histories = new Map<string, SeasonLine[]>();
  for (const season of bundledDrblOverlayMeta().seasons) {
    for (const row of getBundledDrblSeason(season)) {
      const war1 = row.r1WinEquivalents;
      if (war1 == null || !Number.isFinite(war1) || !Number.isFinite(row.possessions)) continue;
      const line = seasonLineOn82Games(season, row.possessions, war1, row.drbl100);
      const list = histories.get(row.playerId) ?? [];
      const existing = list.findIndex((item) => item.season === season);
      if (existing >= 0) {
        if (line.possessions > list[existing].possessions) list[existing] = line;
      } else {
        list.push(line);
      }
      histories.set(row.playerId, list);
    }
  }
  historyCache = histories;
  return histories;
}

function deals(): { byBref: Map<string, Deal>; byName: Map<string, Deal[]> } {
  if (dealCache) return dealCache;
  const byBref = new Map<string, Deal>();
  const byName = new Map<string, Deal[]>();
  for (const teamId of bundledContractTeamIds()) {
    const team = bundledTeamContracts(teamId);
    if (!team) continue;
    const capSeason = team.capSeason ?? team.seasons[0];
    if (!capSeason) continue;
    for (const row of team.rows) {
      if (row.age == null || !row.brefId) continue;
      const salaryBySeason = new Map<string, number>();
      row.years.forEach((cell, index) => {
        const season = team.seasons[index];
        if (!cell || !season || !Number.isFinite(cell.amount)) return;
        salaryBySeason.set(season, cell.amount);
      });
      const deal: Deal = {
        age: row.age,
        capSeason,
        salaryBySeason,
        waived: /^Waived\b/.test(team.notes[row.brefId] ?? ""),
      };
      const slug = row.brefId.toLowerCase();
      const previous = byBref.get(slug);
      const pricedSeason = contractValueModel().capSeason;
      const better =
        !previous ||
        (previous.waived && !deal.waived) ||
        (!deal.waived &&
          !previous.salaryBySeason.has(pricedSeason) &&
          deal.salaryBySeason.has(pricedSeason));
      if (better) byBref.set(slug, deal);
      const name = normalizePlayerName(row.name);
      const named = byName.get(name) ?? [];
      named.push(deal);
      byName.set(name, named);
    }
  }
  dealCache = { byBref, byName };
  return dealCache;
}

function dealFor(alias: { brefSlug?: string; playerName?: string }, name: string): Deal | null {
  const index = deals();
  const slug = alias.brefSlug?.trim().toLowerCase();
  const bySlug = slug ? index.byBref.get(slug) : null;
  if (bySlug && !bySlug.waived) return bySlug;
  const named = index.byName.get(normalizePlayerName(name)) ?? [];
  const open = named.filter((deal) => !deal.waived);
  return open.length === 1 ? open[0] : null;
}

/** Project one roster player. Null when salary, age, or a usable DRBL history is missing. */
export function projectRosterPlayer(
  nbaPlayerId: string,
  deal: { age: number; capSeason: string; salary: number } | null
): ProjectedRosterWar1 | null {
  const model = contractValueModel() as BakedModel;
  if (!deal || deal.salary <= 0 || model.capSeasonCap <= 0) return null;
  if (model.capSeason !== deal.capSeason) return null;
  const history = warHistories().get(nbaPlayerId);
  if (!history?.length) return null;
  const lastStart = seasonStartYear(model.lastSeason);
  const targetStart = seasonStartYear(model.capSeason);
  const ageAtLast = deal.age - (targetStart - lastStart);
  if (!Number.isFinite(ageAtLast) || ageAtLast < 18 || ageAtLast > 50) return null;
  return projectedWar1AboveAverage(
    history,
    lastStart,
    ageAtLast,
    targetStart,
    deal.salary / model.capSeasonCap,
    projectionParamsFromModel(model)
  );
}

/**
 * Published-shaped rows whose WAR1 is the coming season's projection.
 * Players with no projection are omitted so the roster builder can count them as missing.
 */
export function projectedRosterWarRows(
  slots: readonly { espnId: string; name: string }[],
  aliases: PlayerIdAliasIndex
): RosterWarSourceRow[] {
  const rows: RosterWarSourceRow[] = [];
  const seen = new Set<string>();
  for (const slot of slots) {
    const espnId = slot.espnId.trim();
    if (!espnId || seen.has(espnId)) continue;
    const alias = aliases.byEspn.get(espnId);
    if (!alias || !isProductionApprovedPlayerAlias(alias)) continue;
    const deal = dealFor(alias, slot.name);
    const salary = deal?.salaryBySeason.get(contractValueModel().capSeason);
    const projected = projectRosterPlayer(
      alias.nbaPlayerId,
      deal && salary != null ? { age: deal.age, capSeason: deal.capSeason, salary } : null
    );
    if (!projected) continue;
    seen.add(espnId);
    rows.push({
      playerId: alias.nbaPlayerId,
      playerName: slot.name.trim() || alias.playerName || alias.nbaPlayerId,
      teamId: "",
      drbl100: null,
      r1Points: null,
      r1WinEquivalents: projected.war1,
    });
  }
  return rows;
}
