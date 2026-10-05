/**
 * Baked contract surplus estimates, keyed by ESPN team id and BRef player id.
 * Written by scripts/build-contract-value.ts.
 */
import snapshot from "./contract-value-snapshot.json";

type YearRow = [string, number, number, number, number, number, number, number, 0 | 1];

type ValuedRow = {
  team: string;
  years: YearRow[];
  salary: number;
  worth: number;
  surplus: number;
  low: number;
  high: number;
  basis: { seasons: string[]; possessions: number };
  pct: number;
};

export type ContractValueGap = "no-drbl" | "thin" | "waived";

type MissingRow = { team: string; reason: ContractValueGap };

export type ContractValueModel = {
  lastSeason: string;
  capSeason: string;
  capSeasonCap: number;
  pricePerWinShare: number;
  priceSeasons: string[];
  replacementMaxShare: number;
  capGrowth: number;
  capKnownThrough: string;
  contracts: number;
  backtest: Array<{ horizon: number; n: number; rmse: number; naiveRmse: number; coverage80: number }>;
};

type SnapshotFile = {
  generatedAt: string;
  model: ContractValueModel;
  players: Record<string, ValuedRow | MissingRow>;
};

const data = snapshot as unknown as SnapshotFile;

export type ContractValueYear = {
  season: string;
  salary: number;
  worthLow: number;
  worth: number;
  worthHigh: number;
  surplus: number;
  wins: number;
  winsSd: number;
  worthAboveMax: boolean;
};

export type ContractValueView =
  | {
      kind: "estimate";
      years: ContractValueYear[];
      totalSalary: number;
      totalWorth: number;
      surplus: number;
      surplusLow: number;
      surplusHigh: number;
      percentile: number;
      basisSeasons: string[];
      basisPossessions: number;
    }
  | { kind: "missing"; reason: ContractValueGap };

export function contractValueModel(): ContractValueModel {
  return data.model;
}

export function getContractValue(teamId: string, brefId: string): ContractValueView | null {
  const row = data.players[`${teamId}:${brefId}`];
  if (!row) return null;
  if ("reason" in row) return { kind: "missing", reason: row.reason };
  return {
    kind: "estimate",
    years: row.years.map(([season, salary, worthLow, worth, worthHigh, surplus, wins, winsSd, aboveMax]) => ({
      season,
      salary,
      worthLow,
      worth,
      worthHigh,
      surplus,
      wins,
      winsSd,
      worthAboveMax: aboveMax === 1,
    })),
    totalSalary: row.salary,
    totalWorth: row.worth,
    surplus: row.surplus,
    surplusLow: row.low,
    surplusHigh: row.high,
    percentile: row.pct,
    basisSeasons: row.basis.seasons,
    basisPossessions: row.basis.possessions,
  };
}
