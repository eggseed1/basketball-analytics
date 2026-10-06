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
  weights: number[];
  backtest: Array<{ horizon: number; n: number; rmse: number; naiveRmse: number; coverage80: number }>;
  /** Refit as of past seasons and scored on the salaries paid afterward. */
  outOfSample: {
    fitThrough: string[];
    checkedThrough: string;
    byHorizon: Array<{
      horizon: number;
      n: number;
      rmseWins: number;
      repeatRmseWins: number;
      aboveHigh: number;
      belowLow: number;
      corr: number;
    }>;
  };
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

export type TeamContractValuePlayer = {
  brefId: string;
  surplus: number;
  surplusLow: number;
  surplusHigh: number;
  totalSalary: number;
  totalWorth: number;
};

export type TeamContractValue = {
  /** Sum of each valued contract's middle estimate. */
  surplus: number;
  totalSalary: number;
  totalWorth: number;
  /** 1 is the most surplus in the league. */
  rank: number;
  teams: number;
  players: TeamContractValuePlayer[];
  /** Contracts left out of the sum, by reason. They are not counted as zero. */
  missing: Array<{ brefId: string; reason: ContractValueGap }>;
};

let teamValues: Map<string, TeamContractValue> | null = null;

function buildTeamValues(): Map<string, TeamContractValue> {
  const byTeam = new Map<string, TeamContractValue>();
  for (const [key, row] of Object.entries(data.players)) {
    const brefId = key.slice(key.indexOf(":") + 1);
    let team = byTeam.get(row.team);
    if (!team) {
      team = { surplus: 0, totalSalary: 0, totalWorth: 0, rank: 0, teams: 0, players: [], missing: [] };
      byTeam.set(row.team, team);
    }
    if ("reason" in row) {
      team.missing.push({ brefId, reason: row.reason });
      continue;
    }
    team.surplus += row.surplus;
    team.totalSalary += row.salary;
    team.totalWorth += row.worth;
    team.players.push({
      brefId,
      surplus: row.surplus,
      surplusLow: row.low,
      surplusHigh: row.high,
      totalSalary: row.salary,
      totalWorth: row.worth,
    });
  }
  const ranked = [...byTeam.values()].filter((t) => t.players.length).sort((a, b) => b.surplus - a.surplus);
  ranked.forEach((team, i) => {
    team.rank = i + 1;
    team.teams = ranked.length;
    team.players.sort((a, b) => b.surplus - a.surplus);
  });
  return byTeam;
}

/** Every contract on one team's books, summed. Null when none could be valued. */
export function getTeamContractValue(teamId: string): TeamContractValue | null {
  teamValues ??= buildTeamValues();
  const team = teamValues.get(teamId);
  return team?.players.length ? team : null;
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
