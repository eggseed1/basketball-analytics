/**
 * Site-backed RealNBADataProvider - ESPN player seasons + impact overlays + CBA.
 * Draft / awards / transactions are stubbed until dedicated feeds land.
 */

import { getHistoricalPlayerSeasons } from "@/data/queries/historical";
import {
  canonicalSeasonFromStartYear,
  startYearFromCanonicalSeason,
} from "@/data/providers/historical/season-range";
import { FRANCHISES } from "@/gm/seed/franchises";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { getCbaRules } from "@/gm/myleague/cba-registry";
import { ESPN_PLAYER_SEASON_HORIZON_START } from "@/gm/myleague/constants";
import { makeProvenance } from "@/gm/myleague/historical-universe";
import { resolvePlayerContract } from "@/gm/seed/contracts";
import { salaryMapForSeason } from "@/data/providers/salaries/salary-store";
import type {
  AwardData,
  ContractData,
  DraftProspectData,
  DraftResultData,
  LeagueRulesData,
  PlayerData,
  RealNBADataProvider,
  RosterData,
  SalaryCapData,
  SeasonData,
  SeasonStatsData,
  SeasonYear,
  TeamData,
  TransactionData,
} from "@/gm/myleague/types";
import type { PlayerSeason } from "@/data/types";

/** Earliest season-start year we expect ESPN byathlete coverage for. */
export { ESPN_PLAYER_SEASON_HORIZON_START } from "@/gm/myleague/constants";

export function seasonEndToCanonical(seasonEndYear: SeasonYear): string {
  return canonicalSeasonFromStartYear(seasonEndYear - 1);
}

export function canonicalToSeasonEnd(canonical: string): SeasonYear {
  return startYearFromCanonicalSeason(canonical) + 1;
}

export class SiteRealNBADataProvider implements RealNBADataProvider {
  readonly id = "espn+darko+raptor";
  private statsCache = new Map<SeasonYear, Promise<PlayerSeason[]>>();

  private provenance(season: SeasonYear, quality: "mixed" | "estimated" | "authoritative" = "mixed") {
    return makeProvenance(season, this.id, quality);
  }

  private async loadStats(season: SeasonYear): Promise<PlayerSeason[]> {
    const existing = this.statsCache.get(season);
    if (existing) return existing;
    const canonical = seasonEndToCanonical(season);
    const promise = getHistoricalPlayerSeasons(canonical);
    this.statsCache.set(season, promise);
    return promise;
  }

  async getSeason(season: SeasonYear): Promise<SeasonData> {
    return {
      season,
      label: seasonEndToCanonical(season),
      provenance: this.provenance(season),
    };
  }

  async getTeams(season: SeasonYear): Promise<TeamData[]> {
    const provenance = this.provenance(season, "authoritative");
    return FRANCHISES.map((f) => ({
      id: f.id,
      abbrev: f.abbr,
      city: f.city,
      name: f.name,
      conference: f.conference,
      division: f.division,
      provenance,
    }));
  }

  async getPlayers(season: SeasonYear): Promise<PlayerData[]> {
    const rows = await this.deduped(season);
    const provenance = this.provenance(season);
    return rows.map((row) => ({
      id: row.playerId,
      name: row.playerName,
      position: row.position,
      provenance,
    }));
  }

  async getRosters(season: SeasonYear): Promise<RosterData[]> {
    const rows = await this.deduped(season);
    const provenance = this.provenance(season);
    const map = new Map<string, string[]>();
    for (const row of rows) {
      const brand =
        resolveTeamBrand(row.teamId) ?? resolveTeamBrand(row.teamName);
      if (!brand) continue;
      const list = map.get(brand.id) ?? [];
      list.push(row.playerId);
      map.set(brand.id, list);
    }
    return [...map.entries()].map(([teamId, playerIds]) => ({
      season,
      teamId,
      playerIds,
      provenance,
    }));
  }

  async getContracts(season: SeasonYear): Promise<ContractData[]> {
    const rows = await this.deduped(season);
    const cap = getCbaRules(season);
    const salaryByName = salaryMapForSeason(season - 1);
    const contracts: ContractData[] = [];
    for (const row of rows) {
      const brand =
        resolveTeamBrand(row.teamId) ?? resolveTeamBrand(row.teamName);
      if (!brand) continue;
      const impact = row.darkoDpm ?? row.raptor ?? 0;
      const { contract, source } = resolvePlayerContract({
        playerName: row.playerName,
        seasonStartYear: season - 1,
        seasonEndYear: season,
        impact,
        cap,
        salaryByName,
      });
      contracts.push({
        id: `c_${row.playerId}_${season}`,
        playerId: row.playerId,
        teamId: brand.id,
        startSeason: contract.signedSeason,
        endSeason: contract.signedSeason + contract.yearsRemaining - 1,
        salaries: Array.from(
          { length: contract.yearsRemaining },
          () => contract.annualSalaryM
        ),
        provenance: this.provenance(
          season,
          source === "csv" ? "authoritative" : "estimated"
        ),
      });
    }
    return contracts;
  }

  async getDraftClass(draftYear: number): Promise<DraftProspectData[]> {
    return [];
  }

  async getDraft(draftYear: number): Promise<DraftResultData> {
    return {
      draftYear,
      picks: [],
      provenance: this.provenance(draftYear, "estimated"),
    };
  }

  async getTransactions(season: SeasonYear): Promise<TransactionData[]> {
    return [];
  }

  async getSalaryCap(season: SeasonYear): Promise<SalaryCapData> {
    const rules = getCbaRules(season);
    return {
      season,
      salaryCapM: rules.salaryCapM,
      luxuryTaxM: rules.luxuryTaxM,
      firstApronM: rules.firstApronM,
      secondApronM: rules.secondApronM,
      provenance: this.provenance(season, "authoritative"),
    };
  }

  async getLeagueRules(season: SeasonYear): Promise<LeagueRulesData> {
    return {
      season,
      rules: getCbaRules(season),
      provenance: this.provenance(season, "authoritative"),
    };
  }

  async getAwards(season: SeasonYear): Promise<AwardData> {
    return {
      season,
      awards: [],
      provenance: this.provenance(season, "estimated"),
    };
  }

  async getStats(season: SeasonYear): Promise<SeasonStatsData> {
    const players = await this.loadStats(season);
    return {
      season,
      players,
      teams: [],
      provenance: this.provenance(season),
    };
  }

  /** Deduped player-season rows (highest minutes). */
  async getPlayerSeasonRows(season: SeasonYear): Promise<PlayerSeason[]> {
    return this.deduped(season);
  }

  private async deduped(season: SeasonYear): Promise<PlayerSeason[]> {
    const rows = await this.loadStats(season);
    const best = new Map<string, PlayerSeason>();
    for (const row of rows) {
      const prev = best.get(row.playerId);
      if (!prev || row.minutes > prev.minutes) best.set(row.playerId, row);
    }
    return [...best.values()];
  }
}

export function createSiteRealNBADataProvider(): SiteRealNBADataProvider {
  return new SiteRealNBADataProvider();
}
