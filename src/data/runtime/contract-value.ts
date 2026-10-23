/**
 * Baked contract surplus estimates, keyed by ESPN team id and BRef player id.
 * Written by scripts/build-contract-value.ts.
 * Lives under public/runtime (ASSETS) so the ~140KB JSON stays off the Worker.
 */
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
  /** Salary prior used when projecting: WAR1 per possession = intercept + slope × cap share. */
  priorByShare?: { intercept: number; slope: number; maxShare: number } | null;
  /** Past seasons projected from DRBL/100 mapped onto WAR1, mixed with WAR1 by drblShare. Null when WAR1 only. */
  projectionBasis?: { drblShare: number; intercept: number; slope: number } | null;
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

type AssetsFetcher = {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

const ASSET_PATH = "/runtime/contract-value-snapshot.json";

let data: SnapshotFile | null | undefined;

function cloudflareAssets(): AssetsFetcher | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCloudflareContext } = require("@opennextjs/cloudflare") as {
      getCloudflareContext: () => { env?: { ASSETS?: AssetsFetcher } };
    };
    return getCloudflareContext()?.env?.ASSETS ?? null;
  } catch {
    return null;
  }
}

function loadFromPublicDir(): SnapshotFile | null {
  try {
    if (process.env.NEXT_RUNTIME === "edge") return null;
    // eslint-disable-next-line no-eval
    const req = eval("require") as NodeRequire;
    const fs = req("node:fs") as typeof import("node:fs");
    const path = req("node:path") as typeof import("node:path");
    const file = path.join(
      process.cwd(),
      "public",
      "runtime",
      "contract-value-snapshot.json"
    );
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8")) as SnapshotFile;
  } catch {
    return null;
  }
}

async function loadFromAssets(): Promise<SnapshotFile | null> {
  try {
    const assets = cloudflareAssets();
    if (!assets) return null;
    const response = await assets.fetch(`https://assets.local${ASSET_PATH}`);
    if (!response.ok) return null;
    return (await response.json()) as SnapshotFile;
  } catch {
    return null;
  }
}

function apply(file: SnapshotFile | null): boolean {
  data = file;
  clearTeamValuesCache();
  return file != null;
}

function tryPrimeFromDisk(): void {
  if (data !== undefined) return;
  const file = loadFromPublicDir();
  if (file) apply(file);
}

export async function ensureContractValue(): Promise<boolean> {
  if (data !== undefined) return data != null;
  const fromDisk = loadFromPublicDir();
  if (fromDisk) return apply(fromDisk);
  return apply(await loadFromAssets());
}

function requireData(): SnapshotFile {
  tryPrimeFromDisk();
  if (!data) {
    return {
      generatedAt: "",
      model: {
        lastSeason: "",
        capSeason: "",
        capSeasonCap: 0,
        pricePerWinShare: 0,
        priceSeasons: [],
        replacementMaxShare: 0,
        capGrowth: 0,
        capKnownThrough: "",
        contracts: 0,
        weights: [],
        backtest: [],
        outOfSample: { fitThrough: [], checkedThrough: "", byHorizon: [] },
      },
      players: {},
    };
  }
  return data;
}

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
  return requireData().model;
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

function clearTeamValuesCache(): void {
  teamValues = null;
}

function buildTeamValues(): Map<string, TeamContractValue> {
  const byTeam = new Map<string, TeamContractValue>();
  for (const [key, row] of Object.entries(requireData().players)) {
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

export type ContractValueEntry = {
  teamId: string;
  brefId: string;
  salary: number;
  worth: number;
  surplus: number;
  surplusLow: number;
  surplusHigh: number;
  percentile: number;
  seasons: string[];
};

/** Every valued contract in the league. Contracts we couldn't value are left out. */
export function listContractValues(): ContractValueEntry[] {
  const out: ContractValueEntry[] = [];
  for (const [key, row] of Object.entries(requireData().players)) {
    if ("reason" in row) continue;
    out.push({
      teamId: row.team,
      brefId: key.slice(key.indexOf(":") + 1),
      salary: row.salary,
      worth: row.worth,
      surplus: row.surplus,
      surplusLow: row.low,
      surplusHigh: row.high,
      percentile: row.pct,
      seasons: row.years.map((y) => y[0]),
    });
  }
  return out;
}

/** Contracts left out of every surplus ranking, by reason. */
export function contractValueGaps(): Record<ContractValueGap, number> {
  const counts: Record<ContractValueGap, number> = { "no-drbl": 0, thin: 0, waived: 0 };
  for (const row of Object.values(requireData().players))
    if ("reason" in row) counts[row.reason] += 1;
  return counts;
}

export function getContractValue(teamId: string, brefId: string): ContractValueView | null {
  const row = requireData().players[`${teamId}:${brefId}`];
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
